(function(){
"use strict";
const D=window.Deck, T=D.TEMPLATES;
const $=s=>document.querySelector(s), esc=D.esc;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clone=o=>JSON.parse(JSON.stringify(o));

/* janela do apresentador abre este mesmo arquivo com #presenter */
if(/^#presenter/.test(location.hash)) return presenterMode();

/* ---------- estado ---------- */
let decks={}, curId=null, sel=0, tab='content', player=null, db=null, assets=null, downloads=null;
let dirty=false, saveT=null, mode='local', saving=false, pendingSave=false;
let myThemes=[];                 // temas salvos pelo usuário
const remoteBase={};             // última versão vinda da nuvem (para mesclar)
let localIds=new Set();          // apresentações que já estavam salvas neste navegador
const LS='estudio-motion-decks';

function starter(){
  return {name:'Minha apresentação',theme:{preset:'eletrico'},footerText:'',updatedAt:Date.now(),
    slides:['capa','cartoes','fluxo','numeros','encerramento'].map(t=>({id:uid(),t,d:clone(T[t].sample)}))};
}
const deck=()=>decks[curId];
/* garante id em cada slide e campos vazios onde faltar (não aparece texto de exemplo em slides antigos) */
function normalize(dk){ if(!dk||!Array.isArray(dk.slides)) return dk; dk.slides.forEach(s=>{ s.id=s.id||uid(); D.fillDefaults(s); }); return dk; }

/* ---------- armazenamento local (IndexedDB, com localStorage de reserva) ---------- */
const IDB={
  open(){ return this.p||(this.p=new Promise((res,rej)=>{ try{ const r=indexedDB.open('estudio-motion',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); } })); },
  async get(k){ const db=await this.open(); return new Promise((res,rej)=>{ const q=db.transaction('kv').objectStore('kv').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); },
  async set(k,v){ const db=await this.open(); return new Promise((res,rej)=>{ const tx=db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k); tx.oncomplete=()=>res(true); tx.onerror=tx.onabort=()=>rej(tx.error); }); }
};
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(_){ return null; } };
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,v); return true; }catch(_){ return false; } };
async function localLoad(){
  try{ const v=await IDB.get('decks'); if(v&&typeof v==='object') return v; }catch(_){}
  let old={}; try{ old=JSON.parse(lsGet(LS)||'{}')||{}; }catch(_){}
  if(Object.keys(old).length){ try{ await IDB.set('decks',old); localStorage.removeItem(LS); }catch(_){} } // migra para o IndexedDB
  return old;
}
async function localSave(){
  try{ await IDB.set('decks',clone(decks)); return true; }
  catch(_){ return lsSet(LS,JSON.stringify(decks)); }
}
/* vídeos guardados no navegador: local:vid-xxx vira um endereço temporário */
const localMedia={};
{ const base=v=>v.startsWith('asset:')?'/_blob/'+v.slice(6):v; D.setImageResolver(v=>{ v=String(v||''); if(v.startsWith('local:')) return localMedia[v]||''; return base(v); }); }
async function preloadLocal(){ const keys=new Set(); Object.values(decks).forEach(dk=>(dk.slides||[]).forEach(sl=>{ const v=sl.d&&sl.d.src; if(typeof v==='string'&&v.startsWith('local:')) keys.add(v); }));
  for(const k of keys){ if(localMedia[k]) continue; try{ const b=await IDB.get(k.slice(6)); if(b) localMedia[k]=URL.createObjectURL(b); }catch(_){} } }
/* biblioteca de slides reutilizáveis (fica neste navegador, vale para todas as apresentações) */
let myLib=[];
async function loadLib(){ try{ myLib=(await IDB.get('library'))||[]; }catch(_){ try{ myLib=JSON.parse(lsGet(LS+'-library')||'[]'); }catch(e){ myLib=[]; } } }
async function saveLib(){ try{ await IDB.set('library',clone(myLib)); }catch(_){ lsSet(LS+'-library',JSON.stringify(myLib)); } }
async function loadThemes(){ try{ myThemes=(await IDB.get('themes'))||[]; }catch(_){ try{ myThemes=JSON.parse(lsGet(LS+'-themes')||'[]'); }catch(e){ myThemes=[]; } } }
async function saveThemes(){ try{ await IDB.set('themes',clone(myThemes)); }catch(_){ lsSet(LS+'-themes',JSON.stringify(myThemes)); } }

/* ---------- comentários por slide (vão junto com a apresentação: backup, nuvem, arquivo) ---------- */
const myName=()=>lsGet(LS+'-autor')||'';
function paintComments(s){ const box=$('#cmBox'); if(!box) return; const list=s.comments||[];
  const showDone=box.dataset.done==='1', vis=list.filter(c=>showDone||!c.done), nDone=list.filter(c=>c.done).length;
  box.innerHTML=`${vis.map(c=>`<div class="cm${c.done?' done':''}" data-id="${c.id}"><div class="cm-h"><b>${esc(c.author||'Sem nome')}</b><small>${whenTxt(c.at)}</small></div><p>${esc(c.text)}</p><div class="cm-a"><button class="lnk" data-done>${c.done?'Reabrir':'Resolver ✓'}</button><button class="lnk" data-rm>Excluir</button></div></div>`).join('')}
    ${nDone?`<button class="lnk cm-tg" data-tg>${showDone?'Ocultar':'Mostrar'} ${nDone} resolvido(s)</button>`:''}
    <div class="cm-new">${myName()?'':'<input type="text" id="cmWho" placeholder="Seu nome">'}<textarea id="cmTxt" rows="2" placeholder="Escreva um comentário para este slide…"></textarea><button class="btn sm" id="cmAdd">Comentar</button></div>`;
  const upd=()=>{ touch(); paintComments(s); renderRail(); const sec=box.previousElementSibling; if(sec) sec.innerHTML='Comentários '+(openC(s)?'<b class="cm-n">'+openC(s)+' em aberto</b>':''); };
  box.querySelectorAll('.cm').forEach(el=>{ const c=list.find(x=>x.id===el.dataset.id);
    el.querySelector('[data-done]').onclick=()=>{ c.done=!c.done; upd(); };
    el.querySelector('[data-rm]').onclick=()=>{ s.comments=list.filter(x=>x!==c); if(!s.comments.length) delete s.comments; upd(); }; });
  const tg=box.querySelector('[data-tg]'); if(tg) tg.onclick=()=>{ box.dataset.done=showDone?'0':'1'; paintComments(s); };
  const add=()=>{ const t=box.querySelector('#cmTxt').value.trim(); if(!t) return; const who=box.querySelector('#cmWho'); if(who&&who.value.trim()) lsSet(LS+'-autor',who.value.trim());
    (s.comments=s.comments||[]).push({id:uid(),author:myName()||(who&&who.value.trim())||'',text:t,at:Date.now(),done:false}); upd(); };
  box.querySelector('#cmAdd').onclick=add; box.querySelector('#cmTxt').onkeydown=e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) add(); };
}

/* ---------- histórico de versões: automático a cada 10 min de edição + versões com nome ---------- */
const VKEY=id=>'ver-'+id;
async function getVersions(id){ try{ return (await IDB.get(VKEY(id)))||[]; }catch(_){ try{ return JSON.parse(lsGet(LS+'-'+VKEY(id))||'[]'); }catch(e){ return []; } } }
async function putVersions(id,list){ const autos=list.filter(v=>!v.name); const keep=list.filter(v=>v.name||autos.indexOf(v)<30).slice(0,60);
  try{ await IDB.set(VKEY(id),keep); }catch(_){ lsSet(LS+'-'+VKEY(id),JSON.stringify(keep.slice(0,8))); } }
let verBusy=false;
async function addVersion(id,d,name){ const list=await getVersions(id); list.unshift({at:Date.now(),name:name||'',deck:clone(d)}); await putVersions(id,list); }
async function autoVersion(id,d){ if(verBusy||!id||!d) return; verBusy=true; try{ const list=await getVersions(id); const last=list.find(v=>!v.name)||list[0];
  if(!last||Date.now()-last.at>10*60000){ list.unshift({at:Date.now(),name:'',deck:clone(d)}); await putVersions(id,list); } }catch(_){} verBusy=false; }
const whenTxt=t=>{ const d=new Date(t), now=new Date(), h=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); const day=Math.round((new Date(now.toDateString())-new Date(d.toDateString()))/864e5); return day===0?'Hoje, '+h:day===1?'Ontem, '+h:d.toLocaleDateString('pt-BR')+', '+h; };
async function versionsDialog(){
  const id=curId, list=await getVersions(id);
  const m=modal(`<h3>Histórico de versões</h3><p class="sub">Uma versão é guardada sozinha a cada 10 minutos de edição. Você também pode guardar uma versão com nome antes de uma mudança grande. Restaurar não apaga nada: a versão atual também é guardada.</p>
    <div class="ver-new"><input type="text" id="verName" placeholder="Nome da versão (ex.: enviada para a diretoria)"><button class="btn pri" data-save>Guardar versão agora</button></div>
    <div class="ver-list">${list.map((v,i)=>`<div class="ver-i"><div class="tv"></div><div class="ver-t"><b>${v.name?esc(v.name):'Versão automática'}</b><small>${whenTxt(v.at)} · ${(v.deck.slides||[]).length} slides</small></div><div class="ver-a"><button class="btn sm" data-copy="${i}">Abrir como cópia</button><button class="btn sm" data-res="${i}">Restaurar</button></div></div>`).join('')||'<p class="sub">Ainda não há versões guardadas. Elas aparecem conforme você edita.</p>'}</div>
    <div class="row"><button class="btn pri" data-c>Fechar</button></div>`,'confirm review');
  m.el.querySelector('[data-c]').onclick=m.close;
  m.el.querySelectorAll('.ver-i').forEach((row,i)=>{ try{ D.renderStatic(row.querySelector('.tv'),list[i].deck,0); }catch(_){} });
  const nm=m.el.querySelector('#verName');
  const saveNow=async()=>{ await addVersion(id,deck(),nm.value.trim()||'Versão de '+whenTxt(Date.now())); m.close(); versionsDialog(); setStatus('Versão guardada',true); };
  m.el.querySelector('[data-save]').onclick=saveNow; nm.onkeydown=e=>{ if(e.key==='Enter') saveNow(); };
  m.el.querySelectorAll('[data-res]').forEach(b=>b.onclick=async()=>{ const v=list[+b.dataset.res]; await addVersion(id,deck(),'Antes de restaurar ('+whenTxt(Date.now())+')');
    if(histT) snap(); decks[id]=Object.assign(clone(v.deck),{updatedAt:Date.now()}); normalize(decks[id]); sel=0; m.close(); touch(); renderAll(); setStatus('Versão restaurada',true); });
  m.el.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{ const v=list[+b.dataset.copy]; const nid=uid(); decks[nid]=Object.assign(clone(v.deck),{name:(v.deck.name||'Apresentação')+' (versão de '+whenTxt(v.at)+')',updatedAt:Date.now()}); normalize(decks[nid]); curId=nid; sel=0; m.close(); touch(); renderAll(); setStatus('Cópia criada',true); });
}

/* ---------- persistência ---------- */
function setStatus(txt,ok){ const s=$('#status'); if(!s) return; s.textContent=txt; s.classList.toggle('ok',!!ok); }
function touch(){ const d=deck(); if(!d) return; d.updatedAt=Date.now(); dirty=true; setStatus('Alterado…'); clearTimeout(saveT); saveT=setTimeout(save,900); clearTimeout(histT); histT=setTimeout(snap,600); }
async function save(){
  const d=deck(); if(!d) return; autoVersion(curId,d);
  if(saving){ pendingSave=true; return; }
  saving=true;
  if(mode==='db'){
    setStatus('Salvando…');
    try{ const c=clone(d); await db.doc('decks/'+curId).set(c); remoteBase[curId]=c; dirty=false; setStatus('Salvo',true); }
    catch(e){ setStatus(e&&e.code==='permission_denied'?'Sem permissão para salvar':'Não salvou, tentando de novo'); if(!(e&&e.code==='permission_denied')) setTimeout(save,4000); }
  } else {
    const ok=await localSave(); if(ok){ localIds=new Set(Object.keys(decks)); dirty=false; }
    setStatus(ok?'Salvo neste navegador':'Não foi possível salvar',ok);
  }
  saving=false; if(pendingSave){ pendingSave=false; save(); }
}

/* ---------- desfazer / refazer ---------- */
const hist={}; let histT=null;
const ser=d=>JSON.stringify(Object.assign({},d,{updatedAt:0}));
function H(){ return hist[curId]||(hist[curId]={u:[],r:[],last:ser(deck())}); }
function snap(){ clearTimeout(histT); histT=null; if(!deck()) return; const h=H(), now=ser(deck()); if(now!==h.last){ h.u.push(h.last); if(h.u.length>100) h.u.shift(); h.r=[]; h.last=now; } updUndo(); }
function restore(json){ const d=JSON.parse(json); d.updatedAt=Date.now(); decks[curId]=d; dirty=true; clearTimeout(saveT); saveT=setTimeout(save,600); sel=Math.min(sel,Math.max(0,d.slides.length-1)); renderAll(); updUndo(); setStatus('Alterado…'); }
function undo(){ if(histT) snap(); const h=H(); if(!h.u.length) return; h.r.push(h.last); h.last=h.u.pop(); restore(h.last); }
function redo(){ if(histT) snap(); const h=H(); if(!h.r.length) return; h.u.push(h.last); h.last=h.r.pop(); restore(h.last); }
function updUndo(){ const h=deck()?H():{u:[],r:[]}; $('#undoBtn').disabled=!h.u.length&&!histT; $('#redoBtn').disabled=!h.r.length; }

/* ---------- renderização ---------- */
function renderAll(){ renderDeckPick(); renderRail(); renderPreview(true); renderPane(); updUndo(); }
function renderDeckPick(){
  const ids=Object.keys(decks).sort((a,b)=>(decks[b].updatedAt||0)-(decks[a].updatedAt||0));
  $('#deckSel').innerHTML=ids.map(id=>`<option value="${esc(id)}"${id===curId?' selected':''}>${esc(decks[id].name||'Sem nome')}</option>`).join('');
  if(document.activeElement!==$('#deckName')) $('#deckName').value=deck()?deck().name||'':'';
}
const thumbCleanup=new Map();
const openC=s=>(s.comments||[]).filter(c=>!c.done).length;
function renderRail(){
  const d=deck(), rail=$('#rail'); thumbCleanup.forEach(f=>f()); thumbCleanup.clear();
  rail.innerHTML=d.slides.map((s,i)=>`<button class="thumb${i===sel?' sel':''}${s.hidden?' hid':''}" data-i="${i}" aria-label="Slide ${i+1}: ${esc((T[s.t]||{}).name||s.t)}"><div class="tv"></div>${openC(s)?`<span class="cm-badge" title="${openC(s)} comentário(s) em aberto">${openC(s)}</span>`:''}<div class="meta"><span>${String(i+1).padStart(2,'0')}</span><span>${s.hidden?'<b class="hid-tag">oculto</b>':''}${s.notes?'<i class="has-notes" title="Tem notas do apresentador"></i>':''}${esc((T[s.t]||{}).name||s.t)}</span></div></button>`).join('')+`<button class="addslide" id="addSlide">+ Adicionar slide</button>`;
  rail.querySelectorAll('.thumb').forEach(b=>{ const i=+b.dataset.i; thumbCleanup.set(i,D.renderStatic(b.querySelector('.tv'),d,i)); b.onclick=()=>select(i); });
  $('#addSlide').onclick=()=>gallery('add');
  railDrag();
}
function refreshThumb(i){
  const b=$('#rail').querySelector(`.thumb[data-i="${i}"] .tv`); if(!b) return;
  const f=thumbCleanup.get(i); if(f) f(); thumbCleanup.set(i,D.renderStatic(b,deck(),i));
}
function renderPreview(animate){
  if(player){ player.destroy(); player=null; }
  const d=deck(); if(!d.slides.length){ $('#pv').innerHTML='<div style="display:grid;place-items:center;height:100%;color:#8b97b3">Adicione um slide para começar</div>'; return; }
  sel=Math.min(sel,d.slides.length-1);
  player=D.createPlayer($('#pv'),d,{start:sel});
  if(!animate) player.still(sel);
  $('#pvN').textContent=(sel+1)+' / '+d.slides.length;
}
let pvT=null;
/* edição ao vivo: troca só o slide editado na prévia */
function liveEdit(){ touch(); clearTimeout(pvT); pvT=setTimeout(()=>{ if(player&&player.count===deck().slides.length) player.update(sel,deck()); else renderPreview(false); refreshThumb(sel); },200); }
function select(i){
  if(inl) closeInline(true);
  const d=deck(); if(i<0||i>=d.slides.length) return;
  const dir=i>sel?1:-1; sel=i;
  $('#rail').querySelectorAll('.thumb').forEach(b=>b.classList.toggle('sel',+b.dataset.i===i));
  const b=$('#rail').querySelector(`.thumb[data-i="${i}"]`); if(b) b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  if(player) player.go(i,dir); $('#pvN').textContent=(i+1)+' / '+d.slides.length;
  if(tab==='content') renderPane();
}

/* ---------- edição direto no slide ---------- */
const getPath=(o,p)=>p.split('.').reduce((a,k)=>a==null?a:a[k],o);
function setPath(o,p,v){ const ks=p.split('.'); let a=o; for(let i=0;i<ks.length-1;i++){ if(a[ks[i]]==null) a[ks[i]]=/^\d+$/.test(ks[i+1])?[]:{}; a=a[ks[i]]; } a[ks[ks.length-1]]=v; }
let inl=null;
function inlineEdit(el){
  const s=deck().slides[sel]; if(!s) return; const path=el.dataset.f; const orig=getPath(s.d,path);
  if(typeof orig!=='string'&&orig!=null) return;
  closeInline(true);
  const r=el.getBoundingClientRect(), pv=$('#pv').getBoundingClientRect();
  const ta=document.createElement('textarea'); ta.className='inl'; ta.value=orig||''; ta.setAttribute('aria-label','Editar texto do slide');
  const w=Math.min(Math.max(r.width+24,260),pv.width-16);
  ta.style.left=Math.max(pv.left+8,Math.min(r.left-12,pv.right-w-8))+'px'; ta.style.top=Math.max(8,r.top-10)+'px'; ta.style.width=w+'px';
  document.body.appendChild(ta);
  const fit=()=>{ ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight+2,320)+'px'; };
  fit(); ta.focus(); ta.select();
  inl={ta,path,orig,slide:s};
  ta.oninput=()=>{ setPath(s.d,path,ta.value); fit(); liveEdit(); };
  ta.onkeydown=e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); closeInline(false); } else if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); closeInline(true); } };
  ta.onblur=()=>setTimeout(()=>{ if(inl&&inl.ta===ta) closeInline(true); },0);
}
function closeInline(keep){
  if(!inl) return; const {ta,path,orig,slide}=inl; inl=null; ta.remove();
  if(!keep){ setPath(slide.d,path,orig??''); liveEdit(); }
  if(tab==='content') renderPane();
}
$('#pv').addEventListener('click',e=>{ const el=e.target.closest('[data-f]'); if(el&&$('#pv').contains(el)){ e.preventDefault(); inlineEdit(el); } });

/* soltar imagens do computador direto no slide */
async function readImage(file){
  if(assets){ try{ const r=await assets.upload(file); return 'asset:'+r.id; }catch(err){ /* cai para o modo local */ } }
  return shrink(file,1400,.82);
}
async function dropImages(files){
  const s=deck().slides[sel]; if(!s) return; const tpl=T[s.t]; if(!tpl) return;
  const imgs=[...files].filter(f=>/^image\//.test(f.type)); if(!imgs.length) return;
  setStatus('Enviando imagem…'); let placed=0;
  const top=tpl.fields.filter(f=>f.t==='image'), list=tpl.fields.find(f=>f.t==='items'&&f.sub.some(x=>x.t==='image'));
  for(const file of imgs){
    let val; try{ val=await readImage(file); }catch(_){ continue; }
    const emptyTop=top.find(f=>!s.d[f.k]);
    if(list){ const sub=list.sub.find(x=>x.t==='image'), arr=s.d[list.k]=s.d[list.k]||[]; const slot=arr.find(it=>!it[sub.k]);
      if(slot){ slot[sub.k]=val; placed++; continue; }
      if(arr.length<(list.max||6)){ const n={}; list.sub.forEach(x=>n[x.k]=x.t==='bool'?false:''); n[sub.k]=val; arr.push(n); placed++; continue; } }
    const f=emptyTop||top[0]; if(f){ s.d[f.k]=val; placed++; }
  }
  if(placed){ touch(); renderPreview(false); refreshThumb(sel); renderPane(); setStatus(placed===1?'Imagem colocada no slide':placed+' imagens colocadas',true); }
  else setStatus('Este modelo não tem lugar para imagem');
}
const pvBox=$('#pv');
pvBox.addEventListener('dragover',e=>{ if([...e.dataTransfer.types].includes('Files')){ e.preventDefault(); pvBox.classList.add('drop'); } });
pvBox.addEventListener('dragleave',e=>{ if(e.target===pvBox||!pvBox.contains(e.relatedTarget)) pvBox.classList.remove('drop'); });
pvBox.addEventListener('drop',e=>{ e.preventDefault(); pvBox.classList.remove('drop'); if(e.dataTransfer.files.length) dropImages(e.dataTransfer.files); });

/* arrastar miniaturas para reordenar */
function moveSlide(from,to){
  const s=deck().slides; if(from===to||from<0||to<0||from>=s.length||to>s.length) return;
  const [it]=s.splice(from,1); if(to>from) to--; s.splice(to,0,it); sel=to; touch(); renderRail(); renderPreview(false); renderPane();
}
function railDrag(){
  let from=null; const rail=$('#rail');
  rail.querySelectorAll('.thumb').forEach(b=>{
    b.draggable=true;
    b.ondragstart=e=>{ from=+b.dataset.i; b.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setData('text/plain',String(from)); }catch(_){} };
    b.ondragend=()=>{ from=null; rail.querySelectorAll('.thumb').forEach(x=>x.classList.remove('dragging','before','after')); };
    b.ondragover=e=>{ if(from==null) return; e.preventDefault(); const r=b.getBoundingClientRect(), after=e.clientY>r.top+r.height/2; rail.querySelectorAll('.thumb').forEach(x=>x.classList.remove('before','after')); b.classList.add(after?'after':'before'); };
    b.ondrop=e=>{ if(from==null) return; e.preventDefault(); const r=b.getBoundingClientRect(), i=+b.dataset.i; moveSlide(from,e.clientY>r.top+r.height/2?i+1:i); };
  });
}

/* ---------- inspetor ---------- */
const plain=v=>String(v||'').replace(/[*`]/g,'').replace(/\s+/g,' ').trim();
const slideLabel=(s,j)=>`${String(j+1).padStart(2,'0')} · ${plain((s.d&&(s.d.title||s.d.quote))||(T[s.t]||{}).name||s.t).slice(0,48)}${s.hidden?' (oculto)':''}`;
const opt=(map,v)=>Object.entries(map).map(([k,l])=>`<option value="${k}"${k===v?' selected':''}>${esc(l)}</option>`).join('');
function renderPane(){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  const pane=$('#pane'); pane.innerHTML='';
  if(tab==='theme') return themePane(pane);
  const d=deck(), s=d.slides[sel]; if(!s){ pane.innerHTML='<p class="tip">Nenhum slide ainda.</p>'; return; }
  const tpl=T[s.t]||T.destaque; s.d=s.d||{};
  const h=document.createElement('div'); h.className='tpl-head';
  h.innerHTML=`<div><div class="sec" style="padding:0">Modelo</div><b>${esc(tpl.name)}</b></div><button class="btn sm" id="swapBtn">Trocar modelo</button>`;
  pane.appendChild(h); $('#swapBtn').onclick=()=>gallery('swap');
  const LY=(D.LAYOUTS||{})[s.t];
  if(LY){ const box=document.createElement('div'); box.className='lay-pick'; box.innerHTML='<div class="sec" style="padding:0">Layout</div><div class="lay-row">'+Object.entries(LY).map(([k,n])=>`<button class="lay-o${(s.lay||'')===k?' on':''}" data-lay="${k}" title="${esc(n)}"><div class="tv"></div><small>${esc(n)}</small></button>`).join('')+'</div>';
    pane.appendChild(box);
    box.querySelectorAll('.lay-o').forEach(b=>{ const k=b.dataset.lay, mini=Object.assign({},d,{slides:[Object.assign({},s,{lay:k})],header:Object.assign({},d.header||{},{on:false})});
      try{ D.renderStatic(b.querySelector('.tv'),mini,0); }catch(_){}
      b.onclick=()=>{ if(k) s.lay=k; else delete s.lay; touch(); renderAll(); }; }); }
  tpl.fields.forEach(f=>pane.appendChild(field(f,s.d,`${s.id}-${f.k}`,()=>liveEdit())));
  if(s.t==='video'){ const vb=document.createElement('div'); vb.className='btnrow'; vb.innerHTML='<button class="btn sm" id="vidUp">Enviar vídeo do computador…</button>'; pane.insertBefore(vb,pane.children[2]||null);
    vb.querySelector('#vidUp').onclick=()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='video/mp4,video/webm,video/*'; inp.onchange=async()=>{ const f=inp.files[0]; if(!f) return;
      if(f.size>200e6){ setStatus('Vídeo muito grande (máx. 200 MB)'); return; } setStatus('Guardando o vídeo…');
      let src=''; if(assets){ try{ src='asset:'+(await assets.upload(f)).id; }catch(_){ src=''; } }
      if(!src){ const key='vid-'+uid(); try{ await IDB.set(key,f); }catch(err){ setStatus('Não foi possível guardar o vídeo neste navegador'); return; } localMedia['local:'+key]=URL.createObjectURL(f); src='local:'+key; }
      s.d.src=src; touch(); renderPreview(true); renderPane(); setStatus('Vídeo pronto: '+f.name,true); }; inp.click(); }; }
  if(s.t==='video'){ const hv=document.createElement('p'); hv.className='tip'; hv.textContent='Vídeo enviado do computador fica guardado neste navegador e toca aqui. Ele não vai embutido no arquivo exportado: para compartilhar, use um endereço público (https://…) ou deixe o arquivo na mesma pasta do HTML.'; pane.appendChild(hv); }
  /* animação e notas */
  const box=document.createElement('div'); box.className='slideopts';
  box.innerHTML=`<div class="sec">Animação deste slide</div>
  <div class="f2"><div class="f"><label for="o-anim">Entrada dos elementos</label><select id="o-anim">${opt(D.ANIMS,s.anim||'padrao')}</select></div>
  <div class="f"><label for="o-speed">Velocidade</label><select id="o-speed">${opt({'0.5':'Bem lenta','0.75':'Lenta','1':'Normal','1.5':'Rápida','2':'Bem rápida'},String(s.speed||1))}</select></div></div>
  <div class="f2"><div class="f"><label for="o-tr">Transição ao chegar</label><select id="o-tr">${opt(Object.assign({'':'Padrão da apresentação'},D.TRANSITIONS),s.tr||'')}</select></div>
  <div class="f"><label for="o-dur">Tempo no avanço automático</label><input type="number" id="o-dur" min="0" step="0.5" placeholder="padrão" value="${s.dur||''}"><span class="hint">segundos (vazio = padrão do tema)</span></div></div>
  ${dataField(tpl)?`<div class="sec">Dados de planilha</div><div class="f"><label for="o-src">Link do Google Planilhas ou de um arquivo CSV</label><input type="text" id="o-src" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(s.src||'')}"><span class="hint">Coluna A = rótulo, coluna B = valor. No Google Planilhas: Compartilhar › Qualquer pessoa com o link.</span></div>
  <div class="btnrow"><button class="btn sm" id="o-srcGo">Importar agora</button><button class="btn sm" id="o-csv">Abrir arquivo CSV…</button></div>
  <label class="chk"><input type="checkbox" id="o-live"${s.live?' checked':''}> Atualizar os números sozinho ao apresentar</label>`:''}
  <div class="sec">Exibição</div>
  <label class="chk"><input type="checkbox" id="o-hid"${s.hidden?' checked':''}> Slide oculto (só abre por um link do OnePage)</label>
  ${d.header&&d.header.on?`<div class="f"><label for="o-head">Faixa de cabeçalho neste slide</label><select id="o-head">${opt({'':'Automático','show':'Mostrar','hide':'Esconder'},s.head||'')}</select></div>`:''}
  <div class="sec">Comentários ${openC(s)?'<b class="cm-n">'+openC(s)+' em aberto</b>':''}</div>
  <div class="cm-box" id="cmBox"></div>
  <div class="sec">Notas do apresentador</div>
  <div class="f"><textarea id="o-notes" rows="4" placeholder="O que falar neste slide. Aparece só na janela do apresentador.">${esc(s.notes||'')}</textarea></div>`;
  pane.appendChild(box);
  const animCh=()=>{ touch(); if(player){ player.update(sel,deck()); player.replay(); } };
  $('#o-anim').onchange=e=>{ if(e.target.value==='padrao') delete s.anim; else s.anim=e.target.value; animCh(); };
  $('#o-speed').onchange=e=>{ const v=+e.target.value; if(v===1) delete s.speed; else s.speed=v; animCh(); };
  $('#o-tr').onchange=e=>{ if(!e.target.value) delete s.tr; else s.tr=e.target.value; touch(); if(player) player.update(sel,deck()); };
  $('#o-dur').oninput=e=>{ const v=parseFloat(e.target.value); if(v>0) s.dur=v; else delete s.dur; touch(); };
  $('#o-hid').onchange=e=>{ if(e.target.checked) s.hidden=true; else delete s.hidden; touch(); renderRail(); };
  if($('#o-head')) $('#o-head').onchange=e=>{ if(e.target.value) s.head=e.target.value; else delete s.head; touch(); renderPreview(false); refreshThumb(sel); };
  paintComments(s);
  $('#o-notes').oninput=e=>{ s.notes=e.target.value; if(!s.notes) delete s.notes; touch(); };
  if($('#o-src')){ const fill=rows=>{ const n=applyRows(s,rows); if(!n) return setStatus('Não encontrei linhas com rótulo e valor'); touch(); renderPreview(false); refreshThumb(sel); renderPane(); setStatus(n+' linhas importadas',true); };
    $('#o-src').oninput=e=>{ const v=e.target.value.trim(); if(v) s.src=v; else { delete s.src; delete s.live; } touch(); };
    $('#o-srcGo').onclick=async()=>{ if(!s.src) return setStatus('Cole o link da planilha primeiro'); setStatus('Buscando dados…'); try{ fill(await fetchRows(s.src)); }catch(e){ setStatus('Não consegui ler a planilha. Ela está compartilhada com qualquer pessoa com o link?'); } };
    $('#o-csv').onclick=()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,text/csv,.txt'; inp.onchange=async()=>{ try{ fill(csvRows(await inp.files[0].text())); }catch(e){ setStatus('Arquivo CSV inválido'); } }; inp.click(); };
    $('#o-live').onchange=e=>{ if(e.target.checked) s.live=true; else delete s.live; touch(); }; }
  const tip=document.createElement('p'); tip.className='tip';
  tip.innerHTML='Use <code>*palavra*</code> para destacar com a cor do tema e <code>`SQ01`</code> para um código. Clique num texto do slide para editar ali mesmo (Enter confirma, Esc cancela). Arraste imagens do computador para o slide e as miniaturas para reordenar. <code>Ctrl+Z</code> desfaz.';
  pane.appendChild(tip);
}
function field(f,obj,id,onCh){
  const w=document.createElement('div'); w.className='f';
  if(f.t==='bool'){ w.innerHTML=`<label class="chk"><input type="checkbox" id="${id}"${obj[f.k]?' checked':''}> ${esc(f.l)}</label>`; w.querySelector('input').onchange=e=>{obj[f.k]=e.target.checked;onCh();}; return w; }
  w.innerHTML=`<label for="${id}">${esc(f.l)}</label>`;
  if(f.t==='text'){ const i=document.createElement('input'); i.type='text'; i.id=id; i.value=obj[f.k]??''; i.oninput=()=>{obj[f.k]=i.value;onCh();}; w.appendChild(i); }
  else if(f.t==='area'){ const i=document.createElement('textarea'); i.id=id; i.rows=f.k==='title'?2:3; i.value=obj[f.k]??''; i.oninput=()=>{obj[f.k]=i.value;onCh();}; w.appendChild(i); }
  else if(f.t==='list'){ const i=document.createElement('textarea'); i.id=id; i.rows=4; i.value=(obj[f.k]||[]).join('\n'); i.oninput=()=>{obj[f.k]=i.value.split('\n').map(x=>x.trim()).filter(Boolean);onCh();}; w.appendChild(i); const hh=document.createElement('span'); hh.className='hint'; hh.textContent='Um item por linha'; w.appendChild(hh); }
  else if(f.t==='select'){ const i=document.createElement('select'); i.id=id; i.innerHTML=opt(f.opts||{},obj[f.k]||Object.keys(f.opts||{})[0]); i.onchange=()=>{ obj[f.k]=i.value; onCh(); }; w.appendChild(i); }
  else if(f.t==='slide'){ const i=document.createElement('select'); i.id=id; const cur=deck().slides[sel];
    i.innerHTML='<option value="">— sem link —</option>'+deck().slides.map((s,j)=>s===cur?'':`<option value="${esc(s.id)}"${s.id===obj[f.k]?' selected':''}>${esc(slideLabel(s,j))}</option>`).join('');
    i.onchange=()=>{ obj[f.k]=i.value; onCh(); }; w.appendChild(i);
    if(obj[f.k]&&!deck().slides.some(s=>s.id===obj[f.k])){ const hh=document.createElement('span'); hh.className='hint warn'; hh.textContent='O slide ligado foi excluído.'; w.appendChild(hh); } }
  else if(f.t==='image') w.appendChild(imageField(obj,f.k,id,onCh));
  else if(f.t==='items') w.appendChild(itemsField(f,obj,id,onCh));
  return w;
}
function imageField(obj,k,id,onCh){
  const box=document.createElement('div'); box.className='imgf';
  const paint=()=>{ const v=obj[k]; box.innerHTML=`<div class="pic" style="background-image:${v?`url('${D.resolveImage(v).replace(/'/g,"%27")}')`:'none'}"></div><div class="acts"><button class="btn sm" id="${id}">${v?'Trocar':'Enviar'} imagem</button>${v?'<button class="btn sm ghost danger">Remover</button>':''}</div>`;
    box.querySelector('.acts .btn').onclick=()=>pickImage(async val=>{ obj[k]=val; paint(); onCh(); });
    const rm=box.querySelector('.danger'); if(rm) rm.onclick=()=>{ obj[k]=''; paint(); onCh(); }; };
  paint(); return box;
}
function itemsField(f,obj,id,onCh){
  const box=document.createElement('div'); box.className='items'; obj[f.k]=obj[f.k]||[];
  const max=f.max||6;
  const paint=()=>{ box.innerHTML=''; const list=obj[f.k];
    list.forEach((it,i)=>{ const card=document.createElement('div'); card.className='item'+(i>=max?' over':'');
      card.innerHTML=`<div class="ih"><span>${i+1}${i>=max?' · não aparece':''}</span><span><button class="btn sm ghost" data-m="-1" aria-label="Subir">↑</button><button class="btn sm ghost" data-m="1" aria-label="Descer">↓</button><button class="btn sm ghost danger" data-x aria-label="Remover">✕</button></span></div>`;
      f.sub.forEach(sf=>card.appendChild(field(sf,it,`${id}-${i}-${sf.k}`,onCh)));
      card.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ const j=i+(+b.dataset.m); if(j<0||j>=list.length) return; [list[i],list[j]]=[list[j],list[i]]; paint(); onCh(); });
      card.querySelector('[data-x]').onclick=()=>{ list.splice(i,1); paint(); onCh(); };
      box.appendChild(card); });
    if(list.length<max){ const add=document.createElement('button'); add.className='btn sm'; add.textContent='+ Adicionar'; add.onclick=()=>{ const n={}; f.sub.forEach(sf=>n[sf.k]=sf.t==='bool'?false:''); list.push(n); paint(); onCh(); }; box.appendChild(add); }
    const hh=document.createElement('span'); hh.className='hint'+(list.length>max?' warn':'');
    hh.textContent=list.length>max?`Este modelo mostra só ${max}. Os itens marcados não aparecem no slide.`:list.length===max?`Máximo de ${max} neste modelo.`:`Até ${max} neste modelo.`;
    box.appendChild(hh);
  };
  paint(); return box;
}
function themePane(pane){
  const d=deck(); d.theme=d.theme||{preset:'eletrico'}; const th=d.theme, eff=D.themeOf(d); const auto=d.auto||{}; const hd=d.header||{};
  const ch=()=>{ touch(); clearTimeout(pvT); pvT=setTimeout(()=>{ renderPreview(false); renderRail(); },300); };
  const swatch=p=>`<span><i style="background:${p.bg}"></i><i style="background:${p.surface}"></i><i style="background:${p.accent}"></i><i style="background:${p.alert}"></i></span>`;
  pane.innerHTML=`<div class="sec">Paleta pronta</div><div class="swatches">${Object.entries(D.PRESETS).map(([k,p])=>`<button class="sw${th.preset===k&&!th.custom?' on':''}" data-p="${k}">${swatch(p)}${esc(p.name)}</button>`).join('')}</div>
  <div class="sec">Meus temas</div>
  <div class="swatches">${myThemes.map((m,i)=>`<div class="sw mine${th.custom===m.name?' on':''}" data-m="${i}" role="button" tabindex="0">${swatch(Object.assign({},D.PRESETS[m.theme.preset]||D.PRESETS.eletrico,m.theme))}${esc(m.name)}<button class="x" data-del="${i}" aria-label="Apagar tema ${esc(m.name)}">✕</button></div>`).join('')||'<p class="hint" style="grid-column:1/-1;margin:0">Ajuste cores e fontes abaixo e salve para reutilizar em outras apresentações.</p>'}</div>
  <button class="btn sm" id="saveTheme">Salvar tema atual</button>
  <div class="sec">Cores</div><div class="colors">${[['bg','Fundo'],['surface','Painéis'],['accent','Destaque'],['alert','Alerta'],['ok','Positivo'],['bad','Negativo'],['title','Títulos'],['text','Texto'],['muted','Texto suave']].map(([k,l])=>`<label class="col"><input type="color" id="c-${k}" value="${eff[k]||'#000000'}"> ${l}</label>`).join('')}</div>
  <label class="chk"><input type="checkbox" id="t-light"${eff.light?' checked':''}> Tema claro (ajusta brilho e sombras)</label>
  <div class="sec">Estilo</div>
  <div class="f2"><div class="f"><label for="t-shape">Cantos</label><select id="t-shape">${opt(D.SHAPES,eff.shape||'round')}</select></div>
  <div class="f"><label for="t-cards">Painéis</label><select id="t-cards">${opt(D.CARDS,eff.cards||'vidro')}</select></div></div>
  <div class="f"><label for="t-w">Peso dos títulos</label><select id="t-w">${opt({'300':'Leve','400':'Regular','500':'Médio','600':'Semi-negrito','700':'Negrito'},String(eff.weight||600))}</select></div>
  <label class="chk"><input type="checkbox" id="t-glow"${eff.glow!==false?' checked':''}> Brilho neon nos destaques</label>
  <label class="chk"><input type="checkbox" id="t-grain"${eff.grain?' checked':''}> Granulado de filme (textura sutil)</label>
  <div class="sec">Tipografia e fundo</div>
  <div class="f"><label for="t-fd">Fonte dos títulos</label><select id="t-fd">${D.FONTS.map(f=>`<option${f===eff.fontDisplay?' selected':''}>${f}</option>`).join('')}</select></div>
  <div class="f"><label for="t-fb">Fonte do texto</label><select id="t-fb">${D.FONTS.map(f=>`<option${f===eff.fontBody?' selected':''}>${f}</option>`).join('')}</select></div>
  <div class="f"><label for="t-bg">Fundo animado</label><select id="t-bg">${Object.entries(D.BACKGROUNDS).map(([k,l])=>`<option value="${k}"${k===eff.background?' selected':''}>${l}</option>`).join('')}</select></div>
  <div class="sec">Movimento e acessibilidade</div>
  <div class="f"><label for="t-tr">Transição padrão entre slides</label><select id="t-tr">${opt(D.TRANSITIONS,d.tr||'deslizar')}</select><span class="hint">“Voo pela tela infinita” espalha os slides num mapa e a câmera voa de um para o outro.</span></div>
  <div class="sec">Trilha sonora ao apresentar</div>
  <div class="f"><div class="btnrow"><button class="btn sm" id="t-mus">${d.music?'Trocar música':'Escolher música…'}</button>${d.music?'<button class="btn sm" id="t-musx">Remover</button>':''}</div><span class="hint" id="t-musn">${d.music?esc(d.music.name||'música'):'MP3, M4A ou OGG. Toca ao apresentar; tecla M liga e desliga.'}</span></div>
  ${d.music?`<div class="f"><label for="t-mvol">Volume</label><input type="range" id="t-mvol" min="5" max="100" value="${d.music.vol||60}"></div>
  <label class="chk"><input type="checkbox" id="t-msync"${d.music.sync===false?'':' checked'}> Animações no ritmo (fundo pulsa na batida e a troca de slide espera o próximo tempo)</label>`:''}
  <label class="chk"><input type="checkbox" id="t-mouse"${d.mouse===false?'':' checked'}> Fundo reage ao mouse e ao laser</label>
  <label class="chk"><input type="checkbox" id="t-calm"${d.calm?' checked':''}> Movimento reduzido ao apresentar (para quem é sensível a animações)</label>
  <div class="sec">Marca</div><div class="f"><label>Logo (aparece na capa, rodapé e núcleo)</label><div id="logoBox"></div><span class="hint">PNG ou SVG transparente funciona melhor.</span></div>
  <button class="btn sm" id="brandKit"${th.logo?'':' disabled'}>✨ Criar tema com as cores da logo</button>
  <div class="f"><label for="t-ft">Texto do rodapé</label><input type="text" id="t-ft" value="${esc(d.footerText||'')}" placeholder="${esc(d.name||'')}"></div>
  <label class="chk"><input type="checkbox" id="t-fon"${d.footer===false?'':' checked'}> Mostrar rodapé</label>
  <div class="sec">Faixa de cabeçalho</div>
  <label class="chk"><input type="checkbox" id="h-on"${hd.on?' checked':''}> Mostrar faixa de ponta a ponta no topo</label>
  <div id="h-box"${hd.on?'':' hidden'}>
  <div class="f"><label for="h-tx">Texto da faixa</label><input type="text" id="h-tx" value="${esc(hd.text||'')}" placeholder="${esc(d.name||'Nome do tema')}"></div>
  <div class="f"><label>Imagem da faixa (larga, ex.: 1920×120)</label><div id="h-img"></div><span class="hint">Sem imagem, a faixa usa as cores do tema. Capa e slides de tela cheia ficam sem faixa (dá para mudar em cada slide).</span></div>
  <label class="chk"><input type="checkbox" id="h-logo"${hd.logo!==false?' checked':''}> Mostrar a logo na faixa</label></div>
  <div class="sec">Avanço automático (TV, quiosque, vídeo)</div>
  <div class="f"><label for="t-auto">Tempo por slide ao apresentar</label><input type="number" id="t-auto" min="0" step="0.5" placeholder="desligado" value="${auto.secs||''}"><span class="hint">segundos. Vazio = só avança com clique ou teclado. Cada slide pode ter o próprio tempo.</span></div>
  <label class="chk"><input type="checkbox" id="t-loop"${auto.loop?' checked':''}> Recomeçar do início ao terminar</label>`;
  pane.querySelectorAll('.sw[data-p]').forEach(b=>b.onclick=()=>{ d.theme={preset:b.dataset.p,logo:th.logo}; ch(); themePane(pane); });
  pane.querySelectorAll('.sw.mine').forEach(b=>{ const apply=e=>{ if(e.target.closest('[data-del]')) return; const m=myThemes[+b.dataset.m]; d.theme=Object.assign(clone(m.theme),{custom:m.name,logo:m.theme.logo||th.logo}); ch(); themePane(pane); }; b.onclick=apply; b.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); apply(e); } }; });
  pane.querySelectorAll('[data-del]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const m=myThemes[+b.dataset.del]; confirmBox('Apagar o tema “'+m.name+'”?','Apagar',()=>{ myThemes.splice(+b.dataset.del,1); saveThemes(); themePane(pane); }); });
  $('#saveTheme').onclick=()=>{ const m=modal(`<h3>Salvar tema</h3><p class="sub">Fica disponível em todas as apresentações deste navegador.</p><div class="f"><label for="thName">Nome do tema</label><input type="text" id="thName" value="${esc(th.custom||'')}" placeholder="Ex.: Azul da empresa"></div><label class="chk" style="margin-top:10px"><input type="checkbox" id="thLogo"${th.logo?' checked':''}> Incluir a logo</label><div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok>Salvar</button></div>`,'confirm');
    const inp=m.el.querySelector('#thName'); inp.focus();
    m.el.querySelector('[data-c]').onclick=m.close;
    const ok=()=>{ const name=inp.value.trim()||'Meu tema'; const theme=Object.assign({},eff,clone(th)); delete theme.name; delete theme.custom; if(!m.el.querySelector('#thLogo').checked) delete theme.logo;
      const ix=myThemes.findIndex(x=>x.name===name); if(ix>=0) myThemes[ix]={name,theme}; else myThemes.push({name,theme});
      th.custom=name; saveThemes(); touch(); m.close(); themePane(pane); setStatus('Tema salvo',true); };
    m.el.querySelector('[data-ok]').onclick=ok; inp.onkeydown=e=>{ if(e.key==='Enter') ok(); }; };
  pane.querySelectorAll('.colors input').forEach(i=>i.oninput=()=>{ th[i.id.slice(2)]=i.value; ch(); });
  $('#t-light').onchange=e=>{ th.light=e.target.checked; ch(); };
  $('#t-shape').onchange=e=>{ th.shape=e.target.value; ch(); };
  $('#t-cards').onchange=e=>{ th.cards=e.target.value; ch(); };
  $('#t-w').onchange=e=>{ th.weight=+e.target.value; ch(); };
  $('#t-glow').onchange=e=>{ th.glow=e.target.checked; ch(); };
  $('#t-grain').onchange=e=>{ th.grain=e.target.checked; ch(); };
  $('#t-fd').onchange=e=>{ th.fontDisplay=e.target.value; ch(); };
  $('#t-fb').onchange=e=>{ th.fontBody=e.target.value; ch(); };
  $('#t-bg').onchange=e=>{ th.background=e.target.value; ch(); };
  $('#t-ft').oninput=e=>{ d.footerText=e.target.value; ch(); };
  $('#t-tr').onchange=e=>{ if(e.target.value==='deslizar') delete d.tr; else d.tr=e.target.value; touch(); renderPreview(false); };
  $('#t-mus').onclick=()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='audio/*'; inp.onchange=async()=>{ const f=inp.files[0]; if(!f) return;
      if(f.size>25e6){ setStatus('Música muito grande (máx. 25 MB)'); return; } setStatus('Guardando a música…');
      let src=''; if(assets){ try{ src='asset:'+(await assets.upload(f)).id; }catch(_){ src=''; } }
      if(!src){ try{ await IDB.set('music-'+curId,f); }catch(err){ setStatus('Não foi possível guardar a música neste navegador'); return; } }
      d.music={name:f.name,vol:(d.music&&d.music.vol)||60,sync:d.music?d.music.sync:true,src}; touch(); renderPane(); setStatus('Música pronta: '+f.name,true); }; inp.click(); };
  if($('#t-musx')) $('#t-musx').onclick=()=>{ delete d.music; IDB.set('music-'+curId,null).catch(()=>{}); touch(); renderPane(); };
  if($('#t-mvol')) $('#t-mvol').oninput=e=>{ d.music.vol=+e.target.value; touch(); };
  if($('#t-msync')) $('#t-msync').onchange=e=>{ d.music.sync=e.target.checked; touch(); };
  $('#t-mouse').onchange=e=>{ if(e.target.checked) delete d.mouse; else d.mouse=false; touch(); renderPreview&&renderPreview(true); };
  $('#t-calm').onchange=e=>{ if(e.target.checked) d.calm=true; else delete d.calm; touch(); };
  $('#brandKit').onclick=async()=>{ setStatus('Lendo as cores da logo…'); try{ const k=await brandKit(D.resolveImage(th.logo),eff.light); if(!k) return setStatus('Não achei cores marcantes na logo (ela é só preto e branco?)'); Object.assign(th,k,{custom:'Kit da marca'}); ch(); themePane(pane); setStatus('Tema criado com as cores da marca',true); }catch(e){ setStatus('Não consegui ler a imagem da logo'); } };
  $('#t-fon').onchange=e=>{ d.footer=e.target.checked?undefined:false; if(d.footer===undefined) delete d.footer; ch(); };
  const autoCh=()=>{ const secs=parseFloat($('#t-auto').value), loop=$('#t-loop').checked; if(secs>0||loop) d.auto={secs:secs>0?secs:0,loop}; else delete d.auto; touch(); };
  $('#t-auto').oninput=autoCh; $('#t-loop').onchange=autoCh;
  $('#logoBox').appendChild(imageField(th,'logo','t-logo',ch));
  const H=()=>d.header||(d.header={on:false});
  $('#h-on').onchange=e=>{ H().on=e.target.checked; $('#h-box').hidden=!e.target.checked; ch(); };
  $('#h-tx').oninput=e=>{ H().text=e.target.value; ch(); };
  $('#h-logo').onchange=e=>{ if(e.target.checked) delete H().logo; else H().logo=false; ch(); };
  $('#h-img').appendChild(imageField(H(),'image','h-image',ch));
}

/* ---------- imagens ---------- */
let pickCb=null;
function pickImage(cb){ pickCb=cb; $('#fileIn').value=''; $('#fileIn').click(); }
$('#fileIn').onchange=async e=>{
  const f=e.target.files[0]; if(!f||!pickCb) return; const cb=pickCb; pickCb=null;
  setStatus('Enviando imagem…');
  if(assets){ try{ const r=await assets.upload(f); cb('asset:'+r.id); setStatus('Imagem enviada',true); return; }catch(err){ /* cai para o modo local */ } }
  try{ cb(await shrink(f,1400,.82)); setStatus('Imagem guardada no arquivo',true); }catch(err){ setStatus('Não consegui ler a imagem'); }
};
function shrink(file,max,q){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=rej; r.onload=()=>{ const img=new Image(); img.onerror=rej; img.onload=()=>{ const s=Math.min(1,max/Math.max(img.width,img.height)); const c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/webp',q)); }; img.src=r.result; }; r.readAsDataURL(file); }); }

/* ---------- modais ---------- */
function modal(html,cls){ const m=document.createElement('div'); m.className='modal'; m.innerHTML=`<div class="sheet ${cls||''}" role="dialog" aria-modal="true">${html}</div>`; m.onclick=e=>{ if(e.target===m) close(); }; const close=()=>{ m.remove(); document.removeEventListener('keydown',k); }; const k=e=>{ if(e.key==='Escape') close(); }; document.addEventListener('keydown',k); document.body.appendChild(m); return {el:m,close}; }
function confirmBox(msg,okTxt,fn){ const m=modal(`<h3>${esc(msg)}</h3><p class="sub">Essa ação não pode ser desfeita.</p><div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok style="background:var(--ui-danger);border-color:var(--ui-danger)">${esc(okTxt)}</button></div>`,'confirm'); m.el.querySelector('[data-c]').onclick=m.close; m.el.querySelector('[data-ok]').onclick=()=>{ m.close(); fn(); }; }
function gallery(kind){
  const d=deck();
  const lib=kind!=='swap'&&myLib.length?`<div class="sec" style="padding:4px 0 8px">Minha biblioteca</div><div class="gal lib">${myLib.map((x,i)=>`<div class="gcard libc" data-lib="${i}" role="button" tabindex="0"><div class="tv"></div><b>${esc(x.name)}</b><small>${esc((T[x.slide.t]||{}).name||'')} · guardado em ${new Date(x.at).toLocaleDateString('pt-BR')}</small><button class="lib-del" data-del="${i}" title="Remover da biblioteca" aria-label="Remover da biblioteca">×</button></div>`).join('')}</div><div class="sec" style="padding:14px 0 8px">Modelos</div>`:'';
  const m=modal(`<h3>${kind==='swap'?'Trocar modelo do slide':'Escolha um modelo'}</h3><p class="sub">${kind==='swap'?'Título, rótulo e texto de apoio são mantidos.':'O slide entra depois do selecionado, com texto de exemplo para você editar.'}</p>${lib}<div class="gal">${Object.entries(T).map(([k,t])=>`<button class="gcard" data-t="${k}"><div class="tv"></div><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>`);
  m.el.querySelectorAll('.libc').forEach(c=>{ const x=myLib[+c.dataset.lib]; try{ D.renderStatic(c.querySelector('.tv'),{theme:d.theme,name:d.name,footerText:d.footerText,footer:d.footer,slides:[clone(x.slide)]},0); }catch(_){}
    const ins=()=>{ m.close(); const ns=Object.assign(clone(x.slide),{id:uid()}); D.fillDefaults(ns); d.slides.splice(sel+1,0,ns); sel=Math.min(sel+1,d.slides.length-1); touch(); renderRail(); renderPreview(true); tab='content'; renderPane(); setStatus('“'+x.name+'” inserido',true); };
    c.onclick=e=>{ if(e.target.closest('[data-del]')) return; ins(); }; c.onkeydown=e=>{ if(e.key==='Enter') ins(); };
    c.querySelector('[data-del]').onclick=async e=>{ e.stopPropagation(); myLib.splice(+c.dataset.lib,1); await saveLib(); m.close(); gallery(kind); }; });
  m.el.querySelectorAll('.gcard[data-t]').forEach(c=>{ const k=c.dataset.t; D.renderStatic(c.querySelector('.tv'),{theme:d.theme,name:d.name,footerText:d.footerText,footer:d.footer,slides:[{t:k,d:T[k].sample}]},0);
    c.onclick=()=>{ m.close();
      if(kind==='swap'){ const s=d.slides[sel]; const keep={}; ['kicker','title','lead','image','showLogo'].forEach(x=>{ if(s.d&&s.d[x]!=null&&T[k].fields.some(f=>f.k===x)) keep[x]=s.d[x]; }); s.t=k; s.d=Object.assign(clone(T[k].sample),keep); }
      else { d.slides.splice(sel+1,0,{id:uid(),t:k,d:clone(T[k].sample)}); sel=Math.min(sel+1,d.slides.length-1); }
      touch(); renderRail(); renderPreview(true); tab='content'; renderPane(); }; });
}
$('#deckMenu').onclick=()=>{
  const m=modal(`<h3>Apresentações</h3><p class="sub">${mode==='db'?'Salvas na sua conta, disponíveis em qualquer aparelho.':'Salvas só neste navegador.'}</p><div class="menu">
  <button class="btn" data-a="new">+ Nova apresentação</button><button class="btn" data-a="vitrine">Começar de uma apresentação pronta</button><button class="btn" data-a="texto">Criar a partir de um texto corrido (relatório, e-mail, ata)</button><button class="btn" data-a="script">Criar a partir de um roteiro (texto)</button><button class="btn" data-a="dup">Duplicar esta apresentação</button>
  <div class="sec">Qualidade</div><button class="btn" data-a="review">Revisar apresentação (nota de qualidade)</button>
  <div class="sec">Apresentar</div><button class="btn" data-a="ensaio">Ensaiar com cronômetro (tempo por slide e relatório)</button><button class="btn" data-a="stage">Modo palco (tela de espera com contagem regressiva)</button>
  <div class="sec">Exportar</div><button class="btn" data-a="pdf">Salvar em PDF (um slide por página)</button><button class="btn" data-a="rec">Gravar vídeo (narração, trilha, horizontal ou vertical)</button>
  <div class="sec">Backup</div><button class="btn" data-a="versoes">Histórico de versões (voltar no tempo)</button><button class="btn" data-a="bk">Baixar backup de todas (.json)</button><button class="btn" data-a="im">Importar backup (.json)</button>
  <button class="btn danger" data-a="del">Excluir esta apresentação</button></div>`,'confirm');
  const on=(a,fn)=>{ m.el.querySelector(`[data-a="${a}"]`).onclick=()=>{ m.close(); fn(); }; };
  on('bk',async()=>{ try{ await saveFile('estudio-motion-backup.json',JSON.stringify(decks,null,1),'application/json'); setStatus('Backup baixado',true); }catch(e){ setStatus('Backup cancelado'); } });
  on('im',()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
    inp.onchange=async()=>{ try{ const data=JSON.parse(await inp.files[0].text()); const add=data&&Array.isArray(data.slides)?{[uid()]:data}:data; let n=0;
      for(const [id,dk] of Object.entries(add||{})){ if(dk&&Array.isArray(dk.slides)){ const nid=decks[id]?uid():id; decks[nid]=normalize(dk); curId=nid; n++; if(mode==='db') db.doc('decks/'+nid).set(clone(dk)).catch(()=>setStatus('Uma apresentação importada não coube na nuvem')); } }
      if(!n) throw new Error('vazio'); if(mode!=='db') localSave(); sel=0; renderAll(); setStatus(n===1?'1 apresentação importada':n+' apresentações importadas',true);
    }catch(e){ setStatus('Arquivo de backup inválido'); } };
    inp.click(); });
  on('new',()=>{ const id=uid(); decks[id]=starter(); curId=id; sel=0; touch(); renderAll(); });
  on('versoes',versionsDialog); on('script',()=>scriptDialog()); on('texto',textDialog);
  on('vitrine',showcaseDialog);
  on('pdf',exportPDF);
  on('rec',recordVideo);
  on('stage',stageDialog); on('ensaio',rehearseDialog);
  on('review',reviewDialog);
  on('dup',()=>{ const id=uid(); decks[id]=Object.assign(clone(deck()),{name:(deck().name||'Apresentação')+' (cópia)'}); curId=id; sel=0; touch(); renderAll(); });
  on('del',()=>{ confirmBox('Excluir “'+(deck().name||'Sem nome')+'”?','Excluir',async()=>{ const id=curId; delete decks[id]; delete hist[id]; if(mode==='db'){ try{ await db.doc('decks/'+id).delete(); }catch(e){ setStatus('Não consegui excluir'); } } else localSave(); if(!Object.keys(decks).length){ const n=uid(); decks[n]=starter(); } curId=Object.keys(decks)[0]; sel=0; renderAll(); }); });
};

/* ---------- roteiro em texto → slides ---------- */
const SCRIPT_HELP=`# Título da apresentação
Frase de abertura (vira o subtítulo da capa)

# Três frentes {cartoes}
[O desafio]
- Custos: valores claros
- Materiais: sem duplicidade
- Acompanhamento: visão comum
Nota: lembrar de citar o caso de março.

# Resultados
- R$ 1.250.000: economia no período
- 832: reservas analisadas

# Obrigado!
- Mais visibilidade
- Decisões justificadas`;
function scriptDialog(init){
  const m=modal(`<h3>Criar a partir de um roteiro</h3><p class="sub">Cada <code>#</code> começa um slide. O modelo é escolhido sozinho, ou force com <code>{cartoes}</code>, <code>{fluxo}</code>, <code>{numeros}</code>… <code>[Rótulo]</code> vira o rótulo, <code>- item</code> vira tópico (use <code>Título: texto</code> para cartões e números) e <code>Nota:</code> vai para as notas do apresentador.</p>
  <textarea id="scr" rows="16" style="width:100%;font-family:var(--ui-m);font-size:12px" placeholder="${esc(SCRIPT_HELP)}"></textarea>
  ${guideHTML()}
  <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn" data-add>Adicionar ao final desta</button><button class="btn pri" data-new>Criar nova apresentação</button></div>`);
  const ta=m.el.querySelector('#scr'); if(init) ta.value=init; ta.focus(); wireGuide(m.el);
  m.el.querySelector('[data-c]').onclick=m.close;
  const run=asNew=>{ const slides=varyLayouts(parseScript(ta.value||'')); if(!slides.length){ ta.value=ta.value||SCRIPT_HELP; return; }
    m.close();
    if(asNew){ const id=uid(); const title=String(slides[0].d.title||'Nova apresentação').replace(/[*`\n]/g,' ').trim(); decks[id]={name:title,theme:clone(deck().theme||{preset:'eletrico'}),footerText:'',updatedAt:Date.now(),slides}; curId=id; sel=0; }
    else { const d=deck(); d.slides.push(...slides.map(s=>s.t==='capa'?Object.assign(s,{t:'destaque',d:D.fillDefaults({t:'destaque',d:{kicker:s.d.kicker,title:s.d.title,lead:s.d.lead}}).d}):s)); sel=d.slides.length-slides.length; }
    touch(); renderAll(); setStatus(slides.length+' slides criados',true); };
  m.el.querySelector('[data-new]').onclick=()=>run(true);
  m.el.querySelector('[data-add]').onclick=()=>run(false);
}
/* ---------- apresentações prontas (vitrine) ---------- */
const SHOWCASES=[
 {name:'Cidades que pensam',preset:'eletrico',desc:'Vitrine completa: partículas 3D, globo em tour, barras 3D em modo cinema, túnel, ícones animados e voo pela tela infinita.',deck:{"name":"Cidades que pensam","theme":{"preset":"eletrico"},"footerText":"Cidades que pensam · 2035","slides":[{"t":"particulas3d","d":{"word":"2035","shape":"galaxia","kicker":"Cidades inteligentes","title":"Cidades que *pensam*","lead":"Como dados, energia e pessoas vão redesenhar o lugar onde vivemos."},"notes":"Deixe as partículas formarem 2035 antes de falar. Abra com uma pergunta: “Como vai ser acordar na sua cidade daqui a dez anos?”"},{"t":"destaque","tr":"zoom","d":{"kicker":"O ponto de virada","title":"7 em cada 10 pessoas\n*viverão em cidades*","lead":"até 2050, segundo a ONU. A infraestrutura de hoje não foi pensada para isso.","image":""},"notes":"Pausa depois do número. A mensagem é: a cidade vai crescer de qualquer jeito; a escolha é se ela cresce inteligente ou caótica."},{"t":"numeros","d":{"kicker":"O custo de não mudar","title":"O que a cidade *desperdiça*","stats":[{"label":"Água","prefix":"","value":"37","suffix":"%","text":"da água tratada se perde antes de chegar às casas no Brasil.","badge":"Perdas na distribuição"},{"label":"Energia","prefix":"","value":"30","suffix":"%","text":"da energia usada em prédios é desperdiçada.","badge":""},{"label":"Iluminação","prefix":"até ","value":"60","suffix":"%","text":"de economia com iluminação pública LED inteligente.","badge":""}]},"notes":"Números de referência para ilustrar a ordem de grandeza. Confirme as fontes antes de apresentar para um público técnico."},{"t":"cartoes","tr":"voo","d":{"kicker":"Os quatro pilares","title":"Uma cidade que *sente, decide e age*","lead":"","numbered":false,"cards":[{"icon":"globo","label":"Sensores","title":"Enxergar tudo","text":"Milhares de sensores medem trânsito, ar e consumo em tempo real."},{"icon":"ideia","label":"Inteligência","title":"Antecipar","text":"Modelos preveem a demanda antes de o problema aparecer."},{"icon":"raio","label":"Energia","title":"Equilibrar","text":"Uma rede que distribui sol e vento para onde for preciso."},{"icon":"pessoas","label":"Cidadãos","title":"Participar","text":"Serviços públicos num toque e dados abertos para todos."}]},"notes":"A câmera voa pela tela infinita até aqui. Explique os pilares como um ciclo: sentir, entender, agir, envolver as pessoas."},{"t":"globo3d","tr":"voo","d":{"camera":"tour","kicker":"Quem já está fazendo","title":"O mundo *em rede*","lead":"Cidades que viraram laboratórios vivos de inovação urbana.","stats":["7 referências","4 continentes"],"points":[{"label":"Curitiba","lat":"-25.4","lon":"-49.3"},{"label":"Toronto","lat":"43.7","lon":"-79.4"},{"label":"Barcelona","lat":"41.4","lon":"2.2"},{"label":"Amsterdã","lat":"52.4","lon":"4.9"},{"label":"Copenhague","lat":"55.7","lon":"12.6"},{"label":"Seul","lat":"37.6","lon":"127"},{"label":"Singapura","lat":"1.35","lon":"103.8"}]},"notes":"O globo visita cada cidade. Comente um exemplo rápido por parada: Curitiba (transporte), Barcelona (sensores), Copenhague (energia), Singapura (gêmeo digital)."},{"t":"barras3d","tr":"zoom","d":{"camera":"cinema","kicker":"O retorno","title":"Economia projetada *por área*","lead":"","unit":"R$ milhões por ano","bars":[{"label":"Iluminação","value":"42","hot":false},{"label":"Água","value":"68","hot":false},{"label":"Trânsito","value":"95","hot":false},{"label":"Energia","value":"140","hot":true}]},"notes":"Valores de exemplo para uma cidade de porte médio. Deixe a câmera pousar na barra de Energia e só então fale do número."},{"t":"fluxo","tr":"voo","d":{"kicker":"Como implantar","title":"Do piloto à *cidade inteira*","lead":"","steps":[{"icon":"alvo","tag":"Meses 1 a 3","title":"Diagnóstico","text":"Mapear dados e as dores prioritárias.","hot":false},{"icon":"engrenagem","tag":"Meses 4 a 9","title":"Piloto","text":"Um bairro, metas claras e medição.","hot":true},{"icon":"grafico","tag":"Ano 1","title":"Escala","text":"Expandir só o que provou valor.","hot":false},{"icon":"estrela","tag":"Ano 2 em diante","title":"Plataforma","text":"Dados abertos e parceiros conectados.","hot":false}],"noteTitle":"Regra de ouro:","note":"nenhuma tecnologia entra sem um problema real para resolver."},"notes":"Destaque o piloto: é ali que se ganha a confiança da população e dos gestores."},{"t":"comparacao","tr":"subir","d":{"kicker":"A diferença no dia a dia","title":"A rotina *antes e depois*","leftTitle":"Cidade reativa","left":["O buraco é consertado depois da reclamação","Semáforo com tempo fixo, com ou sem carros","A conta de luz chega como surpresa"],"rightTitle":"Cidade que pensa","right":["O sensor avisa antes de quebrar","O semáforo se adapta ao fluxo","O consumo aparece em tempo real"]},"notes":"Traga para a vida real: peça que a plateia pense no último problema que teve com a cidade."},{"t":"tunel3d","tr":"zoom","d":{"style":"estrelas","kicker":"Capítulo final","title":"A cidade do futuro\n*começa num bairro*","lead":""},"notes":"Silêncio enquanto o túnel desacelera. Leia o título devagar."},{"t":"logo3d","tr":"voo","d":{"image":"","word":"JUNTOS","kicker":"Próximos passos","title":"Vamos começar *pelo seu bairro*?","lead":"Diagnóstico em 90 dias, piloto com metas claras e dados abertos desde o primeiro dia."},"notes":"Deixe as partículas montarem a palavra. Termine com o convite e abra para perguntas."}]}},
 {name:'Narrativa em movimento',preset:'vinho',magic:true,desc:'Movimento mágico: títulos, números e imagens viajam de um slide para o outro, como em um filme.',script:`# A jornada *do projeto* {destaque}\n[Capítulo 1]\nDe uma planilha compartilhada a uma plataforma de decisão.\n\n# A jornada *do projeto* {cartoes}\n[Capítulo 1]\n- Começo: uma planilha compartilhada\n- Virada: dados integrados em um só lugar\n- Hoje: decisões em minutos, com histórico\n\n# O que *mudou* {numeros}\n[Capítulo 2]\n- R$ 1.250.000: economia no período\n- 832: decisões analisadas\n\n# O que *mudou* {painel}\n[Capítulo 2]\n- Economia: 1.250.000\n- Decisões: 832\n- No prazo: 94%\n- Pendências: 27\n- Área | Decisões | Economia\n- Funilaria | 312 | R$ 410 mil\n- Pintura | 208 | R$ 260 mil\n- Montagem | 145 | R$ 180 mil\n\n# Próximo *capítulo* {destaque}\n[Capítulo 3]\nLevar para todas as áreas até dezembro.\n\n# Obrigado\n- Mais visibilidade\n- Decisões justificadas\n- Rastreabilidade`},
 {name:'Pitch de negócio',preset:'aurora',desc:'OnePage com 6 blocos que abrem slides ocultos de detalhe. Ideal para apresentar só uma tela e aprofundar quando perguntarem.',header:{on:true,text:'Pitch · Rodada Seed 2026'},script:`# Nome da empresa\nUma frase que explica o que vocês fazem, em poucas palavras.\n- Rodada Seed 2026\n- 12 clientes piloto\n- Fundada em 2025\n\n# O negócio em uma tela {onepage}\n[Resumo]\n- Problema: 30% do tempo perdido procurando informação\n- Solução: uma base única com busca inteligente\n- Mercado: R$ 4 bi no Brasil\n- Tração: 12 clientes piloto\n- Modelo: assinatura por usuário\n- Equipe: 4 fundadores técnicos\nNota: apresente só esta tela e abra os blocos conforme as perguntas.\n\n# Problema (oculto) {destaque}\n[O problema]\nEquipes perdem horas por semana procurando dados espalhados em planilhas, e-mails e sistemas.\n\n# Solução (oculto) {tela}\n[A solução]\n- Integra: conecta planilhas e sistemas em minutos\n- Encontra: busca em linguagem natural\n- Alerta: avisa quando algo sai do padrão\n\n# Mercado (oculto) {numeros}\n[Tamanho do mercado]\n- R$ 4 bi: mercado total no Brasil\n- 38 mil: empresas médias no perfil\n- 18%: crescimento ao ano\n\n# Tração (oculto) {grafico}\n[Tração]\n- Jan: 2\n- Fev: 4\n- Mar: 7\n- Abr: 12\n\n# Modelo (oculto) {cartoes}\n[Como ganhamos dinheiro]\n- Essencial: R$ 49 por usuário ao mês\n- Profissional: R$ 89 com integrações\n- Empresa: contrato anual sob medida\n\n# Equipe (oculto) {equipe}\n[Quem faz]\n- Pessoa 1: Produto\n- Pessoa 2: Engenharia\n- Pessoa 3: Dados\n- Pessoa 4: Vendas\n\n# Vamos conversar?\n- Investimento de R$ 2 mi\n- 18 meses de pista\n- Meta: 100 clientes pagantes`},
 {name:'Resultados do trimestre',preset:'editorial',desc:'Números, gráfico, comparação e tabela num visual editorial claro.',header:{on:true,text:'Resultados · 3º trimestre de 2026'},script:`# Resultados do 3º trimestre\nO que entregamos, o que aprendemos e o que vem a seguir.\n- Jul a Set 2026\n- Diretoria de Operações\n\n# Os números do trimestre {numeros}\n[Visão geral]\n- R$ 1.250.000: economia acumulada\n- 832: decisões analisadas\n- 94%: dentro do prazo\n\n# Evolução mês a mês {grafico}\n[Economia em R$ mil]\n- Abr: 120\n- Mai: 180\n- Jun: 210\n- Jul: 260\n- Ago: 330\n- Set: 410\n\n# Antes e depois {comparacao}\n[O que mudou]\n- Planilhas soltas\n- Decisão sem histórico\n- Retrabalho mensal\n- Uma base única\n- Cada decisão justificada\n- Alertas automáticos\n\n# Desempenho por área {tabela}\n[Comparativo]\n- Funilaria: 312 | R$ 410 mil\n- Pintura: 208 | R$ 260 mil\n- Montagem: 145 | R$ 180 mil\n\n# Próximo trimestre {agenda}\n[Plano]\n- Outubro: levar para mais duas áreas\n- Novembro: painel para a diretoria\n- Dezembro: revisão anual\n\n# Obrigado\n- Mais visibilidade\n- Decisões justificadas\n- Rastreabilidade`},
 {name:'Lançamento de produto',preset:'grafite',desc:'Efeitos cinematográficos: revelar, mergulho 3D, galeria 3D e paralaxe. Troque as imagens de exemplo pelas suas.',script:`# Apresentamos o novo produto\nUma nova forma de trabalhar com os seus dados.\n- Lançamento 2026\n\n# A nova fase {revelar}\n[Lançamento]\nMais simples, mais rápido e feito para equipes.\n\n# Do rascunho ao produto {mergulho}\n[A jornada]\n- O primeiro protótipo\n- Os primeiros clientes\n- O produto final\n\n# Feito para cada equipe {galeria3d}\n[Casos de uso]\n- Operações\n- Finanças\n- Compras\n- Manutenção\n- Diretoria\n- Qualidade\n\n# FUTURO {paralaxe}\n[Edição 2026]\n\n# Pela primeira vez, a gente *decide olhando o mesmo número* {citacao}\nNome da pessoa\n\n# Disponível hoje\n- Teste grátis por 30 dias\n- Migração assistida\n- Suporte em português`}
];
const buildShowcase=x=>{ if(x.deck){ const dk=clone(x.deck); dk.slides.forEach(s=>{ s.id=uid(); D.fillDefaults(s); }); return Object.assign(dk,{updatedAt:Date.now()}); } const slides=parseScript(x.script); if(x.magic) slides.forEach((s,i)=>{ if(i) s.tr='magico'; }); return {name:x.name,theme:{preset:x.preset},footerText:'',updatedAt:Date.now(),slides,...(x.header?{header:clone(x.header)}:{})}; };
function showcaseDialog(){
  const m=modal(`<h3>Começar de uma apresentação pronta</h3><p class="sub">Cria uma apresentação nova, com textos de exemplo para você trocar. Nada do que você já tem é alterado.</p><div class="gal">${SHOWCASES.map((x,i)=>`<button class="gcard" data-v="${i}"><div class="tv"></div><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></button>`).join('')}</div>`);
  const build=buildShowcase;
  m.el.querySelectorAll('.gcard').forEach(c=>{ const x=SHOWCASES[+c.dataset.v], dk=build(x); D.renderStatic(c.querySelector('.tv'),dk,dk.slides.findIndex(s=>s.t==='onepage')>0?1:0);
    c.onclick=()=>{ m.close(); const id=uid(); decks[id]=build(x); curId=id; sel=0; touch(); renderAll(); setStatus('“'+x.name+'” criada',true); }; });
}
/* ---------- tags de modelo: {grafico}, {globo}, {cartoes}… (com ou sem acento) ---------- */
const TAG_ALIAS={combo:'combo',barraselinha:'combo',barraslinha:'combo',projecao:'combo',realizadoxprojecao:'combo',grafico:'grafico',graficos:'grafico',barras:'grafico',colunas:'grafico',barrash:'barrash',ranking:'barrash',barrashorizontais:'barrash',pizza:'pizza',rosca:'pizza',donut:'pizza',linha:'linha',area:'linha',evolucao:'linha',medidores:'medidores',metas:'medidores',medidor:'medidores',funil:'funil',matriz:'matriz',swot:'matriz',
  globo:'globo3d',globo3d:'globo3d',mapa:'globo3d',mundo:'globo3d',barras3d:'barras3d',grafico3d:'barras3d',particulas:'particulas3d',particulas3d:'particulas3d',tunel:'tunel3d',tunel3d:'tunel3d',logo:'logo3d',logo3d:'logo3d',
  cartoes:'cartoes',cartao:'cartoes',cards:'cartoes',card:'cartoes',numeros:'numeros',indicadores:'numeros',kpi:'numeros',kpis:'numeros',fluxo:'fluxo',etapas:'fluxo',processo:'fluxo',passos:'fluxo',
  linhadotempo:'agenda',agenda:'agenda',cronograma:'agenda',timeline:'agenda',comparacao:'comparacao',antesedepois:'comparacao',versus:'comparacao',tabela:'tabela',citacao:'citacao',frase:'citacao',depoimento:'citacao',
  equipe:'equipe',time:'equipe',onepage:'onepage',resumo:'onepage',painel:'painel',dashboard:'painel',capa:'capa',abertura:'capa',destaque:'destaque',secao:'destaque',encerramento:'encerramento',fim:'encerramento',conclusao:'encerramento',
  imagem:'imagem',foto:'imagem',video:'video',convergencia:'convergencia',tela:'tela',sistema:'tela',galeria:'galeria3d',galeria3d:'galeria3d',mergulho:'mergulho',revelar:'revelar',paralaxe:'paralaxe'};
const tagOf=v=>{ if(!v) return null; const k=String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); const t=TAG_ALIAS[k]||k; return T[t]?t:null; };
const TAG_RE=/\s*\{\s*([\wÀ-ÿ -]+?)\s*\}\s*$/;
/* cidades conhecidas para o globo (ou informe "Cidade: lat, lon") */
const GEO={'sao paulo':[-23.55,-46.63],'rio de janeiro':[-22.91,-43.17],'brasilia':[-15.79,-47.88],'belo horizonte':[-19.92,-43.94],'curitiba':[-25.43,-49.27],'porto alegre':[-30.03,-51.23],'salvador':[-12.97,-38.5],'recife':[-8.05,-34.9],'fortaleza':[-3.73,-38.52],'manaus':[-3.12,-60.02],'belem':[-1.46,-48.5],'goiania':[-16.69,-49.26],'florianopolis':[-27.6,-48.55],'vitoria':[-20.32,-40.34],'campinas':[-22.91,-47.06],'betim':[-19.97,-44.2],'contagem':[-19.93,-44.05],
  'buenos aires':[-34.6,-58.38],'santiago':[-33.45,-70.67],'lima':[-12.05,-77.04],'bogota':[4.71,-74.07],'cidade do mexico':[19.43,-99.13],'mexico':[19.43,-99.13],'nova york':[40.71,-74.01],'new york':[40.71,-74.01],'miami':[25.76,-80.19],'chicago':[41.88,-87.63],'los angeles':[34.05,-118.24],'sao francisco':[37.77,-122.42],'toronto':[43.65,-79.38],'montreal':[45.5,-73.57],
  'lisboa':[38.72,-9.14],'porto':[41.15,-8.61],'madri':[40.42,-3.7],'madrid':[40.42,-3.7],'barcelona':[41.39,2.17],'paris':[48.86,2.35],'londres':[51.51,-0.13],'london':[51.51,-0.13],'berlim':[52.52,13.4],'munique':[48.14,11.58],'amsterda':[52.37,4.9],'amsterdam':[52.37,4.9],'roma':[41.9,12.5],'milao':[45.46,9.19],'turim':[45.07,7.69],'zurique':[47.38,8.54],'copenhague':[55.68,12.57],'estocolmo':[59.33,18.07],'varsovia':[52.23,21.01],'moscou':[55.76,37.62],'istambul':[41.01,28.98],
  'dubai':[25.2,55.27],'cairo':[30.04,31.24],'joanesburgo':[-26.2,28.05],'cidade do cabo':[-33.92,18.42],'lagos':[6.52,3.38],'luanda':[-8.84,13.23],'maputo':[-25.97,32.57],'mumbai':[19.08,72.88],'nova delhi':[28.61,77.21],'delhi':[28.61,77.21],'bangalore':[12.97,77.59],'singapura':[1.35,103.82],'hong kong':[22.32,114.17],'xangai':[31.23,121.47],'shanghai':[31.23,121.47],'pequim':[39.9,116.4],'shenzhen':[22.54,114.06],'toquio':[35.68,139.69],'tokyo':[35.68,139.69],'seul':[37.57,126.98],'sydney':[-33.87,151.21],'melbourne':[-37.81,144.96],
  'brasil':[-14.2,-51.9],'portugal':[39.4,-8.2],'estados unidos':[39.8,-98.6],'eua':[39.8,-98.6],'china':[35.9,104.2],'japao':[36.2,138.3],'alemanha':[51.2,10.4],'italia':[41.9,12.6],'franca':[46.2,2.2],'espanha':[40.5,-3.7],'india':[20.6,78.9],'argentina':[-38.4,-63.6],'chile':[-35.7,-71.5],'mexico pais':[23.6,-102.6],'canada':[56.1,-106.3],'australia':[-25.3,133.8],'africa do sul':[-30.6,22.9],'polonia':[51.9,19.1],'reino unido':[55.4,-3.4],'inglaterra':[52.4,-1.2]};
const geoOf=name=>{ const k=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); return GEO[k]||null; };
const TAG_GUIDE=`COMO MARCAR O TIPO DE CADA SLIDE
Escreva o título do slide numa linha sozinha e coloque o modelo entre chaves no final.
Embaixo, um item por linha começando com "- ". Use "Nome: valor" quando o modelo pedir dois dados.
Sem chaves, o sistema escolhe o modelo sozinho. Acentos são opcionais: {grafico} = {gráfico}.

Vendas por região {grafico}
- Norte: 120
- Sul: 340
- Sudeste: 510

Onde já estamos {globo}
- São Paulo
- Lisboa
- Tóquio
- Minha Cidade: -19.9, -44.0      (cidades fora da lista: latitude, longitude)

Nossos pilares {cartoes}
- Velocidade: entregas em dias, não meses
- Qualidade: cada item revisado duas vezes

Resultados do ano {numeros}
- 94%: disponibilidade dos equipamentos
- R$ 1,2 mi: economia no período

Como funciona {fluxo}
- Diagnóstico: mapear as dores
- Piloto: um bairro, metas claras
- Escala: expandir o que deu certo

Resumo do projeto {onepage}
- Custos: R$ 1,2 mi economizados
- Prazos: 30% mais rápido
Detalhe de custos {destaque} (oculto)

MODELOS E O QUE ESCREVER EM CADA ITEM
{capa}           primeiro slide; itens viram etiquetas
{destaque}       uma frase grande; texto de apoio embaixo, sem itens
{cartoes}        - Título: texto              (até 4)      também {cards}
{numeros}        - 37%: descrição             (até 4)      também {indicadores}
{fluxo}          - Etapa: texto               (até 5)      também {etapas}
{agenda}         - Quando: o que acontece     (até 5)      também {cronograma}
{comparacao}     - itens: metade vira "Antes", metade "Depois"
{tabela}         - Coluna A | Coluna B | Coluna C   (primeira linha = cabeçalho)
{grafico}        - Rótulo: valor              (até 8)      também {barras}
{barrash}        - Rótulo: valor              ranking em barras horizontais
{pizza}          - Fatia: valor               (até 8)      também {rosca}
{linha}          - Jan: valor                 (até 12)     evolução no tempo
{combo}          - Jan: realizado / projeção  (até 12)     barras = realizado, linha = projeção
                 - Jun: / 280   (só projeção)   também {barras e linha} ou {projecao}
{medidores}      - Meta: 0 a 100              (até 4)
{funil}          - Etapa: valor               (até 6)
{matriz}         - Quadrante: item, item      (4 linhas)   também {swot}
{onepage}        - Bloco: valor e texto       (até 6). Um slide "(oculto)" com o mesmo título vira o detalhe do bloco
{painel}         - Indicador: valor           tabela com linhas "A | B | C"
{citacao}        o título é a frase; a linha de baixo é o autor
{equipe}         - Nome: papel                (até 6)
{globo}          - Cidade (ou Cidade: lat, lon)   (até 10; a primeira é o centro)
{barras3d}       - Rótulo: valor              (até 8)      gráfico 3D com câmera
{particulas}     o título vira o texto; a primeira linha de texto vira a palavra formada
{tunel}          abre um capítulo; só título e texto
{logo}           sua logo em partículas 3D; só título e texto
{encerramento}   último slide; itens viram próximos passos

Outros recursos: [Rótulo] numa linha vira o rótulo acima do título; "Nota: ..." vai para as notas do apresentador; (oculto) no fim do título esconde o slide.`;
function guideHTML(){ return `<details class="tag-guide"><summary>Como marcar gráfico, globo, cartões, onepage… (guia para copiar)</summary><pre id="tagGuide">${esc(TAG_GUIDE)}</pre><button class="btn sm" data-copyguide>Copiar guia</button></details>`; }
function wireGuide(root){ const b=root.querySelector('[data-copyguide]'); if(b) b.onclick=async()=>{ try{ await navigator.clipboard.writeText(TAG_GUIDE); b.textContent='Copiado ✓'; }catch(_){ const r=document.createRange(); r.selectNodeContents(root.querySelector('#tagGuide')); const sl=getSelection(); sl.removeAllRanges(); sl.addRange(r); b.textContent='Selecionado: Ctrl+C'; } }; }
/* ---------- texto corrido vira apresentação (sem IA: regras locais) ---------- */
const NUM_RE=/(R\$\s*)?\d[\d.,]*\s*(%|mil\b|milhões|milhão|mi\b|bi\b|bilhões|x\b|vezes)?/i;
function varyLayouts(slides){
  const L=D.LAYOUTS||{}; let prev=null, k=0;
  slides.forEach(s=>{ const opts=L[s.t]?Object.keys(L[s.t]):null;
    if(opts&&prev&&prev.t===s.t){ k=(k+1)%opts.length; if(opts[k]) s.lay=opts[k]; else delete s.lay; }
    else k=opts?Math.max(0,opts.indexOf(s.lay||'')):0;
    prev=s; });
  return slides;
}
function textToScript(txt){
  const clean=String(txt||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').trim(); if(!clean) return '';
  const sentences=t=>(t.match(/(?:[^.!?;]|[.,](?=\d))+[.!?;]?/g)||[]).map(x=>x.trim()).filter(x=>x.length>2);
  const words=t=>t.split(/\s+/).filter(Boolean).length;
  const shorten=(t,n)=>{ const w=t.replace(/[.:;!?]+$/,'').split(/\s+/); return w.length<=n?w.join(' '):w.slice(0,n).join(' ')+'…'; };
  const accent=t=>{ const w=t.split(' '); if(w.length<3||/\*/.test(t)) return t; const n=w.length>6?3:2; return w.slice(0,-n).join(' ')+' *'+w.slice(-n).join(' ')+'*'; };
  const isHead=l=>/^#{1,3}\s/.test(l)||(/:$/.test(l)&&words(l)<=10)||(words(l)<=10&&!/[.;,!?]$/.test(l)&&l.length<80&&!/^[-*•\d]/.test(l))||(l===l.toUpperCase()&&/[A-ZÁÉÍÓÚÇ]{3}/.test(l)&&words(l)<=10);
  const lines=clean.split('\n').map(l=>l.trim());
  /* blocos: um título (se houver) + parágrafos e tópicos até o próximo título */
  const blocks=[]; let cur=null, para=[];
  const flush=()=>{ if(para.length){ (cur||(cur={head:'',items:[],paras:[]},blocks.push(cur),cur)).paras.push(para.join(' ')); para=[]; } };
  lines.forEach(l=>{ if(!l){ flush(); return; }
    if(/^([-*•]|\d+[.)])\s+/.test(l)){ flush(); if(!cur){ cur={head:'',items:[],paras:[]}; blocks.push(cur); } cur.items.push(l.replace(/^([-*•]|\d+[.)])\s+/,'')); return; }
    const tg=TAG_RE.exec(l), hid=/\((?:oculto|oculta)\)\s*$/i.test(l.replace(TAG_RE,''));
    if(tg&&tagOf(tg[1])||isHead(l)){ flush(); let h=l.replace(/^#+\s*/,''); let tag=null; if(tg&&tagOf(tg[1])){ tag=tagOf(tg[1]); h=h.replace(TAG_RE,''); } h=h.replace(/\s*\((?:oculto|oculta)\)\s*$/i,'').replace(/:$/,'').trim(); const m2=TAG_RE.exec(h); if(!tag&&m2&&tagOf(m2[1])){ tag=tagOf(m2[1]); h=h.replace(TAG_RE,''); } cur={head:h,tag,hidden:hid||/\((?:oculto|oculta)\)/i.test(l),items:[],paras:[]}; blocks.push(cur); return; }
    para.push(l); });
  flush();
  /* sem títulos: cada parágrafo vira um bloco */
  const out=[]; let docTitle='';
  if(blocks.length===1&&!blocks[0].head&&blocks[0].paras.length>1){ const b=blocks[0]; blocks.length=0; b.paras.forEach(pp=>blocks.push({head:'',items:b.items.splice(0),paras:[pp]})); }
  if(blocks[0]&&blocks[0].head&&!blocks[0].tag&&!blocks[0].items.length&&blocks[0].paras.length<=1){ docTitle=blocks[0].head; const sub=blocks[0].paras[0]||''; blocks.shift(); out.push('# '+accent(docTitle)); if(sub) out.push(shorten(sentences(sub)[0]||sub,22)); if(sub) out.push('Nota: '+sub); }
  else if(!(blocks[0]&&blocks[0].tag)){ const first=blocks[0]&&(blocks[0].head||sentences(blocks[0].paras[0]||'')[0]||''); docTitle=shorten(first||'Apresentação',8); out.push('# '+accent(docTitle)); }
  const seq=/\b(primeir[oa]|segund[oa]|terceir[oa]|depois|em seguida|por fim|finalmente|etapa|fase|passo)\b/i;
  blocks.forEach((b,bi)=>{
    const text=b.paras.join(' '), ss=sentences(text);
    if(b.tag){ out.push(''); out.push('# '+(/\*/.test(b.head)||['citacao','particulas3d'].includes(b.tag)?b.head:accent(b.head))+' {'+b.tag+'}'+(b.hidden?' (oculto)':'')); b.paras.forEach(pp=>out.push(pp)); b.items.forEach(it=>out.push('- '+it)); return; }
    let title=b.head||shorten(ss[0]||'',9); if(!b.head) ss.shift();
    const items=b.items.slice();
    /* frases com números viram indicadores "37%: texto" */
    const numS=ss.filter(x=>NUM_RE.test(x)&&/\d/.test(x));
    out.push('');
    if(!items.length&&numS.length>=2&&numS.length<=4){
      out.push('# '+accent(title)+' {numeros}');
      numS.forEach(x=>{ const m=x.match(/(R\$\s*)?\d[\d.,]*(?:\s*(%|mil\b|milhões|milhão|bi\b|x\b))?(?:\s+([a-zà-ú]{3,}))?/i); const stop=/^(de|do|da|em|no|na|por|para|com|que|e|ou)$/i; const unit=!m[2]&&m[3]&&!stop.test(m[3])?' '+m[3]:''; out.push('- '+(m[1]||'')+m[0].replace(m[1]||'','').replace(m[3]?new RegExp('\\s+'+m[3]+'$'):/$^/,'').trim()+unit+': '+shorten(x,16)); });
    } else if(!items.length&&ss.filter(x=>seq.test(x)).length>=2){
      out.push('# '+accent(title)+' {fluxo}');
      ss.slice(0,5).forEach(x=>out.push('- '+shorten(x.replace(seq,'').replace(/^[\s,]+/,''),6)+': '+shorten(x,12)+' ->'));
    } else if(items.length||ss.length>=3){
      const its=items.length?items:ss.slice(0,4);
      out.push('# '+accent(title));
      its.slice(0,6).forEach(x=>{ const m=/^(.{3,40}?)\s*[:–—]\s*(.+)$/.exec(x); out.push('- '+(m?m[1]+': '+shorten(m[2],16):shorten(x,4)+': '+shorten(x,16))); });
    } else {
      out.push('# '+accent(title));
      if(ss[0]) out.push(shorten(ss.join(' '),26));
    }
    if(text) out.push('Nota: '+text);
  });
  return out.join('\n');
}
function textDialog(){
  const m=modal(`<h3>Criar a partir de um texto corrido</h3><p class="sub">Cole um relatório, e-mail, ata ou artigo. O sistema separa em slides, escolhe o modelo de cada um (números, fluxo, cartões…), varia os layouts e coloca o texto completo nas notas do apresentador. Funciona sem internet e sem IA.</p>
  <textarea id="tx" rows="14" style="width:100%" placeholder="Cole aqui o seu texto. Títulos curtos em linhas separadas viram slides; frases com números viram indicadores; frases com primeiro, depois, por fim viram fluxo."></textarea>
  <p class="hint" id="txInfo">&nbsp;</p>${guideHTML()}
  <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn" data-edit>Ver e ajustar o roteiro</button><button class="btn pri" data-ok>Criar apresentação</button></div>`);
  const ta=m.el.querySelector('#tx'), info=m.el.querySelector('#txInfo'); ta.focus(); wireGuide(m.el);
  ta.oninput=()=>{ const sc=textToScript(ta.value); const n=sc?parseScript(sc).length:0; info.textContent=n?n+' slides serão criados':' '; };
  m.el.querySelector('[data-c]').onclick=m.close;
  m.el.querySelector('[data-edit]').onclick=()=>{ const sc=textToScript(ta.value); if(!sc) return ta.focus(); m.close(); scriptDialog(sc); };
  m.el.querySelector('[data-ok]').onclick=()=>{ const sc=textToScript(ta.value); if(!sc) return ta.focus(); const slides=varyLayouts(parseScript(sc)); m.close();
    const id=uid(); const title=String(slides[0].d.title||'Nova apresentação').replace(/[*`\n]/g,' ').replace(/\s+/g,' ').trim(); decks[id]={name:title,theme:clone(deck().theme||{preset:'eletrico'}),footerText:title,updatedAt:Date.now(),slides}; curId=id; sel=0; touch(); renderAll(); setStatus(slides.length+' slides criados a partir do texto',true); };
}
function parseScript(txt){
  const out=[]; let cur=null; const blank=title=>({title,tpl:null,kicker:'',lead:[],bullets:[],notes:[]});
  txt.replace(/\r/g,'').split('\n').forEach(raw=>{
    const l=raw.trim(); let m; if(!l) return;
    if((m=/^#{1,3}\s+(.+?)(?:\s*\{\s*([\wÀ-ÿ -]+?)\s*\})?(\s*\((?:oculto|oculta)\))?(?:\s*\{\s*([\wÀ-ÿ -]+?)\s*\})?$/i.exec(l))){ if(cur) out.push(cur); let ti=m[1]; let hidden=!!m[3]; const hm=/\s*\((?:oculto|oculta)\)\s*$/i.exec(ti); if(hm){ hidden=true; ti=ti.slice(0,hm.index); } cur=blank(ti); cur.hidden=hidden; const tp=tagOf(m[2]||m[4]); if(tp) cur.tpl=tp; return; }
    if(!cur){ cur=blank(l); return; }
    if((m=/^notas?\s*:\s*(.*)$/i.exec(l))){ cur.notes.push(m[1]); return; }
    if((m=/^\[(.+)\]$/.exec(l))){ cur.kicker=m[1]; return; }
    if((m=/^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(l))){ cur.bullets.push(m[1]); return; }
    cur.lead.push(l.replace(/^>\s*/,''));
  });
  if(cur) out.push(cur);
  const slides=out.map((s,i)=>toSlide(s,i,out.length));
  // OnePage: bloco cujo título (ou rótulo) bate com o título de um slide oculto vira link para ele
  const key=v=>plain(v).toLowerCase();
  slides.forEach(s=>{ if(s.t!=='onepage') return; (s.d.blocks||[]).forEach(b=>{ if(b.link) return; const hit=slides.find(x=>x.hidden&&x!==s&&(key(x.d.title)===key(b.title)||key(x.d.title)===key(b.label))); if(hit) b.link=hit.id; }); });
  return slides;
}
function toSlide(s,i,n){
  const pair=b=>{ const m=/^(.+?)\s*(?::|—|–|\s-\s)\s*(.+)$/.exec(b); return m?{a:m[1].trim(),b:m[2].trim()}:{a:b,b:''}; };
  const P=s.bullets.map(pair), allPairs=s.bullets.length>0&&P.every(p=>p.b);
  const numeric=allPairs&&P.every(p=>/^(R\$\s*)?[\d.,]+\s*(%|mil|mi|bi|k|x)?$/i.test(p.a));
  let t=s.tpl;
  if(!t){
    if(i===0) t='capa';
    else if(i===n-1&&n>2&&s.bullets.length<=8) t='encerramento';
    else if(!s.bullets.length) t='destaque';
    else if(numeric&&P.length<=4) t='numeros';
    else if(s.bullets.some(b=>/->|→/.test(b))) t='fluxo';
    else if(allPairs&&P.length<=4) t='cartoes';
    else if(allPairs&&P.length<=5) t='agenda';
    else if(s.bullets.length>6) t='tabela';
    else t='encerramento';
  }
  const lead=s.lead.join('\n'); const d={kicker:s.kicker,title:s.title};
  const tpl=T[t]; const has=k=>tpl.fields.some(f=>f.k===k);
  if(has('lead')) d.lead=lead; else if(has('closing')) d.closing=lead; else if(has('quote')){ d.quote=s.title; d.author=lead; }
  const steps=s.bullets.length===1&&/->|→/.test(s.bullets[0])?s.bullets[0].split(/\s*(?:->|→)\s*/):s.bullets.map(b=>b.replace(/\s*(?:->|→)\s*$/,''));
  switch(t){
    case 'capa': d.chips=s.bullets.slice(0,3); d.showLogo=true; break;
    case 'onepage': d.blocks=P.map(p=>{ const v=/^(R\$\s*)?([\d.,]+)(\s*(?:%|mil|mi|bi|k|x)(?=\s|$))?\s+(.+)$/i.exec(p.b); return {label:p.a,value:v?(v[1]||"")+v[2]+(v[3]||""):"",title:v?v[4]:p.b,text:"",link:""}; }).slice(0,6); break;
    case 'mergulho': d.layers=s.bullets.map(b=>({image:"",caption:b})).slice(0,5); break;
    case 'galeria3d': d.images=s.bullets.map(b=>({image:"",caption:b})).slice(0,8); break;
    case 'painel': { const tb=s.bullets.filter(b=>b.includes('|')), kp=s.bullets.filter(b=>!b.includes('|')).map(pair);
      d.kpis=kp.slice(0,4).map(p=>({label:p.a,value:p.b,delta:'',link:''})); if(tb.length){ d.tableTitle='Detalhe'; d.header=tb[0]; d.rows=tb.slice(1); } break; }
    case 'encerramento': d.bullets=s.bullets; d.showLogo=i===n-1; break;
    case 'numeros': d.stats=P.map(p=>{ const m=/^(R\$)?\s*([\d.,]+)\s*(.*)$/i.exec(p.a)||[]; return {label:'',prefix:m[1]||'',value:m[2]||p.a,suffix:m[3]||'',text:p.b,badge:''}; }); break;
    case 'fluxo': d.steps=steps.map(x=>{ const p=pair(x); return {tag:'',title:p.a,text:p.b,hot:false}; }); break;
    case 'cartoes': d.cards=P.map(p=>({label:'',title:p.a,text:p.b})); break;
    case 'agenda': d.events=P.map(p=>({when:p.a,title:p.b,text:''})); break;
    case 'tabela': d.rows=s.bullets.map(b=>b.replace(/\s*[:—–]\s+/,' | ')); break;
    case 'combo': d.points=P.map(p=>{ const m=/^(.*?)\s*\/\s*(.*)$/.exec(p.b); return {label:p.a,value:m?m[1].trim():p.b,proj:m?m[2].trim():''}; }).slice(0,12); d.showValues=true; break;
    case 'grafico': case 'barras3d': case 'barrash': d.bars=P.map(p=>({label:p.a,value:p.b,hot:false})); break;
    case 'globo3d': d.points=s.bullets.map(b=>{ const m=/^(.+?)\s*[:–—]\s*(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)/.exec(b); const nm=m?m[1].trim():b.replace(/[:–—(].*$/,'').trim(); const g=m?[+m[2],+m[3]]:geoOf(nm); return g?{label:nm,lat:String(g[0]),lon:String(g[1])}:null; }).filter(Boolean).slice(0,10); d.stats=[]; d.camera='tour'; break;
    case 'matriz': ['a','b','c','d'].forEach((q,qi)=>{ const p=P[qi]; if(p){ d[q+'Title']=p.a; d[q]=p.b.split(/\s*[,;]\s*/).filter(Boolean); } }); break;
    case 'particulas3d': d.word=(lead.split('\n')[0]||plain(s.title).split(' ')[0]||'').slice(0,12); d.lead=lead.split('\n').slice(1).join('\n'); break;
    case 'equipe': d.people=P.map(p=>({name:p.a,role:p.b,photo:''})).slice(0,6); break;
    case 'comparacao': { const h=Math.ceil(s.bullets.length/2); d.leftTitle='Antes'; d.rightTitle='Depois'; d.left=s.bullets.slice(0,h); d.right=s.bullets.slice(h); break; }
    default: { const li=tpl.fields.find(f=>f.t==='list'), it=tpl.fields.find(f=>f.t==='items');
      if(it){ const subs=it.sub.filter(f=>f.t==='text'||f.t==='area'); d[it.k]=P.map(p=>{ const o={}; it.sub.forEach(f=>o[f.k]=f.t==='bool'?false:''); if(subs[0]) o[subs[0].k]=p.a; if(subs[1]) o[subs[1].k]=p.b; return o; }); }
      else if(li) d[li.k]=s.bullets; }
  }
  const sl=D.fillDefaults({id:uid(),t,d}); if(s.notes.length) sl.notes=s.notes.join('\n'); if(s.hidden) sl.hidden=true; return sl;
}

/* ---------- ações ---------- */
$('#deckSel').onchange=e=>{ if(dirty) save(); if(histT) snap(); curId=e.target.value; sel=0; renderAll(); lsSet(LS+'-cur',curId); };
$('#deckName').oninput=e=>{ deck().name=e.target.value; touch(); const o=$('#deckSel').selectedOptions[0]; if(o) o.textContent=e.target.value||'Sem nome'; };
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; renderPane(); });
$('#prevBtn').onclick=()=>select(sel-1); $('#nextBtn').onclick=()=>select(sel+1);
$('#replayBtn').onclick=()=>{ if(player) player.replay(); };
$('#undoBtn').onclick=undo; $('#redoBtn').onclick=redo;
$('#upBtn').onclick=()=>move(-1); $('#downBtn').onclick=()=>move(1);
function move(dl){ const s=deck().slides, j=sel+dl; if(j<0||j>=s.length) return; [s[sel],s[j]]=[s[j],s[sel]]; sel=j; touch(); renderRail(); renderPreview(false); }
$('#libBtn').onclick=()=>{ const s=deck().slides[sel]; if(!s) return; const sd=s.d||{};
  const m=modal(`<h3>Guardar na biblioteca</h3><p class="sub">O slide fica disponível em “+ Adicionar slide” de qualquer apresentação, já com o seu conteúdo. As cores seguem o tema da apresentação onde ele for usado.</p>
    <div class="f"><label for="libName">Nome</label><input type="text" id="libName" value="${esc(plain(sd.title||sd.quote||sd.word||sd.kicker||'')||(T[s.t]||{}).name||'Slide')}"></div>
    <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok>Guardar</button></div>`,'confirm');
  const inp=m.el.querySelector('#libName'); inp.select();
  m.el.querySelector('[data-c]').onclick=m.close;
  const ok=async()=>{ const sl=clone(s); delete sl.id; myLib.unshift({id:uid(),name:inp.value.trim()||'Slide',at:Date.now(),slide:sl}); await saveLib(); m.close(); setStatus('Guardado na biblioteca',true); };
  m.el.querySelector('[data-ok]').onclick=ok; inp.onkeydown=e=>{ if(e.key==='Enter') ok(); }; };
$('#dupBtn').onclick=()=>{ const s=deck().slides; s.splice(sel+1,0,Object.assign(clone(s[sel]),{id:uid()})); sel++; touch(); renderRail(); renderPreview(true); renderPane(); };
$('#delBtn').onclick=()=>{ const s=deck().slides; if(!s.length) return; confirmBox('Excluir o slide '+(sel+1)+'?','Excluir',()=>{ s.splice(sel,1); sel=Math.max(0,sel-1); touch(); renderRail(); renderPreview(true); renderPane(); }); };
addEventListener('keydown',e=>{
  if(document.querySelector('.modal,.show')) return;
  if(e.key==='F5'&&!e.ctrlKey&&!e.metaKey){ e.preventDefault(); present(e.shiftKey?sel:0); const sw=document.querySelector('.show'); if(sw) try{ sw.requestFullscreen().catch(()=>{}); }catch(_){} return; } // F5 do início, Shift+F5 do slide atual
  const tg=e.target.tagName, typing=tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT';
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod&&!typing&&k==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if(mod&&!typing&&k==='y'){ e.preventDefault(); redo(); return; }
  if(typing) return;
  if(e.key==='ArrowRight') select(sel+1); if(e.key==='ArrowLeft') select(sel-1);
});
addEventListener('beforeunload',()=>{ if(dirty&&mode!=='db') localSave(); });

/* ---------- dados de planilha (Google Planilhas ou CSV) ---------- */
function dataField(tpl){ return tpl&&tpl.fields.find(f=>f.t==='items'&&f.sub.some(x=>x.k==='value')); }
function csvRows(txt){ txt=String(txt).replace(/^\uFEFF/,''); const first=txt.split('\n')[0]; const sep=first.split(';').length>first.split(',').length?';':(first.split('\t').length>first.split(',').length?'\t':',');
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<txt.length;i++){ const ch=txt[i]; if(q){ if(ch==='"'){ if(txt[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=ch; }
    else if(ch==='"') q=true; else if(ch===sep){ row.push(cell); cell=''; } else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&txt[i+1]==='\n') i++; row.push(cell); rows.push(row); row=[]; cell=''; } else cell+=ch; }
  if(cell||row.length){ row.push(cell); rows.push(row); }
  return rows.map(r=>r.map(c=>c.trim())).filter(r=>r.some(Boolean)); }
function sheetURL(u){ const m=/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(u); if(!m) return u; const g=/[#&?]gid=(\d+)/.exec(u); return 'https://docs.google.com/spreadsheets/d/'+m[1]+'/gviz/tq?tqx=out:csv'+(g?'&gid='+g[1]:''); }
async function fetchRows(src){ const r=await fetch(sheetURL(src),{cache:'no-store'}); if(!r.ok) throw new Error('http '+r.status); return csvRows(await r.text()); }
function applyRows(s,rows){ const f=dataField(T[s.t]); if(!f||!rows.length) return 0;
  const isNum=v=>/\d/.test(String(v||'')); if(!isNum(rows[0][1])) rows=rows.slice(1); // primeira linha é cabeçalho
  rows=rows.filter(r=>r[0]&&isNum(r[1])); if(!rows.length) return 0;
  const lk=(f.sub.find(y=>y.k==='label')||f.sub.find(y=>y.t==='text'&&y.k!=='value')||{}).k, old=(s.d&&s.d[f.k])||[];
  s.d=s.d||{}; s.d[f.k]=rows.slice(0,f.max||8).map((r,i)=>{ const o=Object.assign({},old[i]||{}); f.sub.forEach(y=>{ if(o[y.k]===undefined) o[y.k]=y.t==='bool'?false:''; }); if(lk) o[lk]=r[0]; o.value=r[1]; return o; });
  return s.d[f.k].length; }

/* ---------- kit da marca: tema a partir das cores da logo ---------- */
function rgb2hsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2; let h=0, s=0; if(mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h*=60; } return [h,s,l]; }
function hsl2hex(h,s,l){ h=((h%360)+360)%360; const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l), f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1)); return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join(''); }
function lumHex(h){ const c=String(h||'#000').replace('#',''); const full=c.length===3?c.split('').map(x=>x+x).join(''):c; return [0,2,4].map(i=>parseInt(full.substr(i,2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0); }
function contrast(a,b){ const x=lumHex(a), y=lumHex(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
async function brandKit(src,light){
  const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; });
  const c=document.createElement('canvas'); c.width=c.height=80; const x=c.getContext('2d'); x.drawImage(img,0,0,80,80); const px=x.getImageData(0,0,80,80).data;
  const bins={}; for(let i=0;i<px.length;i+=4){ if(px[i+3]<200) continue; const [h,s,l]=rgb2hsl(px[i],px[i+1],px[i+2]); if(s<.22||l<.12||l>.93) continue; const k=Math.floor(h/15); const b=bins[k]||(bins[k]={n:0,h:0,s:0,l:0}); b.n++; b.h+=h; b.s+=s; b.l+=l; }
  const list=Object.values(bins).map(b=>({n:b.n,h:b.h/b.n,s:b.s/b.n,l:b.l/b.n})).sort((p,q)=>q.n*q.s-p.n*p.s);
  if(!list.length) return null;
  const A=list[0], far=q=>{ const d=Math.abs(q.h-A.h); return Math.min(d,360-d)>40; }, B=list.find(q=>far(q)&&q.n>A.n*.05)||{h:(A.h+38)%360,s:A.s,l:A.l};
  const sat=v=>Math.max(.55,Math.min(.95,v));
  const t=light?{bg:hsl2hex(A.h,.3,.97),surface:'#ffffff',title:hsl2hex(A.h,.35,.12),text:hsl2hex(A.h,.15,.26),muted:hsl2hex(A.h,.1,.42)}
               :{bg:hsl2hex(A.h,.35,.06),surface:hsl2hex(A.h,.28,.11),title:hsl2hex(A.h,.2,.97),text:hsl2hex(A.h,.12,.85),muted:hsl2hex(A.h,.1,.64)};
  const tone=(q)=>{ let l=light?Math.min(.48,Math.max(.36,q.l)):Math.min(.66,Math.max(.52,q.l)), hx=hsl2hex(q.h,sat(q.s),l); for(let k=0;k<8&&contrast(hx,t.bg)<3.2;k++){ l+=light?-.04:.04; hx=hsl2hex(q.h,sat(q.s),l); } return hx; };
  t.accent=tone(A); t.alert=tone(B); t.light=!!light;
  return t;
}

/* ---------- revisão de qualidade ---------- */
function review(d){
  const out=[], add=(sev,i,msg,fix,x)=>out.push(Object.assign({sev,i,msg,fix},x||{})), th=D.themeOf(d), arr0=v=>Array.isArray(v)?v:[];
  [['text','Texto',4.5],['title','Títulos',4.5],['muted','Texto suave',3],['accent','Destaque',3]].forEach(([k,l,min])=>{ if(!/^#[0-9a-f]{3,6}$/i.test(th[k]||'')||!/^#[0-9a-f]{3,6}$/i.test(th.bg||'')) return; const r=contrast(th[k],th.bg); if(r<min) add(r<min*.7?3:2,-1,'Contraste baixo: “'+l+'” sobre o fundo ('+r.toFixed(1)+':1; o recomendado é '+min+':1).','Ajuste as cores no painel Tema.'); });
  const SKIP=['image','src','video','link','icon','shape','style','lat','lon','go'];
  const strs=o=>typeof o==='string'?[o]:Array.isArray(o)?o.flatMap(strs):o&&typeof o==='object'?Object.entries(o).filter(([k])=>!SKIP.includes(k)).flatMap(([,v])=>strs(v)):[];
  let secs=0, run=1; const noNotes=[], per=[];
  d.slides.forEach((s,i)=>{ const tpl=T[s.t]; if(!tpl) return; const dd=s.d||{};
    const words=strs(dd).filter(x=>!/^(data:|https?:|asset:|\/)/.test(x)).join(' ').replace(/[*`]/g,'').split(/\s+/).filter(Boolean).length;
    if(words>110) add(3,i,'Texto demais ('+words+' palavras). A plateia lê ou ouve, não os dois.','Divida em dois slides ou leve os detalhes para as notas.');
    else if(words>75) add(2,i,'Bastante texto ('+words+' palavras).','Tente ficar abaixo de 75 palavras.');
    if(tpl.fields.some(f=>f.k==='title')&&!String(dd.title||'').trim()) add(2,i,'Slide sem título.','Um título curto ajuda a plateia a se localizar.');
    else if(String(dd.title||'').length>90) add(1,i,'Título longo (mais de 90 caracteres).','Títulos curtos têm mais impacto.');
    tpl.fields.forEach(f=>{
      if(f.t==='image'&&!dd[f.k]&&['imagem','revelar','paralaxe'].includes(s.t)) add(2,i,'Imagem faltando: “'+f.l+'”.','Envie uma imagem ou troque de modelo.');
      if(f.t==='items'){ const it=dd[f.k]||[]; if(f.max&&it.length>f.max) add(2,i,(it.length-f.max)+' item(ns) não aparecem: o modelo mostra '+f.max+'.','Remova itens ou troque de modelo.');
        if(!it.length) add(2,i,'“'+f.l+'” está vazio.','Adicione itens.');
        const im=f.sub.find(x=>x.t==='image'); if(im&&it.length&&it.some(x=>!x[im.k])) add(2,i,'Há itens sem imagem.','Complete as imagens.'); } });
    if(i>0&&d.slides[i-1].t===s.t&&(d.slides[i-1].lay||'')===(s.lay||'')&&(D.LAYOUTS||{})[s.t]) add(1,i,'Mesmo modelo e mesmo layout do slide anterior.','Troque o layout para variar o visual.',{act:'vary',label:'Variar layouts'});
    const tw=plain(dd.title||'').split(/\s+/).filter(Boolean).length; if(tw>12) add(2,i,'Título longo ('+tw+' palavras).','Títulos com até 10 palavras são lidos de relance. Leve o resto para o texto de apoio.');
    if(s.t==='numeros') arr0(dd.stats).forEach(st=>{ if(st&&st.value&&!st.prefix&&!st.suffix&&!/[a-z%$]/i.test(String(st.value))&&!(st.label||'').trim()) add(1,i,'Número “'+st.value+'” sem unidade nem rótulo.','Diga o que é: %, R$, mil, pessoas… ou preencha o rótulo.'); });
    if(i>0&&d.slides[i-1].t===s.t){ run++; if(run===3) add(1,i,'Três slides seguidos com o mesmo modelo ('+tpl.name+').','Varie o modelo para manter a atenção.'); } else run=1;
    if(s.hidden&&!d.slides.some(o=>o!==s&&JSON.stringify(o.d||{}).includes('"'+s.id+'"'))) add(2,i,'Slide oculto sem nenhum link: ninguém consegue chegar nele.','Ligue-o num OnePage ou desmarque “oculto”.');
    JSON.stringify(dd).replace(/"(?:link|go)":"([^"]+)"/g,(m,id)=>{ if(!d.slides.some(o=>o.id===id)) add(3,i,'Link para um slide que foi excluído.','Escolha outro destino no campo de link.'); return m; });
    if(s.src&&!dataField(tpl)) add(1,i,'Slide tem planilha ligada, mas o modelo atual não usa dados.','Troque para um modelo de gráfico.');
    if(!s.hidden&&!s.notes&&words>30) noNotes.push(i+1);
    const est=s.dur?+s.dur:Math.max(20,(words+String(s.notes||'').split(/\s+/).filter(Boolean).length)/2.2); per[i]=s.hidden?0:est; if(!s.hidden) secs+=est;
  });
  if(d.slides[0]&&!['capa','mergulho','revelar','paralaxe','particulas3d','logo3d','tunel3d','video','globo3d'].includes(d.slides[0].t)) add(1,0,'A apresentação não abre com uma capa.','Uma capa ou um slide de impacto prepara a plateia.');
  const oc=d.slides.reduce((a,sl)=>a+openC(sl),0); if(oc) add(2,d.slides.findIndex(sl=>openC(sl)>0),oc+' comentário(s) em aberto.','Resolva ou exclua antes de apresentar.');
  if(noNotes.length) add(1,noNotes.length===1?noNotes[0]-1:-2,noNotes.length===1?'Slide sem notas do apresentador.':noNotes.length+' slides sem notas do apresentador ('+noNotes.slice(0,8).join(', ')+(noNotes.length>8?'…':'')+').','Notas ajudam no ensaio e aparecem na janela do apresentador.');
  if(d.slides.length>25) add(1,-1,d.slides.length+' slides: é bastante.','Considere um OnePage com slides ocultos para os detalhes.');
  const pen={3:12,2:5,1:2};
  return {out:out.sort((a,b)=>b.sev-a.sev||a.i-b.i),score:Math.max(0,100-out.reduce((a,x)=>a+pen[x.sev],0)),secs,per};
}
function reviewDialog(){
  const d=deck(), r=review(d), mins=Math.max(1,Math.round(r.secs/60));
  const grade=r.score>=90?'Excelente':r.score>=75?'Boa':r.score>=55?'Precisa de ajustes':'Revise com atenção', lab={3:'Importante',2:'Atenção',1:'Dica'};
  const m=modal(`<h3>Revisão da apresentação</h3><div class="rv-top"><div class="rv-score" style="--p:${r.score}"><b>${r.score}</b><small>de 100</small></div><div><b>${grade}</b><p class="sub">${d.slides.length} slides · cerca de ${mins} min de fala · ${r.out.length?r.out.length+' ponto(s) a melhorar':'nada a corrigir'}</p></div></div>
  <div class="rv-list">${r.out.map(x=>`<div class="rv-i s${x.sev}"><span class="rv-tag">${lab[x.sev]}</span><div class="rv-t"><b>${x.i===-1?'Tema':x.i===-2?'Geral':'Slide '+(x.i+1)}</b> ${esc(x.msg)}<small>${esc(x.fix)}</small></div>${x.act?`<button class="btn sm pri" data-act="${x.act}">${esc(x.label)}</button>`:x.i===-2?'<span></span>':`<button class="btn sm" data-go="${x.i<0?'tema':x.i}">${x.i<0?'Abrir':'Ir'}</button>`}</div>`).join('')||'<p class="sub">Tudo certo. Boa apresentação!</p>'}</div>
  <div class="row"><button class="btn pri" data-c>Fechar</button></div>`,'confirm review');
  m.el.querySelector('[data-c]').onclick=m.close;
  m.el.querySelectorAll('[data-act="vary"]').forEach(b=>b.onclick=()=>{ const dd=deck(); let pv=null; dd.slides.forEach(sl=>{ const o=(D.LAYOUTS||{})[sl.t]; if(o&&pv&&pv.t===sl.t&&(pv.lay||'')===(sl.lay||'')){ const ks=Object.keys(o); const k=ks[(ks.indexOf(pv.lay||'')+1)%ks.length]; if(k) sl.lay=k; else delete sl.lay; } pv=sl; }); touch(); renderAll(); m.close(); reviewDialog(); setStatus('Layouts variados',true); });
  m.el.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ m.close(); if(b.dataset.go==='tema'){ tab='theme'; renderPane(); } else { select(+b.dataset.go); tab='content'; renderPane(); } });
}

/* ---------- modo apresentação ---------- */
function present(start,o={}){
  const d=o.deck||deck(); if(!d.slides.length) return;
  const th=D.themeOf(d);
  const hostHTML=o.vertical?`<div class="vframe" style='${D.themeVars(th)}'><div class="vf-top"><span class="vf-k"></span><b class="vf-t"></b></div><div class="host vf-host"></div><div class="vf-bot"><span class="vf-brand">${esc(d.footerText||d.name||'')}</span><div class="vf-pg"><i></i></div></div></div>`:'<div class="host"></div>';
  const w=document.createElement('div'); w.className='show'+(o.recording?' rec':'')+(o.vertical?' vert':''); w.innerHTML=`${hostHTML}<div class="bar"><button data-x aria-label="Sair">✕</button><button data-p aria-label="Anterior">‹</button><div class="pg"><i></i></div><span class="n"></span><button data-n aria-label="Próximo">›</button><button data-v aria-label="Janela do apresentador" title="Janela do apresentador (P)">🗒</button><button data-tool="laser" aria-label="Ponteiro laser" title="Ponteiro laser (L)">●</button><button data-tool="zoom" aria-label="Zoom" title="Zoom: clique para aproximar (Z)">⌕</button><button data-tool="voice" aria-label="Comando por voz" title="Comando por voz (V)">🎙</button><button data-tool="cc" aria-label="Legendas ao vivo" title="Legendas ao vivo (C)">CC</button><button data-tool="a11y" aria-label="Alto contraste" title="Alto contraste (A)">◐</button><button data-tool="help" aria-label="Atalhos" title="Atalhos (?)">?</button><button data-f aria-label="Tela cheia">⤢</button></div><canvas class="laser" aria-hidden="true"></canvas><div class="voice-chip" hidden></div>`;
  document.body.appendChild(w);
  let pop=null;
  const tell=msg=>{ try{ if(pop&&!pop.closed) pop.postMessage(Object.assign({em:1},msg),'*'); }catch(_){} };
  const R=o.rehearse?rehearsal(d,o.rehearse,w):null;
  const upd=n=>{ if(R) R.go(n); w.querySelector('.n').textContent=(n+1)+' / '+d.slides.length; w.querySelector('.pg i').style.width=((n+1)/d.slides.length*100)+'%'; tell({type:'index',n});
    if(o.vertical){ const s=d.slides[n]||{}, sd=s.d||{}; const vt=w.querySelector('.vf-t'), vk=w.querySelector('.vf-k'); vk.textContent=sd.kicker||''; vt.innerHTML=esc(plain(sd.title||sd.quote||sd.word||'')).replace(/\n/g,'<br>'); w.querySelector('.vf-pg i').style.width=((n+1)/d.slides.length*100)+'%';
      if(D.ensureFonts) D.ensureFonts([th.fontDisplay,th.fontBody]); if(window.gsap) gsap.fromTo([vk,vt],{y:24,opacity:0},{y:0,opacity:1,duration:.7,stagger:.08,ease:'expo.out'}); } };
  const pl=D.createPlayer(w.querySelector('.host'),d,{start:start||0,onChange:upd,autoplay:!o.stage,links:true,onEnd:o.onEnd,noMotion:!!d.calm}); upd(start||0);
  /* trilha sonora com detecção de batida */
  const music=(!o.recording&&d.music)?startMusic(d,pl,curId):null;
  /* números ao vivo: slides ligados a uma planilha buscam os dados de novo */
  d.slides.forEach((s,i)=>{ if(s.live&&s.src) fetchRows(s.src).then(rows=>{ if(closed||!applyRows(s,rows)) return; if(d===deck()) touch(); pl.update(i,d); if(i===pl.index) pl.replay(); }).catch(()=>{}); });
  /* 3, 2, 1 antes de gravar */
  const countdown=n=>new Promise(res=>{ const c=document.createElement('div'); c.className='cdown'; w.appendChild(c); let k=n; const tick=()=>{ if(k<=0){ c.remove(); return res(); } c.textContent=k; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); k--; setTimeout(tick,850); }; tick(); });
  /* modo palco: tela de espera com contagem regressiva */
  let stageEl=null, stageT=null;
  const endStage=()=>{ if(!stageEl) return; clearInterval(stageT); const el=stageEl; stageEl=null; if(window.gsap) gsap.to(el,{opacity:0,duration:.8,onComplete:()=>el.remove()}); else el.remove(); pl.replay(); };
  if(o.stage){ const end=Date.now()+o.stage.mins*60000;
    stageEl=document.createElement('div'); stageEl.className='stage-wait'; stageEl.setAttribute('style',D.themeVars(th));
    stageEl.innerHTML=`<div class="sw-in">${th.logo?`<img src="${esc(D.resolveImage(th.logo))}" alt="">`:''}<small>${esc(d.name||'')}</small><h1>${esc(o.stage.msg||'Já vamos começar')}</h1><div class="sw-clock">--:--</div><div class="sw-bar"><i></i></div></div>`;
    w.appendChild(stageEl); stageEl.onclick=endStage; D.ensureFonts([th.fontDisplay,th.fontBody]);
    const total=o.stage.mins*60000;
    const tick=()=>{ const left=Math.max(0,end-Date.now()), s=Math.ceil(left/1000); if(!stageEl) return; stageEl.querySelector('.sw-clock').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); stageEl.querySelector('.sw-bar i').style.width=(100-left/total*100)+'%'; if(left<=0) endStage(); };
    tick(); stageT=setInterval(tick,250); }
  const fs=()=>{ try{ document.fullscreenElement?document.exitFullscreen():w.requestFullscreen().catch(()=>{}); }catch(_){} };
  const onMsg=e=>{ if(!pop||e.source!==pop||!e.data||!e.data.em) return; const m=e.data;
    if(m.type==='ready') tell({type:'deck',deck:d,n:pl.index});
    else if(m.type==='next') pl.next(); else if(m.type==='prev') pl.prev(); else if(m.type==='go') pl.go(+m.n); };
  addEventListener('message',onMsg);
  const openPresenter=()=>{ if(pop&&!pop.closed){ pop.focus(); return; } pop=open(location.pathname+location.search+'#presenter','estudio-motion-apresentador','width=1100,height=720'); if(!pop) setStatus('O navegador bloqueou a janela do apresentador'); };
  /* ---------- ferramentas do apresentador: laser, zoom, voz e atalhos ---------- */
  const host=w.querySelector('.host'), lc=w.querySelector('.laser'), lx=lc.getContext('2d'), chip=w.querySelector('.voice-chip');
  const toolBtn=t=>w.querySelector(`[data-tool="${t}"]`);
  let laser=false, trail=[], lraf=0, zoomMode=false, zoomed=false, rec=null, voiceOn=false, help=null;
  const sizeL=()=>{ lc.width=innerWidth*devicePixelRatio; lc.height=innerHeight*devicePixelRatio; }; sizeL(); addEventListener('resize',sizeL);
  function drawLaser(){ const now=performance.now(), k=devicePixelRatio; trail=trail.filter(p=>now-p.t<450); lx.clearRect(0,0,lc.width,lc.height);
    if(trail.length>1){ lx.lineCap='round'; lx.lineJoin='round'; for(let i=1;i<trail.length;i++){ const a=trail[i-1], b=trail[i], f=1-(now-b.t)/450; lx.strokeStyle=`rgba(255,40,60,${f*.55})`; lx.lineWidth=(3+f*7)*k; lx.beginPath(); lx.moveTo(a.x*k,a.y*k); lx.lineTo(b.x*k,b.y*k); lx.stroke(); } }
    const h=trail[trail.length-1]; if(h){ const g=lx.createRadialGradient(h.x*k,h.y*k,0,h.x*k,h.y*k,22*k); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.25,'rgba(255,50,70,.95)'); g.addColorStop(1,'rgba(255,0,40,0)'); lx.fillStyle=g; lx.beginPath(); lx.arc(h.x*k,h.y*k,22*k,0,7); lx.fill(); }
    if(laser) lraf=requestAnimationFrame(drawLaser); }
  const setLaser=v=>{ laser=v; w.classList.toggle('laser-on',v); toolBtn('laser').classList.toggle('on',v); cancelAnimationFrame(lraf); if(v){ lraf=requestAnimationFrame(drawLaser); } else lx.clearRect(0,0,lc.width,lc.height); };
  w.addEventListener('mousemove',e=>{ if(laser) trail.push({x:e.clientX,y:e.clientY,t:performance.now()}); if(zoomed) host.style.transformOrigin=`${e.clientX}px ${e.clientY}px`; });
  const unzoom=()=>{ zoomed=false; host.style.transform=''; w.classList.remove('zoomed'); };
  const setZoom=v=>{ zoomMode=v; toolBtn('zoom').classList.toggle('on',v); w.classList.toggle('zoom-mode',v); if(!v) unzoom(); };
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const say=(t,ms)=>{ chip.hidden=false; chip.textContent=t; clearTimeout(chip._t); if(ms) chip._t=setTimeout(()=>{ if(voiceOn) chip.textContent='🎙 Ouvindo… diga “próximo” ou “voltar”'; else chip.hidden=true; },ms); };
  /* um só reconhecimento de fala serve aos comandos de voz e às legendas */
  let ccOn=false, ccT=0; const ccEl=document.createElement('div'); ccEl.className='cc-line'; ccEl.hidden=true; ccEl.setAttribute('aria-live','polite'); w.appendChild(ccEl);
  function command(t){
    if(/pr[oó]xim|avan[cç]|seguinte|next/.test(t)){ pl.next(); say('🎙 “'+t+'” → próximo',1600); }
    else if(/volt|anterior|back/.test(t)){ pl.prev(); say('🎙 “'+t+'” → voltar',1600); }
    else if(/tela cheia/.test(t)){ fs(); say('🎙 tela cheia',1600); }
    else if(/laser/.test(t)){ setLaser(!laser); say('🎙 laser',1600); }
    else if(/in[ií]cio|primeiro/.test(t)){ pl.go(0); say('🎙 início',1600); }
    else say('🎙 “'+t+'”',1400); }
  function syncRec(){
    if(!(voiceOn||ccOn)){ if(rec){ const r=rec; rec=null; try{ r.stop(); }catch(_){} } return; }
    if(rec) return;
    rec=new SR(); rec.lang='pt-BR'; rec.continuous=true; rec.interimResults=true;
    rec.onresult=e=>{ let interim='', fin=''; for(let i=e.resultIndex;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) fin+=r[0].transcript; else interim+=r[0].transcript; }
      if(ccOn){ const txt=(fin||interim).trim(); if(txt){ ccEl.hidden=false; ccEl.textContent=txt; clearTimeout(ccT); ccT=setTimeout(()=>{ ccEl.hidden=true; },3500); } }
      if(voiceOn&&fin.trim()) command(fin.toLowerCase().trim()); };
    rec.onerror=ev=>{ if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){ say('Microfone bloqueado. Permita o microfone no navegador.',4000); voiceOn=false; ccOn=false; toolBtn('voice').classList.remove('on'); toolBtn('cc').classList.remove('on'); rec=null; } };
    rec.onend=()=>{ if((voiceOn||ccOn)&&rec) try{ rec.start(); }catch(_){} };
    try{ rec.start(); }catch(_){ say('Não consegui ligar o microfone.',3000); }
  }
  function setVoice(v){ if(v&&!SR){ say('Comando por voz não funciona neste navegador. Use Chrome ou Edge.',3500); return; } voiceOn=v; toolBtn('voice').classList.toggle('on',v); if(v) say('🎙 Ouvindo… diga “próximo” ou “voltar”'); else chip.hidden=true; syncRec(); }
  function setCC(v){ if(v&&!SR){ say('Legendas ao vivo não funcionam neste navegador. Use Chrome ou Edge.',3500); return; } ccOn=v; toolBtn('cc').classList.toggle('on',v); if(v) say('Legendas ligadas: é só falar',2200); else ccEl.hidden=true; syncRec(); }
  const setA11y=()=>{ const on=w.classList.toggle('a11y'); toolBtn('a11y').classList.toggle('on',on); say(on?'Alto contraste ligado':'Alto contraste desligado',1500); };
  function toggleHelp(){ if(help){ help.remove(); help=null; return; }
    help=document.createElement('div'); help.className='kbd-help'; help.innerHTML=`<div class="kh-in"><h3>Atalhos da apresentação</h3><dl>
      <dt>→ · Espaço · Enter</dt><dd>Próximo</dd><dt>← · Backspace</dt><dd>Anterior</dd><dt>F · F5</dt><dd>Tela cheia</dd><dt>P</dt><dd>Janela do apresentador (notas e cronômetro)</dd>
      <dt>L</dt><dd>Ponteiro laser</dd><dt>Z</dt><dd>Zoom: clique para aproximar, clique de novo para voltar</dd><dt>V</dt><dd>Comando por voz: “próximo”, “voltar”, “início”, “tela cheia”</dd><dt>C</dt><dd>Legendas ao vivo do que você fala</dd><dt>A</dt><dd>Alto contraste (texto mais legível)</dd><dt>B</dt><dd>Tela preta (pausa)</dd><dt>R</dt><dd>Pausar o cronômetro do ensaio</dd><dt>M</dt><dd>Ligar e desligar a trilha sonora</dd><dt>Esc</dt><dd>Sair</dd></dl><p>Pressione ? ou Esc para fechar</p></div>`;
    help.onclick=toggleHelp; w.appendChild(help); }
  const black=()=>w.classList.toggle('blackout');
  toolBtn('laser').onclick=e=>{ e.stopPropagation(); setLaser(!laser); };
  toolBtn('zoom').onclick=e=>{ e.stopPropagation(); setZoom(!zoomMode); };
  toolBtn('voice').onclick=e=>{ e.stopPropagation(); setVoice(!voiceOn); };
  toolBtn('help').onclick=e=>{ e.stopPropagation(); toggleHelp(); };
  toolBtn('cc').onclick=e=>{ e.stopPropagation(); setCC(!ccOn); };
  toolBtn('a11y').onclick=e=>{ e.stopPropagation(); setA11y(); };
  let closed=false;
  const close=()=>{ if(closed) return; closed=true; if(music) music.stop(); if(R) setTimeout(()=>R.finish(),50); clearInterval(stageT); voiceOn=false; ccOn=false; syncRec(); clearTimeout(ccT); setLaser(false); removeEventListener('resize',sizeL); tell({type:'end'}); pl.destroy(); w.remove(); removeEventListener('keydown',key); removeEventListener('message',onMsg); try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_){} if(location.hash.startsWith('#play-')) try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){} o.onClose&&o.onClose(); };
  const key=e=>{ const k=e.key.toLowerCase();
    if(e.key==='Escape'){ if(help) return toggleHelp(); if(w.classList.contains('blackout')) return black(); if(zoomed||zoomMode) return setZoom(false); return close(); }
    if(e.key==='F5'&&!e.ctrlKey&&!e.metaKey){ e.preventDefault(); return fs(); }
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    if(stageEl&&['ArrowRight','PageDown',' ','Enter'].includes(e.key)){ e.preventDefault(); return endStage(); }
    if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault(); if(music&&music.sync) music.onBeat(()=>pl.next()); else pl.next();} else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();pl.prev();}
    else if(k==='f') fs(); else if(k==='p') openPresenter(); else if(k==='l') setLaser(!laser); else if(k==='z') setZoom(!zoomMode); else if(k==='v') setVoice(!voiceOn); else if(k==='c') setCC(!ccOn); else if(k==='a') setA11y(); else if(k==='b'||k==='.') black(); else if(k==='r'&&R) R.pause(); else if(k==='m'&&music) say(music.toggle()?'♪ Música ligada':'♪ Música desligada',1400); else if(e.key==='?'||k==='h') toggleHelp(); };
  addEventListener('keydown',key);
  w.querySelector('.bar [data-x]').onclick=close; w.querySelector('.bar [data-p]').onclick=()=>pl.prev(); w.querySelector('.bar [data-n]').onclick=()=>pl.next(); w.querySelector('.bar [data-f]').onclick=fs; w.querySelector('.bar [data-v]').onclick=openPresenter;
  host.onclick=e=>{ if(stageEl) return endStage(); if(o.recording) return;
    if(zoomMode){ if(zoomed) unzoom(); else { zoomed=true; host.style.transformOrigin=`${e.clientX}px ${e.clientY}px`; host.style.transform='scale(2.2)'; w.classList.add('zoomed'); } return; }
    e.clientX>innerWidth*.3?pl.next():pl.prev(); };
  let sx=null; w.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;},{passive:true}); w.addEventListener('touchend',e=>{ if(sx==null) return; const dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>40) dx<0?pl.next():pl.prev(); sx=null; },{passive:true});
  if(!o.recording) try{ history.replaceState(null,'','#play-'+curId); }catch(_){}
  return {close,player:pl,frame:o.vertical?w.querySelector('.vframe'):w.querySelector('.host'),countdown};
}
$('#playBtn').onclick=()=>present(sel);
window.EstudioMotion={present:(i,o)=>present(i||0,o||{}),csvRows,applyRows,review,brandKit,version:'3.1'}; // gancho para testes e automações

/* janela do apresentador: slide atual, próximo, notas e cronômetro */
function presenterMode(){
  document.title='Apresentador · Estúdio Motion';
  document.body.innerHTML=`<div class="pres"><header><b>Apresentador</b><span class="clock" id="pc">00:00</span><button class="btn sm" id="pr">Zerar</button><span class="n" id="pn">–</span></header>
  <div class="pres-main"><div class="cur"><div class="tv" id="pcur"></div></div><div class="side"><div class="lbl">Próximo</div><div class="tv" id="pnext"></div><div class="lbl">Notas</div><div class="notes" id="pnotes">Aguardando a apresentação…</div></div></div>
  <footer><button class="btn" id="pp">‹ Anterior</button><button class="btn pri" id="px">Próximo ›</button></footer></div>`;
  let dk=null, n=0, t0=Date.now(), c1=null, c2=null;
  const send=m=>{ try{ opener&&opener.postMessage(Object.assign({em:1},m),'*'); }catch(_){} };
  const paint=()=>{ if(!dk) return; c1&&c1(); c2&&c2();
    c1=D.renderStatic($('#pcur'),dk,n);
    let nx=n+1; if(!(dk.slides[n]||{}).hidden) while(nx<dk.slides.length&&dk.slides[nx].hidden) nx++; // pula slides ocultos
    if((dk.slides[n]||{}).hidden) $('#pnext').innerHTML='<div class="end">Próximo: volta ao resumo</div>', c2=null;
    else if(nx<dk.slides.length) c2=D.renderStatic($('#pnext'),dk,nx); else { $('#pnext').innerHTML='<div class="end">Fim da apresentação</div>'; c2=null; }
    const s=dk.slides[n]||{}; $('#pnotes').textContent=s.notes||'Sem notas para este slide.'; $('#pnotes').classList.toggle('empty',!s.notes);
    $('#pn').textContent=(n+1)+' / '+dk.slides.length; };
  addEventListener('message',e=>{ if(e.source!==opener||!e.data||!e.data.em) return; const m=e.data;
    if(m.type==='deck'){ dk=m.deck; n=m.n||0; paint(); } else if(m.type==='index'){ n=m.n; paint(); } else if(m.type==='end'){ $('#pnotes').textContent='A apresentação foi encerrada.'; } });
  $('#pp').onclick=()=>send({type:'prev'}); $('#px').onclick=()=>send({type:'next'});
  $('#pr').onclick=()=>{ t0=Date.now(); };
  addEventListener('keydown',e=>{ if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();send({type:'next'});} else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();send({type:'prev'});} });
  setInterval(()=>{ const s=Math.floor((Date.now()-t0)/1000); $('#pc').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); },500);
  if(!opener) $('#pnotes').textContent='Abra esta janela pelo botão 🗒 (ou tecla P) durante a apresentação.'; else send({type:'ready'});
}

/* ---------- exportar ---------- */
const blobToData=b=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); });
async function inline(v){ if(!v||String(v).startsWith('data:')) return v; try{ const r=await fetch(D.resolveImage(v)); if(!r.ok) return ''; return await blobToData(await r.blob()); }catch(e){ return ''; } }
async function saveFile(filename,data,type){
  if(downloads) return downloads.save({filename,data});
  const a=document.createElement('a'); a.href=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type})); a.download=filename;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },2000);
}
const fileBase=d=>(d.name||'apresentacao').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'apresentacao';
/* embute imagens de campos do slide e de itens (ex.: fotos da equipe) */
async function inlineFields(fields,obj){ for(const f of fields){ if(f.t==='image'&&obj[f.k]) obj[f.k]=await inline(obj[f.k]); else if(f.t==='items') for(const it of (obj[f.k]||[])) await inlineFields(f.sub,it); } }
const srcOf=(id,url)=>{ const el=document.getElementById(id); return el?Promise.resolve(el.textContent):fetch(url).then(r=>r.text()); };
async function exportHTML(){
  setStatus('Preparando arquivo…');
  try{
    const d=clone(deck()); d.slides.forEach(s=>delete s.notes);
    d.theme=d.theme||{}; if(d.theme.logo) d.theme.logo=await inline(d.theme.logo); if(d.header&&d.header.image) d.header.image=await inline(d.header.image);
    for(const s of d.slides){ const tp=T[s.t]; if(tp) await inlineFields(tp.fields,s.d||{}); }
    const [js,css]=await Promise.all([srcOf('dk-js','engine.js'),srcOf('dk-css','engine.css')]);
    const gs=document.getElementById('gsap-js');
    const gsapTag=gs?'<script>'+gs.textContent.replace(/<\/script/gi,'<\\/script')+'<\/script>':'<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"><\/script>';
    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.name||'Apresentação')}</title><style>html,body{height:100%;margin:0;background:#000}#app{position:fixed;inset:0}${css}</style>${gsapTag}</head><body><div id="app"></div><script>${js.replace(/<\/script/gi,'<\\/script')}<\/script><script>
const DECK=${JSON.stringify(d).replace(/</g,'\\u003c')};
const pl=Deck.createPlayer(document.getElementById('app'),DECK,{start:0,autoplay:true,links:true});
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();pl.next();}else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();pl.prev();}else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}});
document.getElementById('app').addEventListener('click',e=>{e.clientX>innerWidth*.3?pl.next():pl.prev();});
let sx=null;addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});addEventListener('touchend',e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40)dx<0?pl.next():pl.prev();sx=null},{passive:true});
<\/script></body></html>`;
    await saveFile(fileBase(d)+'.html',html,'text/html');
    setStatus('Arquivo exportado',true);
  }catch(e){ setStatus(e&&e.code==='declined'?'Exportação cancelada':'Não consegui exportar'); }
}
$('#exportBtn').onclick=exportHTML;

/* PDF: monta um slide por página e abre a impressão (escolha "Salvar como PDF") */
async function exportPDF(){
  const d=deck(); if(!d.slides.length) return;
  setStatus('Preparando PDF…');
  const root=document.createElement('div'); root.className='print-root';
  root.innerHTML=d.slides.map(()=>'<div class="pp"></div>').join(''); document.body.appendChild(root);
  const cleaners=[...root.children].map((el,i)=>D.renderStatic(el,d,i));
  try{ await document.fonts.ready; }catch(_){}
  await Promise.all([...root.querySelectorAll('img')].map(im=>im.complete?0:new Promise(r=>{ im.onload=im.onerror=r; })));
  await new Promise(r=>setTimeout(r,400));
  const done=()=>{ cleaners.forEach(f=>f()); root.remove(); removeEventListener('afterprint',done); setStatus('Pronto',true); };
  addEventListener('afterprint',done);
  print();
  setTimeout(()=>{ if(root.isConnected&&!matchMedia('print').matches) done(); },60000);
}

/* Vídeo: grava a aba (recortada só no slide), com narração pelo microfone e trilha que abaixa quando você fala */
async function recordVideo(){
  const d=deck(); if(!d.slides.length) return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia||!window.MediaRecorder){ setStatus('Este navegador não grava a tela. Use Chrome ou Edge.'); return; }
  const secs=+((d.auto||{}).secs)||5;
  const cfg=await new Promise(res=>{ const m=modal(`<h3>Gravar vídeo</h3><p class="sub">O vídeo é baixado no final. Na próxima tela, escolha <b>esta aba</b> para compartilhar.</p>
    <div class="f"><label>Formato</label><div class="seg"><label><input type="radio" name="rf" value="h" checked> Horizontal 16:9 (YouTube, apresentações)</label><label><input type="radio" name="rf" value="v"> Vertical 9:16 (Reels, Stories, TikTok)</label></div></div>
    <div class="f"><label>Avanço dos slides</label><div class="seg"><label><input type="radio" name="ra" value="auto" checked> Automático (${secs}s por slide, ou o tempo de cada slide)</label><label><input type="radio" name="ra" value="man"> Eu avanço com as setas enquanto narro (Esc termina)</label></div></div>
    <label class="chk"><input type="checkbox" id="rMic"> Gravar minha narração pelo microfone</label>
    <div class="f"><label for="rMus">Trilha sonora (opcional, .mp3 ou .wav)</label><input type="file" id="rMus" accept="audio/*"><span class="hint">A música abaixa sozinha enquanto você fala.</span></div>
    <div class="f"><label for="rVol">Volume da trilha</label><input type="range" id="rVol" min="0" max="100" value="35"></div>
    <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok>Começar</button></div>`,'confirm');
    m.el.querySelector('[data-c]').onclick=()=>{ m.close(); res(null); };
    m.el.querySelector('[data-ok]').onclick=()=>{ const q=s=>m.el.querySelector(s); const c={vertical:q('[name=rf]:checked').value==='v',manual:q('[name=ra]:checked').value==='man',mic:q('#rMic').checked,music:q('#rMus').files[0]||null,vol:+q('#rVol').value/100}; m.close(); res(c); }; });
  if(!cfg) return;
  let stream; try{ stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30,displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include'}); }catch(e){ setStatus('Gravação cancelada'); return; }
  /* áudio: microfone + trilha com "ducking" automático */
  let actx=null, mic=null, duckT=null, musicEl=null; const audioTracks=[];
  if(cfg.mic||cfg.music){ try{ actx=new AudioContext(); const dest=actx.createMediaStreamDestination();
      let musicGain=null, an=null;
      if(cfg.music){ musicEl=new Audio(URL.createObjectURL(cfg.music)); musicEl.loop=true; const src=actx.createMediaElementSource(musicEl); musicGain=actx.createGain(); musicGain.gain.value=cfg.vol; src.connect(musicGain).connect(dest); }
      if(cfg.mic){ try{ mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); const ms=actx.createMediaStreamSource(mic); ms.connect(dest); an=actx.createAnalyser(); an.fftSize=512; ms.connect(an); }catch(_){ setStatus('Microfone não liberado: gravando sem narração'); } }
      if(an&&musicGain){ const buf=new Uint8Array(an.fftSize); duckT=setInterval(()=>{ an.getByteTimeDomainData(buf); let s=0; for(const v of buf){ const x=(v-128)/128; s+=x*x; } const rms=Math.sqrt(s/buf.length); musicGain.gain.setTargetAtTime(rms>.045?cfg.vol*.25:cfg.vol,actx.currentTime,rms>.045?.08:.6); },90); }
      audioTracks.push(...dest.stream.getAudioTracks()); }catch(_){ setStatus('Não consegui preparar o áudio: gravando sem som'); } }
  const out=new MediaStream([...stream.getVideoTracks(),...audioTracks]);
  const type=['video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
  const rec=new MediaRecorder(out,type?{mimeType:type,videoBitsPerSecond:12e6}:undefined); const chunks=[];
  rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
  const stopAll=()=>{ clearInterval(duckT); stream.getTracks().forEach(t=>t.stop()); if(mic) mic.getTracks().forEach(t=>t.stop()); if(musicEl){ musicEl.pause(); } if(actx) actx.close().catch(()=>{}); };
  rec.onstop=async()=>{ stopAll(); if(!chunks.length){ setStatus('Nada foi gravado'); return; } const blob=new Blob(chunks,{type:rec.mimeType||'video/webm'}); const ext=/mp4/.test(blob.type)?'mp4':'webm'; try{ await saveFile(fileBase(d)+(cfg.vertical?'-vertical':'')+'.'+ext,blob,blob.type); setStatus('Vídeo salvo (.'+ext+')',true); }catch(_){ setStatus('Não consegui salvar o vídeo'); } };
  const rd=cfg.manual?clone(d):Object.assign(clone(d),{auto:{secs,loop:false}}); if(cfg.manual) delete rd.auto;
  let sess=null;
  sess=present(0,{deck:rd,recording:true,manual:cfg.manual,vertical:cfg.vertical,onEnd:()=>setTimeout(()=>sess&&sess.close(),2500),onClose:()=>{ if(rec.state!=='inactive') rec.stop(); else stopAll(); }});
  stream.getVideoTracks()[0].onended=()=>sess&&sess.close();
  /* recorta o vídeo só na área do slide (sem barra nem bordas), quando o navegador permite */
  try{ if(window.CropTarget&&CropTarget.fromElement){ const ct=await CropTarget.fromElement(sess.frame); await stream.getVideoTracks()[0].cropTo(ct); } }catch(_){}
  await sess.countdown(3); // 3, 2, 1 — fica fora do vídeo
  if(musicEl) musicEl.play().catch(()=>{});
  rec.start(1000); sess.player.replay(); setStatus('Gravando…');
}

/* Modo palco: tela de espera com contagem regressiva antes de começar */
/* ---------- ensaio: cronômetro por slide, ritmo e relatório ---------- */
const mmss=x=>{ x=Math.round(Math.abs(x)); return Math.floor(x/60)+':'+String(x%60).padStart(2,'0'); };
function startMusic(d,pl,id){
  const m=d.music; let el=null, actx=null, an=null, gain=null, raf=0, on=true, url='', stopped=false;
  const hist=[], beats=[]; let last=0, waiting=null;
  const api={ sync:m.sync!==false,
    toggle(){ on=!on; if(el){ if(on){ el.play().catch(()=>{}); } else el.pause(); } return on; },
    onBeat(fn){ /* espera o próximo tempo (no máximo 450 ms) para trocar de slide */
      if(!el||el.paused||beats.length<4){ fn(); return; } const iv=beats.slice(-8).map((b,i,a)=>i?b-a[i-1]:0).slice(1).sort((x,y)=>x-y), per=iv[iv.length>>1]||500, now=performance.now();
      let next=last+per; while(next<now) next+=per; const wait=next-now; if(wait>450||wait<40){ fn(); return; } clearTimeout(waiting); waiting=setTimeout(fn,wait); },
    stop(){ stopped=true; cancelAnimationFrame(raf); clearTimeout(waiting); if(el&&gain&&actx){ const t=actx.currentTime; gain.gain.setValueAtTime(gain.gain.value,t); gain.gain.linearRampToValueAtTime(0,t+.8); setTimeout(()=>{ el.pause(); actx.close().catch(()=>{}); if(url) URL.revokeObjectURL(url); },850); } else if(el){ el.pause(); } } };
  (async()=>{
    try{ if(m.src) url=D.resolveImage(m.src); else { const b=await IDB.get('music-'+id); if(!b) return; url=URL.createObjectURL(b); } }catch(_){ return; }
    if(stopped) return;
    el=new Audio(url); el.loop=true; el.crossOrigin='anonymous';
    try{ actx=new AudioContext(); const src=actx.createMediaElementSource(el); gain=actx.createGain(); gain.gain.value=0; an=actx.createAnalyser(); an.fftSize=1024; an.smoothingTimeConstant=.2; src.connect(an); an.connect(gain); gain.connect(actx.destination);
      gain.gain.linearRampToValueAtTime((m.vol||60)/100,actx.currentTime+1.5); }catch(_){ el.volume=(m.vol||60)/100; }
    el.play().catch(()=>{ /* o navegador pode exigir um clique antes */ const go=()=>{ if(on) el.play().catch(()=>{}); if(actx) actx.resume(); removeEventListener('pointerdown',go); removeEventListener('keydown',go); }; addEventListener('pointerdown',go); addEventListener('keydown',go); });
    if(!an||m.sync===false) return;
    const buf=new Uint8Array(an.frequencyBinCount);
    const loop=()=>{ if(stopped) return; raf=requestAnimationFrame(loop); if(el.paused) return; an.getByteFrequencyData(buf);
      let en=0; for(let i=1;i<10;i++) en+=buf[i]; en/=9*255; hist.push(en); if(hist.length>45) hist.shift();
      const avg=hist.reduce((a,x)=>a+x,0)/hist.length, now=performance.now();
      if(en>.25&&en>avg*1.25&&now-last>280){ last=now; beats.push(now); if(beats.length>16) beats.shift(); pl.beat(Math.min(1,(en-avg)*4+.4)); } };
    loop(); })();
  return api;
}
function rehearseDialog(){
  const d=deck(), r=review(d), est=Math.max(1,Math.round(r.secs/60)), last=(d.rehearsals||[])[0];
  const m=modal(`<h3>Ensaiar com cronômetro</h3><p class="sub">Apresente normalmente. Um painel discreto mostra o tempo de cada slide e se você está no ritmo. No final, um relatório mostra onde você demorou mais.</p>
    <div class="f"><label for="rhMin">Tempo total disponível (minutos)</label><input type="number" id="rhMin" min="1" step="1" value="${(last&&Math.round(last.target/60))||est}"><span class="hint">Estimativa pelo texto e notas: cerca de ${est} min. O tempo de cada slide é dividido proporcionalmente.</span></div>
    ${last?`<p class="sub">Último ensaio: ${mmss(last.total)} de ${mmss(last.target)} · ${new Date(last.at).toLocaleDateString('pt-BR')}</p>`:''}
    <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok>Começar ensaio</button></div>`,'confirm');
  m.el.querySelector('[data-c]').onclick=m.close;
  m.el.querySelector('[data-ok]').onclick=()=>{ const mins=Math.max(1,+m.el.querySelector('#rhMin').value||est); m.close(); present(0,{rehearse:{target:mins*60}}); };
}
function rehearsal(d,cfg,w){
  const per=review(d).per, sum=per.reduce((a,b)=>a+(b||0),0)||1, budget=per.map(x=>(x||0)/sum*cfg.target);
  const times=d.slides.map(()=>0), seen=new Set(); let cur=-1, last=performance.now(), paused=false, done=false;
  const hud=document.createElement('div'); hud.className='rh-hud'; hud.innerHTML='<div class="rh-row"><span class="rh-l">Slide</span><b class="rh-s">0:00</b><span class="rh-b"></span></div><div class="rh-bar"><i></i></div><div class="rh-row"><span class="rh-l">Total</span><b class="rh-t">0:00</b><span class="rh-tt">/ '+mmss(cfg.target)+'</span></div><div class="rh-pace"></div>'; w.appendChild(hud);
  const tick=()=>{ const now=performance.now(); if(!paused&&cur>=0) times[cur]+=(now-last)/1000; last=now; };
  const paint=()=>{ if(done) return; tick(); const t=times[cur]||0, b=budget[cur]||0, total=times.reduce((a,x)=>a+x,0);
    let plan=0; for(let i=0;i<d.slides.length;i++){ if(i===cur) plan+=Math.min(t,b); else if(seen.has(i)) plan+=budget[i]; }
    const diff=total-plan, f=b?t/b:0;
    hud.querySelector('.rh-s').textContent=mmss(t); hud.querySelector('.rh-b').textContent=b?'/ '+mmss(b):'oculto';
    const bar=hud.querySelector('.rh-bar i'); bar.style.width=Math.min(100,f*100)+'%'; hud.dataset.st=!b?'ok':f>1.25?'late':f>.85?'warn':'ok';
    hud.querySelector('.rh-t').textContent=mmss(total); hud.classList.toggle('over',total>cfg.target); hud.classList.toggle('paused',paused);
    hud.querySelector('.rh-pace').textContent=paused?'Pausado (R para continuar)':Math.abs(diff)<8?'No ritmo':diff>0?'Atrasado '+mmss(diff):'Adiantado '+mmss(diff); };
  const iv=setInterval(paint,250);
  return {
    go(n){ tick(); cur=n; seen.add(n); paint(); },
    pause(){ tick(); paused=!paused; paint(); },
    finish(){ if(done) return; tick(); done=true; clearInterval(iv); hud.remove();
      const total=times.reduce((a,x)=>a+x,0); if(total<5) return;
      const prev=(d.rehearsals||[])[0], rec={at:Date.now(),total:Math.round(total),target:cfg.target,times:times.map(x=>Math.round(x))};
      d.rehearsals=[rec].concat(d.rehearsals||[]).slice(0,5); if(d===deck()) touch();
      rehearseReport(d,rec,budget,prev); }
  };
}
function rehearseReport(d,rec,budget,prev){
  const max=Math.max(1,...rec.times,...budget), diff=rec.total-rec.target;
  const rows=d.slides.map((s,i)=>{ const t=rec.times[i], b=budget[i]; if(!t&&s.hidden) return ''; const dd=s.d||{}, ti=plain(dd.title||dd.quote||dd.word||dd.kicker||'')||(T[s.t]||{}).name||'';
    const st=!t?'skip':b&&t>b*1.25?'late':b&&t<b*.6?'fast':'ok';
    return `<div class="rh-r ${st}"><span class="rh-n">${i+1}</span><span class="rh-ti" title="${esc(ti)}">${esc(ti.replace(/\n/g,' '))}</span><span class="rh-g"><i class="pl" style="width:${b/max*100}%"></i><i class="ac" style="width:${t/max*100}%"></i></span><span class="rh-v">${t?mmss(t):'não visto'}<small>${b&&t?(t>b?'+':'−')+mmss(t-b):''}</small></span></div>`; }).join('');
  const slow=d.slides.map((s,i)=>({i,x:rec.times[i]-budget[i]})).filter(o=>o.x>10).sort((a,b)=>b.x-a.x).slice(0,3).map(o=>o.i+1);
  const vis=d.slides.filter(s=>!s.hidden).length, seenN=d.slides.filter((s,i)=>!s.hidden&&rec.times[i]>0).length;
  const verdict=seenN<vis?'Ensaio parcial: '+seenN+' de '+vis+' slides':Math.abs(diff)<=Math.max(15,rec.target*.05)?'Dentro do tempo':diff>0?'Passou '+mmss(diff)+' do tempo':'Sobrou '+mmss(diff);
  const m=modal(`<h3>Relatório do ensaio</h3><div class="rh-sum ${Math.abs(diff)<=Math.max(15,rec.target*.05)?'ok':diff>0?'late':'fast'}"><b>${mmss(rec.total)}</b><span>de ${mmss(rec.target)} · ${verdict}</span>${prev?`<small>Ensaio anterior: ${mmss(prev.total)} (${rec.total<=prev.total?'−':'+'}${mmss(rec.total-prev.total)})</small>`:''}</div>
    ${slow.length?`<p class="sub">Onde você mais passou do tempo: slide ${slow.join(', ')}. Considere enxugar o texto ou levar detalhes para as notas.</p>`:'<p class="sub">Nenhum slide passou muito do tempo planejado.</p>'}
    <div class="rh-leg"><span><i class="pl"></i>Planejado</span><span><i class="ac"></i>Seu tempo</span></div><div class="rh-list">${rows}</div>
    <div class="row"><button class="btn" data-dur title="Grava o tempo de cada slide no campo de avanço automático">Usar estes tempos no avanço automático</button><button class="btn" data-again>Ensaiar de novo</button><button class="btn pri" data-c>Fechar</button></div>`,'confirm review');
  m.el.querySelector('[data-c]').onclick=m.close;
  m.el.querySelector('[data-again]').onclick=()=>{ m.close(); present(0,{rehearse:{target:rec.target}}); };
  m.el.querySelector('[data-dur]').onclick=e=>{ d.slides.forEach((s,i)=>{ if(rec.times[i]>=2) s.dur=rec.times[i]; }); touch(); renderAll(); e.target.textContent='Tempos gravados ✓'; e.target.disabled=true; };
}
function stageDialog(){
  const m=modal(`<h3>Modo palco</h3><p class="sub">Mostra uma tela de espera com contagem regressiva enquanto o público chega. Ao zerar (ou ao apertar → ), a apresentação começa.</p>
    <div class="f"><label for="stMin">Minutos até começar</label><input type="number" id="stMin" min="0.1" step="0.5" value="5"></div>
    <div class="f"><label for="stMsg">Mensagem</label><input type="text" id="stMsg" value="Já vamos começar"></div>
    <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok>Abrir modo palco</button></div>`,'confirm');
  m.el.querySelector('[data-c]').onclick=m.close;
  m.el.querySelector('[data-ok]').onclick=()=>{ const mins=Math.max(.1,+m.el.querySelector('#stMin').value||5), msg=m.el.querySelector('#stMsg').value; m.close(); present(0,{stage:{mins,msg}}); };
}

/* ---------- nuvem: mescla edições de outro aparelho com as locais ---------- */
function mergeDeck(base,local,remote){
  if(!base) return local; const S=JSON.stringify, out=clone(remote);
  ['name','theme','footerText','footer','auto','header'].forEach(k=>{ if(S(local[k])!==S(base[k])){ if(local[k]===undefined) delete out[k]; else out[k]=clone(local[k]); } });
  const bs=new Map((base.slides||[]).map(s=>[s.id,S(s)])), ls=new Map((local.slides||[]).map(s=>[s.id,s]));
  out.slides=(remote.slides||[]).filter(s=>!(bs.has(s.id)&&!ls.has(s.id))).map(s=>{ const L=ls.get(s.id); return L&&S(L)!==bs.get(s.id)?clone(L):s; });
  (local.slides||[]).forEach((s,i)=>{ if(!bs.has(s.id)&&!out.slides.some(x=>x.id===s.id)){ const pid=i?local.slides[i-1].id:null; const j=pid?out.slides.findIndex(x=>x.id===pid):-1; out.slides.splice(j+1,0,clone(s)); } });
  return out;
}

/* ---------- inicialização ---------- */
(async function boot(){
  decks=await localLoad(); localIds=new Set(Object.keys(decks));
  await loadThemes(); await loadLib(); await preloadLocal();
  if(!Object.keys(decks).length){ if(window.SEED_DECKS) Object.assign(decks,clone(window.SEED_DECKS)); else { const id=uid(); decks[id]=starter(); } }
  Object.values(decks).forEach(normalize);
  const last=lsGet(LS+'-cur');
  curId=decks[last]?last:Object.keys(decks).sort((a,b)=>(decks[b].updatedAt||0)-(decks[a].updatedAt||0))[0];
  let novaVitrine=false;
  if(!lsGet(LS+'-vitrine-cidades')){ lsSet(LS+'-vitrine-cidades','1'); if(!Object.values(decks).some(d=>d.name==='Cidades que pensam')){ const id=uid(); decks[id]=normalize(buildShowcase(SHOWCASES[0])); curId=id; novaVitrine=true; } }
  renderAll(); if(novaVitrine) touch(); setStatus('Salvo neste navegador');
  const wantPlay=/^#play-([\w-]+)/.exec(location.hash);
  if(!window.claude||!window.claude.use){ if(wantPlay&&decks[wantPlay[1]]){ curId=wantPlay[1]; renderAll(); present(0); } return; }
  claude.use('downloads').then(x=>{ downloads=x; if(!x) $('#exportBtn').hidden=true; });
  claude.use('assets').then(x=>{ assets=x; });
  claude.use('db').then(x=>{
    if(!x){ $('#pane').insertAdjacentHTML('afterbegin','<div class="banner">Entre na sua conta para salvar na nuvem. Por enquanto, tudo fica neste navegador.</div>'); if(wantPlay&&decks[wantPlay[1]]){ curId=wantPlay[1]; renderAll(); present(0); } return; }
    db=x; let first=true; const to=setTimeout(()=>{ if(first) setStatus('Nuvem demorando, editando localmente'); },10000);
    db.collection('decks').onSnapshot(qs=>{
      clearTimeout(to);
      const remote={}; qs.docs.forEach(s=>{ if(s.exists){ remote[s.id]=normalize(clone(s.data())); } });
      if(first){
        Object.entries(remote).forEach(([id,dk])=>{ remoteBase[id]=clone(dk); });
        first=false; mode='db';
        const localOnly=decks; decks=remote;
        // leva para a nuvem o que só existia neste navegador e foi editado
        Object.entries(localOnly).forEach(([id,dk])=>{ if(!remote[id] && (dk.slides||[]).length && localIds.has(id)) { decks[id]=dk; db.doc('decks/'+id).set(clone(dk)).catch(()=>{}); } });
        if(!Object.keys(decks).length){ const id=uid(); decks[id]=starter(); }
        if(!decks[curId]) curId=Object.keys(decks).sort((a,b)=>(decks[b].updatedAt||0)-(decks[a].updatedAt||0))[0];
        if(wantPlay&&decks[wantPlay[1]]) curId=wantPlay[1];
        sel=0; Object.keys(hist).forEach(k=>delete hist[k]); renderAll(); setStatus('Salvo na nuvem',true);
        if(wantPlay&&decks[wantPlay[1]]) present(0);
        return;
      }
      // atualizações vindas de outro aparelho ou do Claude
      let changed=false, merged=false;
      qs.docChanges().forEach(c=>{ const id=c.doc.id;
        if(c.type==='removed'){ if(id!==curId){ delete decks[id]; changed=true; } return; }
        if(c.doc.metadata.hasPendingWrites) return;
        const nd=normalize(clone(c.doc.data())); const base=remoteBase[id]; remoteBase[id]=clone(nd);
        if(JSON.stringify(nd)===JSON.stringify(decks[id])) return;
        if(id===curId && (dirty||saving)){
          // há edição local pendente: mescla por slide em vez de descartar um dos lados
          decks[id]=mergeDeck(base,decks[id],nd); merged=true; dirty=true; clearTimeout(saveT); saveT=setTimeout(save,600);
        } else decks[id]=nd;
        changed=true; });
      if(changed){
        if(!decks[curId]) curId=Object.keys(decks)[0];
        if(hist[curId]) hist[curId].last=ser(deck());
        const typing=$('#pane').contains(document.activeElement);
        renderDeckPick(); renderRail(); renderPreview(false); if(!typing) renderPane();
        if(merged) setStatus('Mesclado com alterações de outro aparelho',true);
      }
    },err=>{ setStatus('Nuvem indisponível, editando localmente'); mode='local'; });
  });
})();
})();
