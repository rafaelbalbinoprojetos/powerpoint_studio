(function(){
"use strict";
const D=window.Deck, T=D.TEMPLATES;
const $=s=>document.querySelector(s), esc=D.esc;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- estado ---------- */
let decks={}, curId=null, sel=0, tab='content', player=null, db=null, assets=null, downloads=null;
let dirty=false, saveT=null, mode='local', saving=false, pendingSave=false;
const LS='estudio-motion-decks';

function starter(){
  return {name:'Minha apresentação',theme:{preset:'eletrico'},footerText:'',updatedAt:Date.now(),
    slides:['capa','cartoes','fluxo','numeros','encerramento'].map(t=>({id:uid(),t,d:clone(T[t].sample)}))};
}
const deck=()=>decks[curId];

/* ---------- persistência ---------- */
function setStatus(txt,ok){ const s=$('#status'); s.textContent=txt; s.classList.toggle('ok',!!ok); }
function localLoad(){ try{ return JSON.parse(localStorage.getItem(LS)||'{}')||{}; }catch(e){ return {}; } }
function localSave(){ try{ localStorage.setItem(LS,JSON.stringify(decks)); return true; }catch(e){ return false; } }
function touch(){ const d=deck(); if(!d) return; d.updatedAt=Date.now(); dirty=true; setStatus('Alterado…'); clearTimeout(saveT); saveT=setTimeout(save,900); }
async function save(){
  const d=deck(); if(!d) return;
  if(saving){ pendingSave=true; return; }
  if(mode==='db'){
    saving=true; setStatus('Salvando…');
    try{ await db.doc('decks/'+curId).set(clone(d)); dirty=false; setStatus('Salvo',true); }
    catch(e){ setStatus(e&&e.code==='permission_denied'?'Sem permissão para salvar':'Não salvou, tentando de novo'); if(!(e&&e.code==='permission_denied')) setTimeout(save,4000); }
    saving=false; if(pendingSave){ pendingSave=false; save(); }
  } else { setStatus(localSave()?'Salvo neste navegador':'Não foi possível salvar',true); dirty=false; }
}

/* ---------- renderização ---------- */
function renderAll(){ renderDeckPick(); renderRail(); renderPreview(true); renderPane(); }
function renderDeckPick(){
  const ids=Object.keys(decks).sort((a,b)=>(decks[b].updatedAt||0)-(decks[a].updatedAt||0));
  $('#deckSel').innerHTML=ids.map(id=>`<option value="${esc(id)}"${id===curId?' selected':''}>${esc(decks[id].name||'Sem nome')}</option>`).join('');
  if(document.activeElement!==$('#deckName')) $('#deckName').value=deck()?deck().name||'':'';
}
const thumbCleanup=new Map();
function renderRail(){
  const d=deck(), rail=$('#rail'); thumbCleanup.forEach(f=>f()); thumbCleanup.clear();
  rail.innerHTML=d.slides.map((s,i)=>`<button class="thumb${i===sel?' sel':''}" data-i="${i}" aria-label="Slide ${i+1}: ${esc((T[s.t]||{}).name||s.t)}"><div class="tv"></div><div class="meta"><span>${String(i+1).padStart(2,'0')}</span><span>${esc((T[s.t]||{}).name||s.t)}</span></div></button>`).join('')+`<button class="addslide" id="addSlide">+ Adicionar slide</button>`;
  rail.querySelectorAll('.thumb').forEach(b=>{ const i=+b.dataset.i; thumbCleanup.set(i,D.renderStatic(b.querySelector('.tv'),d,i)); b.onclick=()=>select(i); });
  $('#addSlide').onclick=()=>gallery('add');
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
function liveEdit(){ touch(); clearTimeout(pvT); pvT=setTimeout(()=>{ renderPreview(false); refreshThumb(sel); },260); }
function select(i){
  const d=deck(); if(i<0||i>=d.slides.length) return;
  const dir=i>sel?1:-1; sel=i;
  $('#rail').querySelectorAll('.thumb').forEach(b=>b.classList.toggle('sel',+b.dataset.i===i));
  const b=$('#rail').querySelector(`.thumb[data-i="${i}"]`); if(b) b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  if(player) player.go(i,dir); $('#pvN').textContent=(i+1)+' / '+d.slides.length;
  if(tab==='content') renderPane();
}

/* ---------- inspetor ---------- */
function renderPane(){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  const pane=$('#pane'); pane.innerHTML='';
  if(tab==='theme') return themePane(pane);
  const d=deck(), s=d.slides[sel]; if(!s){ pane.innerHTML='<p class="tip">Nenhum slide ainda.</p>'; return; }
  const tpl=T[s.t]; s.d=s.d||{};
  const h=document.createElement('div'); h.className='tpl-head';
  h.innerHTML=`<div><div class="sec" style="padding:0">Modelo</div><b>${esc(tpl.name)}</b></div><button class="btn sm" id="swapBtn">Trocar modelo</button>`;
  pane.appendChild(h); $('#swapBtn').onclick=()=>gallery('swap');
  tpl.fields.forEach(f=>pane.appendChild(field(f,s.d,`${s.id}-${f.k}`,()=>liveEdit())));
  const tip=document.createElement('p'); tip.className='tip';
  tip.innerHTML='Use <code>*palavra*</code> para destacar com a cor do tema e <code>`SQ01`</code> para um código. Quebra de linha no título vira quebra no slide.';
  pane.appendChild(tip);
}
function field(f,obj,id,onCh){
  const w=document.createElement('div'); w.className='f';
  if(f.t==='bool'){ w.innerHTML=`<label class="chk"><input type="checkbox" id="${id}"${obj[f.k]?' checked':''}> ${esc(f.l)}</label>`; w.querySelector('input').onchange=e=>{obj[f.k]=e.target.checked;onCh();}; return w; }
  w.innerHTML=`<label for="${id}">${esc(f.l)}</label>`;
  if(f.t==='text'){ const i=document.createElement('input'); i.type='text'; i.id=id; i.value=obj[f.k]??''; i.oninput=()=>{obj[f.k]=i.value;onCh();}; w.appendChild(i); }
  else if(f.t==='area'){ const i=document.createElement('textarea'); i.id=id; i.rows=f.k==='title'?2:3; i.value=obj[f.k]??''; i.oninput=()=>{obj[f.k]=i.value;onCh();}; w.appendChild(i); }
  else if(f.t==='list'){ const i=document.createElement('textarea'); i.id=id; i.rows=4; i.value=(obj[f.k]||[]).join('\n'); i.oninput=()=>{obj[f.k]=i.value.split('\n').map(x=>x.trim()).filter(Boolean);onCh();}; w.appendChild(i); const hh=document.createElement('span'); hh.className='hint'; hh.textContent='Um item por linha'; w.appendChild(hh); }
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
  const paint=()=>{ box.innerHTML=''; const list=obj[f.k];
    list.forEach((it,i)=>{ const card=document.createElement('div'); card.className='item';
      card.innerHTML=`<div class="ih"><span>${i+1}</span><span><button class="btn sm ghost" data-m="-1" aria-label="Subir">↑</button><button class="btn sm ghost" data-m="1" aria-label="Descer">↓</button><button class="btn sm ghost danger" data-x aria-label="Remover">✕</button></span></div>`;
      f.sub.forEach(sf=>card.appendChild(field(sf,it,`${id}-${i}-${sf.k}`,onCh)));
      card.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ const j=i+(+b.dataset.m); if(j<0||j>=list.length) return; [list[i],list[j]]=[list[j],list[i]]; paint(); onCh(); });
      card.querySelector('[data-x]').onclick=()=>{ list.splice(i,1); paint(); onCh(); };
      box.appendChild(card); });
    if(list.length<(f.max||6)){ const add=document.createElement('button'); add.className='btn sm'; add.textContent='+ Adicionar'; add.onclick=()=>{ const n={}; f.sub.forEach(sf=>n[sf.k]=sf.t==='bool'?false:''); list.push(n); paint(); onCh(); }; box.appendChild(add); }
  };
  paint(); return box;
}
function themePane(pane){
  const d=deck(); d.theme=d.theme||{preset:'eletrico'}; const th=d.theme, eff=D.themeOf(d);
  const ch=()=>{ touch(); clearTimeout(pvT); pvT=setTimeout(()=>{ renderPreview(false); renderRail(); },300); };
  pane.innerHTML=`<div class="sec">Paleta pronta</div><div class="swatches">${Object.entries(D.PRESETS).map(([k,p])=>`<button class="sw${th.preset===k?' on':''}" data-p="${k}"><span><i style="background:${p.bg}"></i><i style="background:${p.surface}"></i><i style="background:${p.accent}"></i><i style="background:${p.alert}"></i></span>${esc(p.name)}</button>`).join('')}</div>
  <div class="sec">Cores</div><div class="colors">${[['bg','Fundo'],['surface','Painéis'],['accent','Destaque'],['alert','Alerta'],['ok','Positivo'],['bad','Negativo'],['title','Títulos'],['text','Texto'],['muted','Texto suave']].map(([k,l])=>`<label class="col"><input type="color" id="c-${k}" value="${eff[k]||'#000000'}"> ${l}</label>`).join('')}</div>
  <label class="chk"><input type="checkbox" id="t-light"${eff.light?' checked':''}> Tema claro (ajusta brilho e sombras)</label>
  <div class="sec">Tipografia e fundo</div>
  <div class="f"><label for="t-fd">Fonte dos títulos</label><select id="t-fd">${D.FONTS.map(f=>`<option${f===eff.fontDisplay?' selected':''}>${f}</option>`).join('')}</select></div>
  <div class="f"><label for="t-fb">Fonte do texto</label><select id="t-fb">${D.FONTS.map(f=>`<option${f===eff.fontBody?' selected':''}>${f}</option>`).join('')}</select></div>
  <div class="f"><label for="t-bg">Fundo animado</label><select id="t-bg">${Object.entries(D.BACKGROUNDS).map(([k,l])=>`<option value="${k}"${k===eff.background?' selected':''}>${l}</option>`).join('')}</select></div>
  <div class="sec">Marca</div><div class="f"><label>Logo (aparece na capa, rodapé e núcleo)</label><div id="logoBox"></div><span class="hint">PNG ou SVG transparente funciona melhor.</span></div>
  <div class="f"><label for="t-ft">Texto do rodapé</label><input type="text" id="t-ft" value="${esc(d.footerText||'')}" placeholder="${esc(d.name||'')}"></div>
  <label class="chk"><input type="checkbox" id="t-fon"${d.footer===false?'':' checked'}> Mostrar rodapé</label>`;
  pane.querySelectorAll('.sw').forEach(b=>b.onclick=()=>{ d.theme={preset:b.dataset.p,logo:th.logo}; ch(); themePane(pane); });
  pane.querySelectorAll('.colors input').forEach(i=>i.oninput=()=>{ th[i.id.slice(2)]=i.value; ch(); });
  $('#t-light').onchange=e=>{ th.light=e.target.checked; ch(); };
  $('#t-fd').onchange=e=>{ th.fontDisplay=e.target.value; ch(); };
  $('#t-fb').onchange=e=>{ th.fontBody=e.target.value; ch(); };
  $('#t-bg').onchange=e=>{ th.background=e.target.value; ch(); };
  $('#t-ft').oninput=e=>{ d.footerText=e.target.value; ch(); };
  $('#t-fon').onchange=e=>{ d.footer=e.target.checked?undefined:false; if(d.footer===undefined) delete d.footer; ch(); };
  $('#logoBox').appendChild(imageField(th,'logo','t-logo',ch));
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
  const m=modal(`<h3>Apresentações</h3><p class="sub">${mode==='db'?'Salvas na sua conta, disponíveis em qualquer aparelho.':'Salvas só neste navegador.'}</p><div style="display:flex;flex-direction:column;gap:8px"><button class="btn" data-a="new">+ Nova apresentação</button><button class="btn" data-a="dup">Duplicar esta apresentação</button><button class="btn" data-a="bk">Baixar backup de todas (.json)</button><button class="btn" data-a="im">Importar backup (.json)</button><button class="btn danger" data-a="del">Excluir esta apresentação</button></div>`,'confirm');
  m.el.querySelector('[data-a="bk"]').onclick=async()=>{ m.close(); try{ await saveFile('estudio-motion-backup.json',JSON.stringify(decks,null,1),'application/json'); setStatus('Backup baixado',true); }catch(e){ setStatus('Backup cancelado'); } };
  m.el.querySelector('[data-a="im"]').onclick=()=>{ m.close(); const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
    inp.onchange=async()=>{ try{ const data=JSON.parse(await inp.files[0].text()); const add=data&&Array.isArray(data.slides)?{[uid()]:data}:data; let n=0;
      for(const [id,dk] of Object.entries(add||{})){ if(dk&&Array.isArray(dk.slides)){ const nid=decks[id]?uid():id; decks[nid]=dk; curId=nid; n++; if(mode==='db') db.doc('decks/'+nid).set(clone(dk)).catch(()=>setStatus('Uma apresentação importada não coube na nuvem')); } }
      if(!n) throw new Error('vazio'); if(mode!=='db') localSave(); sel=0; renderAll(); setStatus(n===1?'1 apresentação importada':n+' apresentações importadas',true);
    }catch(e){ setStatus('Arquivo de backup inválido'); } };
    inp.click(); };
  m.el.querySelector('[data-a="new"]').onclick=()=>{ m.close(); const id=uid(); decks[id]=starter(); curId=id; sel=0; touch(); renderAll(); };
  m.el.querySelector('[data-a="dup"]').onclick=()=>{ m.close(); const id=uid(); decks[id]=Object.assign(clone(deck()),{name:(deck().name||'Apresentação')+' (cópia)'}); curId=id; sel=0; touch(); renderAll(); };
  m.el.querySelector('[data-a="del"]').onclick=()=>{ m.close(); confirmBox('Excluir “'+(deck().name||'Sem nome')+'”?','Excluir',async()=>{ const id=curId; delete decks[id]; if(mode==='db'){ try{ await db.doc('decks/'+id).delete(); }catch(e){ setStatus('Não consegui excluir'); } } else localSave(); if(!Object.keys(decks).length){ const n=uid(); decks[n]=starter(); } curId=Object.keys(decks)[0]; sel=0; renderAll(); }); };
};

/* ---------- ações ---------- */
$('#deckSel').onchange=e=>{ if(dirty) save(); curId=e.target.value; sel=0; renderAll(); try{ localStorage.setItem(LS+'-cur',curId); }catch(_){} };
$('#deckName').oninput=e=>{ deck().name=e.target.value; touch(); const o=$('#deckSel').selectedOptions[0]; if(o) o.textContent=e.target.value||'Sem nome'; };
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; renderPane(); });
$('#prevBtn').onclick=()=>select(sel-1); $('#nextBtn').onclick=()=>select(sel+1);
$('#replayBtn').onclick=()=>{ if(player) player.replay(); };
$('#upBtn').onclick=()=>move(-1); $('#downBtn').onclick=()=>move(1);
function move(dl){ const s=deck().slides, j=sel+dl; if(j<0||j>=s.length) return; [s[sel],s[j]]=[s[j],s[sel]]; sel=j; touch(); renderRail(); renderPreview(false); }
$('#dupBtn').onclick=()=>{ const s=deck().slides; s.splice(sel+1,0,Object.assign(clone(s[sel]),{id:uid()})); sel++; touch(); renderRail(); renderPreview(true); renderPane(); };
$('#delBtn').onclick=()=>{ const s=deck().slides; if(!s.length) return; confirmBox('Excluir o slide '+(sel+1)+'?','Excluir',()=>{ s.splice(sel,1); sel=Math.max(0,sel-1); touch(); renderRail(); renderPreview(true); renderPane(); }); };
addEventListener('keydown',e=>{ if(document.querySelector('.modal,.show')) return; const tg=e.target.tagName; if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT') return; if(e.key==='ArrowRight') select(sel+1); if(e.key==='ArrowLeft') select(sel-1); });

/* ---------- modo apresentação ---------- */
function present(start){
  const d=deck(); if(!d.slides.length) return;
  const w=document.createElement('div'); w.className='show'; w.innerHTML=`<div class="host"></div><div class="bar"><button data-x aria-label="Sair">✕</button><button data-p aria-label="Anterior">‹</button><div class="pg"><i></i></div><span class="n"></span><button data-n aria-label="Próximo">›</button><button data-f aria-label="Tela cheia">⤢</button></div>`;
  document.body.appendChild(w);
  const upd=n=>{ w.querySelector('.n').textContent=(n+1)+' / '+d.slides.length; w.querySelector('.pg i').style.width=((n+1)/d.slides.length*100)+'%'; };
  const pl=D.createPlayer(w.querySelector('.host'),d,{start:start||0,onChange:upd}); upd(start||0);
  const fs=()=>{ try{ document.fullscreenElement?document.exitFullscreen():w.requestFullscreen().catch(()=>{}); }catch(_){} };
  const close=()=>{ pl.destroy(); w.remove(); removeEventListener('keydown',key); try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_){} if(location.hash.startsWith('#play-')) try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){} };
  const key=e=>{ if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();pl.next();} else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();pl.prev();} else if(e.key==='Escape') close(); else if(e.key==='f'||e.key==='F') fs(); };
  addEventListener('keydown',key);
  w.querySelector('[data-x]').onclick=close; w.querySelector('[data-p]').onclick=()=>pl.prev(); w.querySelector('[data-n]').onclick=()=>pl.next(); w.querySelector('[data-f]').onclick=fs;
  w.querySelector('.host').onclick=e=>{ e.clientX>innerWidth*.3?pl.next():pl.prev(); };
  let sx=null; w.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;},{passive:true}); w.addEventListener('touchend',e=>{ if(sx==null) return; const dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>40) dx<0?pl.next():pl.prev(); sx=null; },{passive:true});
  try{ history.replaceState(null,'','#play-'+curId); }catch(_){}
}
$('#playBtn').onclick=()=>present(sel);

/* ---------- exportar ---------- */
const blobToData=b=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); });
async function inline(v){ if(!v||String(v).startsWith('data:')) return v; try{ const r=await fetch(D.resolveImage(v)); if(!r.ok) return ''; return await blobToData(await r.blob()); }catch(e){ return ''; } }
async function saveFile(filename,data,type){
  if(downloads) return downloads.save({filename,data});
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type})); a.download=filename;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },2000);
}
const srcOf=(id,url)=>{ const el=document.getElementById(id); return el?Promise.resolve(el.textContent):fetch(url).then(r=>r.text()); };
async function exportHTML(){
  setStatus('Preparando arquivo…');
  try{
    const d=clone(deck());
    d.theme=d.theme||{}; if(d.theme.logo) d.theme.logo=await inline(d.theme.logo);
    for(const s of d.slides){ const tp=T[s.t]; if(!tp) continue; for(const f of tp.fields){ if(f.t==='image'&&s.d[f.k]) s.d[f.k]=await inline(s.d[f.k]); } }
    const [js,css]=await Promise.all([srcOf('dk-js','engine.js'),srcOf('dk-css','engine.css')]);
    const gs=document.getElementById('gsap-js');
    const gsapTag=gs?'<script>'+gs.textContent.replace(/<\/script/gi,'<\\/script')+'<\/script>':'<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"><\/script>';
    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.name||'Apresentação')}</title><style>html,body{height:100%;margin:0;background:#000}#app{position:fixed;inset:0}${css}</style>${gsapTag}</head><body><div id="app"></div><script>${js.replace(/<\/script/gi,'<\\/script')}<\/script><script>
const DECK=${JSON.stringify(d).replace(/</g,'\\u003c')};
const pl=Deck.createPlayer(document.getElementById('app'),DECK,{start:0});
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();pl.next();}else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();pl.prev();}else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}});
document.getElementById('app').addEventListener('click',e=>{e.clientX>innerWidth*.3?pl.next():pl.prev();});
let sx=null;addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});addEventListener('touchend',e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40)dx<0?pl.next():pl.prev();sx=null},{passive:true});
<\/script></body></html>`;
    const name=(d.name||'apresentacao').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'apresentacao';
    await saveFile(name+'.html',html,'text/html');
    setStatus('Arquivo exportado',true);
  }catch(e){ setStatus(e&&e.code==='declined'?'Exportação cancelada':'Não consegui exportar'); }
}
$('#exportBtn').onclick=exportHTML;

/* ---------- inicialização ---------- */
(function boot(){
  decks=localLoad();
  if(!Object.keys(decks).length){ if(window.SEED_DECKS) Object.assign(decks,clone(window.SEED_DECKS)); else { const id=uid(); decks[id]=starter(); } }
  let last=null; try{ last=localStorage.getItem(LS+'-cur'); }catch(_){}
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
      const remote={}; qs.docs.forEach(s=>{ if(s.exists){ remote[s.id]=clone(s.data()); } });
      if(first){
        first=false; mode='db';
        const localOnly=decks; decks=remote;
        // leva para a nuvem o que só existia neste navegador e foi editado
        Object.entries(localOnly).forEach(([id,dk])=>{ if(!remote[id] && (dk.slides||[]).length && (localStorage.getItem(LS)||'').includes(id)) { decks[id]=dk; db.doc('decks/'+id).set(clone(dk)).catch(()=>{}); } });
        if(!Object.keys(decks).length){ const id=uid(); decks[id]=starter(); }
        if(!decks[curId]) curId=Object.keys(decks).sort((a,b)=>(decks[b].updatedAt||0)-(decks[a].updatedAt||0))[0];
        if(wantPlay&&decks[wantPlay[1]]) curId=wantPlay[1];
        sel=0; renderAll(); setStatus('Salvo na nuvem',true);
        if(wantPlay&&decks[wantPlay[1]]) present(0);
        return;
      }
      // atualizações vindas de outro aparelho ou do Claude
      let changed=false;
      qs.docChanges().forEach(c=>{ const id=c.doc.id;
        if(c.type==='removed'){ if(id!==curId){ delete decks[id]; changed=true; } return; }
        if(id===curId && (dirty||saving||c.doc.metadata.hasPendingWrites)) return;
        const nd=clone(c.doc.data()); if(id===curId && JSON.stringify(nd)===JSON.stringify(decks[id])) return;
        decks[id]=nd; changed=true; });
      if(changed){ if(!decks[curId]) curId=Object.keys(decks)[0]; renderAll(); }
    },err=>{ setStatus('Nuvem indisponível, editando localmente'); mode='local'; });
  });
})();
})();
