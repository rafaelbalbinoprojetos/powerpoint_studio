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
async function loadThemes(){ try{ myThemes=(await IDB.get('themes'))||[]; }catch(_){ try{ myThemes=JSON.parse(lsGet(LS+'-themes')||'[]'); }catch(e){ myThemes=[]; } } }
async function saveThemes(){ try{ await IDB.set('themes',clone(myThemes)); }catch(_){ lsSet(LS+'-themes',JSON.stringify(myThemes)); } }

/* ---------- persistência ---------- */
function setStatus(txt,ok){ const s=$('#status'); if(!s) return; s.textContent=txt; s.classList.toggle('ok',!!ok); }
function touch(){ const d=deck(); if(!d) return; d.updatedAt=Date.now(); dirty=true; setStatus('Alterado…'); clearTimeout(saveT); saveT=setTimeout(save,900); clearTimeout(histT); histT=setTimeout(snap,600); }
async function save(){
  const d=deck(); if(!d) return;
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
function renderRail(){
  const d=deck(), rail=$('#rail'); thumbCleanup.forEach(f=>f()); thumbCleanup.clear();
  rail.innerHTML=d.slides.map((s,i)=>`<button class="thumb${i===sel?' sel':''}${s.hidden?' hid':''}" data-i="${i}" aria-label="Slide ${i+1}: ${esc((T[s.t]||{}).name||s.t)}"><div class="tv"></div><div class="meta"><span>${String(i+1).padStart(2,'0')}</span><span>${s.hidden?'<b class="hid-tag">oculto</b>':''}${s.notes?'<i class="has-notes" title="Tem notas do apresentador"></i>':''}${esc((T[s.t]||{}).name||s.t)}</span></div></button>`).join('')+`<button class="addslide" id="addSlide">+ Adicionar slide</button>`;
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
  tpl.fields.forEach(f=>pane.appendChild(field(f,s.d,`${s.id}-${f.k}`,()=>liveEdit())));
  if(s.t==='video'){ const hv=document.createElement('p'); hv.className='tip'; hv.textContent='O vídeo não vai embutido no arquivo exportado: use um endereço público (https://…) ou deixe o arquivo de vídeo na mesma pasta do HTML.'; pane.appendChild(hv); }
  /* animação e notas */
  const box=document.createElement('div'); box.className='slideopts';
  box.innerHTML=`<div class="sec">Animação deste slide</div>
  <div class="f2"><div class="f"><label for="o-anim">Entrada dos elementos</label><select id="o-anim">${opt(D.ANIMS,s.anim||'padrao')}</select></div>
  <div class="f"><label for="o-speed">Velocidade</label><select id="o-speed">${opt({'0.5':'Bem lenta','0.75':'Lenta','1':'Normal','1.5':'Rápida','2':'Bem rápida'},String(s.speed||1))}</select></div></div>
  <div class="f2"><div class="f"><label for="o-tr">Transição ao chegar</label><select id="o-tr">${opt(D.TRANSITIONS,s.tr||'deslizar')}</select></div>
  <div class="f"><label for="o-dur">Tempo no avanço automático</label><input type="number" id="o-dur" min="0" step="0.5" placeholder="padrão" value="${s.dur||''}"><span class="hint">segundos (vazio = padrão do tema)</span></div></div>
  <div class="sec">Exibição</div>
  <label class="chk"><input type="checkbox" id="o-hid"${s.hidden?' checked':''}> Slide oculto (só abre por um link do OnePage)</label>
  ${d.header&&d.header.on?`<div class="f"><label for="o-head">Faixa de cabeçalho neste slide</label><select id="o-head">${opt({'':'Automático','show':'Mostrar','hide':'Esconder'},s.head||'')}</select></div>`:''}
  <div class="sec">Notas do apresentador</div>
  <div class="f"><textarea id="o-notes" rows="4" placeholder="O que falar neste slide. Aparece só na janela do apresentador.">${esc(s.notes||'')}</textarea></div>`;
  pane.appendChild(box);
  const animCh=()=>{ touch(); if(player){ player.update(sel,deck()); player.replay(); } };
  $('#o-anim').onchange=e=>{ if(e.target.value==='padrao') delete s.anim; else s.anim=e.target.value; animCh(); };
  $('#o-speed').onchange=e=>{ const v=+e.target.value; if(v===1) delete s.speed; else s.speed=v; animCh(); };
  $('#o-tr').onchange=e=>{ if(e.target.value==='deslizar') delete s.tr; else s.tr=e.target.value; touch(); if(player) player.update(sel,deck()); };
  $('#o-dur').oninput=e=>{ const v=parseFloat(e.target.value); if(v>0) s.dur=v; else delete s.dur; touch(); };
  $('#o-hid').onchange=e=>{ if(e.target.checked) s.hidden=true; else delete s.hidden; touch(); renderRail(); };
  if($('#o-head')) $('#o-head').onchange=e=>{ if(e.target.value) s.head=e.target.value; else delete s.head; touch(); renderPreview(false); refreshThumb(sel); };
  $('#o-notes').oninput=e=>{ s.notes=e.target.value; if(!s.notes) delete s.notes; touch(); };
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
  <div class="sec">Marca</div><div class="f"><label>Logo (aparece na capa, rodapé e núcleo)</label><div id="logoBox"></div><span class="hint">PNG ou SVG transparente funciona melhor.</span></div>
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
  const m=modal(`<h3>${kind==='swap'?'Trocar modelo do slide':'Escolha um modelo'}</h3><p class="sub">${kind==='swap'?'Título, rótulo e texto de apoio são mantidos.':'O slide entra depois do selecionado, com texto de exemplo para você editar.'}</p><div class="gal">${Object.entries(T).map(([k,t])=>`<button class="gcard" data-t="${k}"><div class="tv"></div><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>`);
  m.el.querySelectorAll('.gcard').forEach(c=>{ const k=c.dataset.t; D.renderStatic(c.querySelector('.tv'),{theme:d.theme,name:d.name,footerText:d.footerText,footer:d.footer,slides:[{t:k,d:T[k].sample}]},0);
    c.onclick=()=>{ m.close();
      if(kind==='swap'){ const s=d.slides[sel]; const keep={}; ['kicker','title','lead','image','showLogo'].forEach(x=>{ if(s.d&&s.d[x]!=null&&T[k].fields.some(f=>f.k===x)) keep[x]=s.d[x]; }); s.t=k; s.d=Object.assign(clone(T[k].sample),keep); }
      else { d.slides.splice(sel+1,0,{id:uid(),t:k,d:clone(T[k].sample)}); sel=Math.min(sel+1,d.slides.length-1); }
      touch(); renderRail(); renderPreview(true); tab='content'; renderPane(); }; });
}
$('#deckMenu').onclick=()=>{
  const m=modal(`<h3>Apresentações</h3><p class="sub">${mode==='db'?'Salvas na sua conta, disponíveis em qualquer aparelho.':'Salvas só neste navegador.'}</p><div class="menu">
  <button class="btn" data-a="new">+ Nova apresentação</button><button class="btn" data-a="vitrine">Começar de uma apresentação pronta</button><button class="btn" data-a="script">Criar a partir de um roteiro (texto)</button><button class="btn" data-a="dup">Duplicar esta apresentação</button>
  <div class="sec">Exportar</div><button class="btn" data-a="pdf">Salvar em PDF (um slide por página)</button><button class="btn" data-a="rec">Gravar vídeo da apresentação</button>
  <div class="sec">Backup</div><button class="btn" data-a="bk">Baixar backup de todas (.json)</button><button class="btn" data-a="im">Importar backup (.json)</button>
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
  on('script',scriptDialog);
  on('vitrine',showcaseDialog);
  on('pdf',exportPDF);
  on('rec',recordVideo);
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
function scriptDialog(){
  const m=modal(`<h3>Criar a partir de um roteiro</h3><p class="sub">Cada <code>#</code> começa um slide. O modelo é escolhido sozinho, ou force com <code>{cartoes}</code>, <code>{fluxo}</code>, <code>{numeros}</code>… <code>[Rótulo]</code> vira o rótulo, <code>- item</code> vira tópico (use <code>Título: texto</code> para cartões e números) e <code>Nota:</code> vai para as notas do apresentador.</p>
  <textarea id="scr" rows="16" style="width:100%;font-family:var(--ui-m);font-size:12px" placeholder="${esc(SCRIPT_HELP)}"></textarea>
  <p class="hint">Modelos: ${Object.entries(T).map(([k,t])=>`<code>${k}</code> (${esc(t.name)})`).join(', ')}</p>
  <div class="row"><button class="btn" data-c>Cancelar</button><button class="btn" data-add>Adicionar ao final desta</button><button class="btn pri" data-new>Criar nova apresentação</button></div>`);
  const ta=m.el.querySelector('#scr'); ta.focus();
  m.el.querySelector('[data-c]').onclick=m.close;
  const run=asNew=>{ const slides=parseScript(ta.value||''); if(!slides.length){ ta.value=ta.value||SCRIPT_HELP; return; }
    m.close();
    if(asNew){ const id=uid(); const title=String(slides[0].d.title||'Nova apresentação').replace(/[*`\n]/g,' ').trim(); decks[id]={name:title,theme:clone(deck().theme||{preset:'eletrico'}),footerText:'',updatedAt:Date.now(),slides}; curId=id; sel=0; }
    else { const d=deck(); d.slides.push(...slides.map(s=>s.t==='capa'?Object.assign(s,{t:'destaque',d:D.fillDefaults({t:'destaque',d:{kicker:s.d.kicker,title:s.d.title,lead:s.d.lead}}).d}):s)); sel=d.slides.length-slides.length; }
    touch(); renderAll(); setStatus(slides.length+' slides criados',true); };
  m.el.querySelector('[data-new]').onclick=()=>run(true);
  m.el.querySelector('[data-add]').onclick=()=>run(false);
}
/* ---------- apresentações prontas (vitrine) ---------- */
const SHOWCASES=[
 {name:'Narrativa em movimento',preset:'vinho',magic:true,desc:'Movimento mágico: títulos, números e imagens viajam de um slide para o outro, como em um filme.',script:`# A jornada *do projeto* {destaque}\n[Capítulo 1]\nDe uma planilha compartilhada a uma plataforma de decisão.\n\n# A jornada *do projeto* {cartoes}\n[Capítulo 1]\n- Começo: uma planilha compartilhada\n- Virada: dados integrados em um só lugar\n- Hoje: decisões em minutos, com histórico\n\n# O que *mudou* {numeros}\n[Capítulo 2]\n- R$ 1.250.000: economia no período\n- 832: decisões analisadas\n\n# O que *mudou* {painel}\n[Capítulo 2]\n- Economia: 1.250.000\n- Decisões: 832\n- No prazo: 94%\n- Pendências: 27\n- Área | Decisões | Economia\n- Funilaria | 312 | R$ 410 mil\n- Pintura | 208 | R$ 260 mil\n- Montagem | 145 | R$ 180 mil\n\n# Próximo *capítulo* {destaque}\n[Capítulo 3]\nLevar para todas as áreas até dezembro.\n\n# Obrigado\n- Mais visibilidade\n- Decisões justificadas\n- Rastreabilidade`},
 {name:'Pitch de negócio',preset:'aurora',desc:'OnePage com 6 blocos que abrem slides ocultos de detalhe. Ideal para apresentar só uma tela e aprofundar quando perguntarem.',header:{on:true,text:'Pitch · Rodada Seed 2026'},script:`# Nome da empresa\nUma frase que explica o que vocês fazem, em poucas palavras.\n- Rodada Seed 2026\n- 12 clientes piloto\n- Fundada em 2025\n\n# O negócio em uma tela {onepage}\n[Resumo]\n- Problema: 30% do tempo perdido procurando informação\n- Solução: uma base única com busca inteligente\n- Mercado: R$ 4 bi no Brasil\n- Tração: 12 clientes piloto\n- Modelo: assinatura por usuário\n- Equipe: 4 fundadores técnicos\nNota: apresente só esta tela e abra os blocos conforme as perguntas.\n\n# Problema (oculto) {destaque}\n[O problema]\nEquipes perdem horas por semana procurando dados espalhados em planilhas, e-mails e sistemas.\n\n# Solução (oculto) {tela}\n[A solução]\n- Integra: conecta planilhas e sistemas em minutos\n- Encontra: busca em linguagem natural\n- Alerta: avisa quando algo sai do padrão\n\n# Mercado (oculto) {numeros}\n[Tamanho do mercado]\n- R$ 4 bi: mercado total no Brasil\n- 38 mil: empresas médias no perfil\n- 18%: crescimento ao ano\n\n# Tração (oculto) {grafico}\n[Tração]\n- Jan: 2\n- Fev: 4\n- Mar: 7\n- Abr: 12\n\n# Modelo (oculto) {cartoes}\n[Como ganhamos dinheiro]\n- Essencial: R$ 49 por usuário ao mês\n- Profissional: R$ 89 com integrações\n- Empresa: contrato anual sob medida\n\n# Equipe (oculto) {equipe}\n[Quem faz]\n- Pessoa 1: Produto\n- Pessoa 2: Engenharia\n- Pessoa 3: Dados\n- Pessoa 4: Vendas\n\n# Vamos conversar?\n- Investimento de R$ 2 mi\n- 18 meses de pista\n- Meta: 100 clientes pagantes`},
 {name:'Resultados do trimestre',preset:'editorial',desc:'Números, gráfico, comparação e tabela num visual editorial claro.',header:{on:true,text:'Resultados · 3º trimestre de 2026'},script:`# Resultados do 3º trimestre\nO que entregamos, o que aprendemos e o que vem a seguir.\n- Jul a Set 2026\n- Diretoria de Operações\n\n# Os números do trimestre {numeros}\n[Visão geral]\n- R$ 1.250.000: economia acumulada\n- 832: decisões analisadas\n- 94%: dentro do prazo\n\n# Evolução mês a mês {grafico}\n[Economia em R$ mil]\n- Abr: 120\n- Mai: 180\n- Jun: 210\n- Jul: 260\n- Ago: 330\n- Set: 410\n\n# Antes e depois {comparacao}\n[O que mudou]\n- Planilhas soltas\n- Decisão sem histórico\n- Retrabalho mensal\n- Uma base única\n- Cada decisão justificada\n- Alertas automáticos\n\n# Desempenho por área {tabela}\n[Comparativo]\n- Funilaria: 312 | R$ 410 mil\n- Pintura: 208 | R$ 260 mil\n- Montagem: 145 | R$ 180 mil\n\n# Próximo trimestre {agenda}\n[Plano]\n- Outubro: levar para mais duas áreas\n- Novembro: painel para a diretoria\n- Dezembro: revisão anual\n\n# Obrigado\n- Mais visibilidade\n- Decisões justificadas\n- Rastreabilidade`},
 {name:'Lançamento de produto',preset:'grafite',desc:'Efeitos cinematográficos: revelar, mergulho 3D, galeria 3D e paralaxe. Troque as imagens de exemplo pelas suas.',script:`# Apresentamos o novo produto\nUma nova forma de trabalhar com os seus dados.\n- Lançamento 2026\n\n# A nova fase {revelar}\n[Lançamento]\nMais simples, mais rápido e feito para equipes.\n\n# Do rascunho ao produto {mergulho}\n[A jornada]\n- O primeiro protótipo\n- Os primeiros clientes\n- O produto final\n\n# Feito para cada equipe {galeria3d}\n[Casos de uso]\n- Operações\n- Finanças\n- Compras\n- Manutenção\n- Diretoria\n- Qualidade\n\n# FUTURO {paralaxe}\n[Edição 2026]\n\n# Pela primeira vez, a gente *decide olhando o mesmo número* {citacao}\nNome da pessoa\n\n# Disponível hoje\n- Teste grátis por 30 dias\n- Migração assistida\n- Suporte em português`}
];
function showcaseDialog(){
  const m=modal(`<h3>Começar de uma apresentação pronta</h3><p class="sub">Cria uma apresentação nova, com textos de exemplo para você trocar. Nada do que você já tem é alterado.</p><div class="gal">${SHOWCASES.map((x,i)=>`<button class="gcard" data-v="${i}"><div class="tv"></div><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></button>`).join('')}</div>`);
  const build=x=>{ const slides=parseScript(x.script); if(x.magic) slides.forEach((s,i)=>{ if(i) s.tr='magico'; }); return {name:x.name,theme:{preset:x.preset},footerText:'',updatedAt:Date.now(),slides,...(x.header?{header:clone(x.header)}:{})}; };
  m.el.querySelectorAll('.gcard').forEach(c=>{ const x=SHOWCASES[+c.dataset.v], dk=build(x); D.renderStatic(c.querySelector('.tv'),dk,dk.slides.findIndex(s=>s.t==='onepage')>0?1:0);
    c.onclick=()=>{ m.close(); const id=uid(); decks[id]=build(x); curId=id; sel=0; touch(); renderAll(); setStatus('“'+x.name+'” criada',true); }; });
}
function parseScript(txt){
  const out=[]; let cur=null; const blank=title=>({title,tpl:null,kicker:'',lead:[],bullets:[],notes:[]});
  txt.replace(/\r/g,'').split('\n').forEach(raw=>{
    const l=raw.trim(); let m; if(!l) return;
    if((m=/^#{1,3}\s+(.+?)(?:\s*\{\s*(\w+)\s*\})?(\s*\((?:oculto|oculta)\))?(?:\s*\{\s*(\w+)\s*\})?$/i.exec(l))){ if(cur) out.push(cur); let ti=m[1]; let hidden=!!m[3]; const hm=/\s*\((?:oculto|oculta)\)\s*$/i.exec(ti); if(hm){ hidden=true; ti=ti.slice(0,hm.index); } cur=blank(ti); cur.hidden=hidden; const tp=m[2]||m[4]; if(tp&&T[tp]) cur.tpl=tp; return; }
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
    case 'grafico': d.bars=P.map(p=>({label:p.a,value:p.b,hot:false})); break;
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
$('#dupBtn').onclick=()=>{ const s=deck().slides; s.splice(sel+1,0,Object.assign(clone(s[sel]),{id:uid()})); sel++; touch(); renderRail(); renderPreview(true); renderPane(); };
$('#delBtn').onclick=()=>{ const s=deck().slides; if(!s.length) return; confirmBox('Excluir o slide '+(sel+1)+'?','Excluir',()=>{ s.splice(sel,1); sel=Math.max(0,sel-1); touch(); renderRail(); renderPreview(true); renderPane(); }); };
addEventListener('keydown',e=>{
  if(document.querySelector('.modal,.show')) return;
  const tg=e.target.tagName, typing=tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT';
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod&&!typing&&k==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if(mod&&!typing&&k==='y'){ e.preventDefault(); redo(); return; }
  if(typing) return;
  if(e.key==='ArrowRight') select(sel+1); if(e.key==='ArrowLeft') select(sel-1);
});
addEventListener('beforeunload',()=>{ if(dirty&&mode!=='db') localSave(); });

/* ---------- modo apresentação ---------- */
function present(start,o={}){
  const d=o.deck||deck(); if(!d.slides.length) return;
  const w=document.createElement('div'); w.className='show'+(o.recording?' rec':''); w.innerHTML=`<div class="host"></div><div class="bar"><button data-x aria-label="Sair">✕</button><button data-p aria-label="Anterior">‹</button><div class="pg"><i></i></div><span class="n"></span><button data-n aria-label="Próximo">›</button><button data-v aria-label="Janela do apresentador" title="Janela do apresentador (P)">🗒</button><button data-tool="laser" aria-label="Ponteiro laser" title="Ponteiro laser (L)">●</button><button data-tool="zoom" aria-label="Zoom" title="Zoom: clique para aproximar (Z)">⌕</button><button data-tool="voice" aria-label="Comando por voz" title="Comando por voz (V)">🎙</button><button data-tool="help" aria-label="Atalhos" title="Atalhos (?)">?</button><button data-f aria-label="Tela cheia">⤢</button></div><canvas class="laser" aria-hidden="true"></canvas><div class="voice-chip" hidden></div>`;
  document.body.appendChild(w);
  let pop=null;
  const tell=msg=>{ try{ if(pop&&!pop.closed) pop.postMessage(Object.assign({em:1},msg),'*'); }catch(_){} };
  const upd=n=>{ w.querySelector('.n').textContent=(n+1)+' / '+d.slides.length; w.querySelector('.pg i').style.width=((n+1)/d.slides.length*100)+'%'; tell({type:'index',n}); };
  const pl=D.createPlayer(w.querySelector('.host'),d,{start:start||0,onChange:upd,autoplay:true,links:true,onEnd:o.onEnd}); upd(start||0);
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
  function setVoice(v){
    if(v&&!SR){ say('Comando por voz não funciona neste navegador. Use Chrome ou Edge.',3500); return; }
    voiceOn=v; toolBtn('voice').classList.toggle('on',v);
    if(!v){ try{ rec&&rec.stop(); }catch(_){} rec=null; chip.hidden=true; return; }
    rec=new SR(); rec.lang='pt-BR'; rec.continuous=true; rec.interimResults=false;
    rec.onresult=e=>{ const t=e.results[e.results.length-1][0].transcript.toLowerCase().trim();
      if(/pr[oó]xim|avan[cç]|seguinte|next/.test(t)){ pl.next(); say('🎙 “'+t+'” → próximo',1600); }
      else if(/volt|anterior|back/.test(t)){ pl.prev(); say('🎙 “'+t+'” → voltar',1600); }
      else if(/tela cheia/.test(t)){ fs(); say('🎙 tela cheia',1600); }
      else if(/laser/.test(t)){ setLaser(!laser); say('🎙 laser',1600); }
      else if(/in[ií]cio|primeiro/.test(t)){ pl.go(0); say('🎙 início',1600); }
      else say('🎙 “'+t+'”',1400); };
    rec.onerror=ev=>{ if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){ say('Microfone bloqueado. Permita o microfone no navegador.',4000); voiceOn=false; toolBtn('voice').classList.remove('on'); } };
    rec.onend=()=>{ if(voiceOn&&rec) try{ rec.start(); }catch(_){} };
    try{ rec.start(); say('🎙 Ouvindo… diga “próximo” ou “voltar”'); }catch(_){ say('Não consegui ligar o microfone.',3000); }
  }
  function toggleHelp(){ if(help){ help.remove(); help=null; return; }
    help=document.createElement('div'); help.className='kbd-help'; help.innerHTML=`<div class="kh-in"><h3>Atalhos da apresentação</h3><dl>
      <dt>→ · Espaço · Enter</dt><dd>Próximo</dd><dt>← · Backspace</dt><dd>Anterior</dd><dt>F</dt><dd>Tela cheia</dd><dt>P</dt><dd>Janela do apresentador (notas e cronômetro)</dd>
      <dt>L</dt><dd>Ponteiro laser</dd><dt>Z</dt><dd>Zoom: clique para aproximar, clique de novo para voltar</dd><dt>V</dt><dd>Comando por voz: “próximo”, “voltar”, “início”, “tela cheia”</dd><dt>B</dt><dd>Tela preta (pausa)</dd><dt>Esc</dt><dd>Sair</dd></dl><p>Pressione ? ou Esc para fechar</p></div>`;
    help.onclick=toggleHelp; w.appendChild(help); }
  const black=()=>w.classList.toggle('blackout');
  toolBtn('laser').onclick=e=>{ e.stopPropagation(); setLaser(!laser); };
  toolBtn('zoom').onclick=e=>{ e.stopPropagation(); setZoom(!zoomMode); };
  toolBtn('voice').onclick=e=>{ e.stopPropagation(); setVoice(!voiceOn); };
  toolBtn('help').onclick=e=>{ e.stopPropagation(); toggleHelp(); };
  let closed=false;
  const close=()=>{ if(closed) return; closed=true; setVoice(false); setLaser(false); removeEventListener('resize',sizeL); tell({type:'end'}); pl.destroy(); w.remove(); removeEventListener('keydown',key); removeEventListener('message',onMsg); try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_){} if(location.hash.startsWith('#play-')) try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){} o.onClose&&o.onClose(); };
  const key=e=>{ const k=e.key.toLowerCase();
    if(e.key==='Escape'){ if(help) return toggleHelp(); if(w.classList.contains('blackout')) return black(); if(zoomed||zoomMode) return setZoom(false); return close(); }
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();pl.next();} else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();pl.prev();}
    else if(k==='f') fs(); else if(k==='p') openPresenter(); else if(k==='l') setLaser(!laser); else if(k==='z') setZoom(!zoomMode); else if(k==='v') setVoice(!voiceOn); else if(k==='b'||k==='.') black(); else if(e.key==='?'||k==='h') toggleHelp(); };
  addEventListener('keydown',key);
  w.querySelector('[data-x]').onclick=close; w.querySelector('[data-p]').onclick=()=>pl.prev(); w.querySelector('[data-n]').onclick=()=>pl.next(); w.querySelector('[data-f]').onclick=fs; w.querySelector('[data-v]').onclick=openPresenter;
  host.onclick=e=>{ if(o.recording) return;
    if(zoomMode){ if(zoomed) unzoom(); else { zoomed=true; host.style.transformOrigin=`${e.clientX}px ${e.clientY}px`; host.style.transform='scale(2.2)'; w.classList.add('zoomed'); } return; }
    e.clientX>innerWidth*.3?pl.next():pl.prev(); };
  let sx=null; w.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;},{passive:true}); w.addEventListener('touchend',e=>{ if(sx==null) return; const dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>40) dx<0?pl.next():pl.prev(); sx=null; },{passive:true});
  if(!o.recording) try{ history.replaceState(null,'','#play-'+curId); }catch(_){}
  return {close,player:pl};
}
$('#playBtn').onclick=()=>present(sel);

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

/* Vídeo: grava a própria aba enquanto a apresentação roda sozinha */
async function recordVideo(){
  const d=deck(); if(!d.slides.length) return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia||!window.MediaRecorder){ setStatus('Este navegador não grava a tela. Use Chrome ou Edge.'); return; }
  const secs=+((d.auto||{}).secs)||5;
  const ok=await new Promise(res=>{ const m=modal(`<h3>Gravar vídeo</h3><p class="sub">A apresentação vai rodar sozinha do início ao fim (${secs}s por slide, ou o tempo de cada slide) e o vídeo é baixado no final.</p><p class="sub">Na próxima tela, escolha <b>esta aba</b> para compartilhar. Dica: deixe a janela grande ou em tela cheia para o vídeo sair em boa resolução. Esc interrompe.</p><div class="row"><button class="btn" data-c>Cancelar</button><button class="btn pri" data-ok>Começar</button></div>`,'confirm'); m.el.querySelector('[data-c]').onclick=()=>{ m.close(); res(false); }; m.el.querySelector('[data-ok]').onclick=()=>{ m.close(); res(true); }; });
  if(!ok) return;
  let stream; try{ stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30,displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include'}); }catch(e){ setStatus('Gravação cancelada'); return; }
  const type=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
  const rec=new MediaRecorder(stream,type?{mimeType:type,videoBitsPerSecond:12e6}:undefined); const chunks=[];
  rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
  rec.onstop=async()=>{ stream.getTracks().forEach(t=>t.stop()); if(!chunks.length){ setStatus('Nada foi gravado'); return; } const blob=new Blob(chunks,{type:rec.mimeType||'video/webm'}); const ext=/mp4/.test(blob.type)?'mp4':'webm'; try{ await saveFile(fileBase(d)+'.'+ext,blob,blob.type); setStatus('Vídeo salvo (.'+ext+')',true); }catch(_){ setStatus('Não consegui salvar o vídeo'); } };
  const rd=Object.assign(clone(d),{auto:{secs,loop:false}});
  let sess=null;
  sess=present(0,{deck:rd,recording:true,onEnd:()=>setTimeout(()=>sess&&sess.close(),2500),onClose:()=>{ if(rec.state!=='inactive') rec.stop(); }});
  stream.getVideoTracks()[0].onended=()=>sess&&sess.close();
  await new Promise(r=>setTimeout(r,500)); // deixa o aviso de compartilhamento sumir
  rec.start(1000); sess.player.replay(); setStatus('Gravando…');
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
  await loadThemes();
  if(!Object.keys(decks).length){ if(window.SEED_DECKS) Object.assign(decks,clone(window.SEED_DECKS)); else { const id=uid(); decks[id]=starter(); } }
  Object.values(decks).forEach(normalize);
  const last=lsGet(LS+'-cur');
  curId=decks[last]?last:Object.keys(decks).sort((a,b)=>(decks[b].updatedAt||0)-(decks[a].updatedAt||0))[0];
  renderAll(); setStatus('Salvo neste navegador');
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
