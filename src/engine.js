/* Motor de slides animados. Expõe window.Deck. Usa GSAP quando presente. */
(function(){
"use strict";
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rich=s=>esc(s).replace(/`([^`]+)`/g,'<span class="dk-code">$1</span>').replace(/\*([^*]+)\*/g,'<span class="hl">$1</span>').replace(/\n/g,'<br>');
const arr=v=>Array.isArray(v)?v:[];
let resolveImage=v=>{ if(!v) return ''; v=String(v); if(v.startsWith('asset:')) return '/_blob/'+v.slice(6); return v; };
const im=v=>esc(resolveImage(v));

/* ---------- temas ---------- */
const PRESETS={
  eletrico:{name:'Elétrico',bg:'#060c1d',surface:'#0e1a36',accent:'#3d8bff',alert:'#ffb547',ok:'#3fd6a0',bad:'#c23a4e',text:'#d6e6ff',title:'#ffffff',muted:'#8ea3c9',fontDisplay:'Lexend',fontBody:'Manrope',background:'fibras'},
  ambar:{name:'Âmbar industrial',bg:'#110d09',surface:'#221a12',accent:'#ff9a3c',alert:'#ffd166',ok:'#7bd389',bad:'#e05a47',text:'#f5e9dc',title:'#fff7ee',muted:'#b39c86',fontDisplay:'Archivo',fontBody:'DM Sans',background:'grade'},
  esmeralda:{name:'Esmeralda',bg:'#04130f',surface:'#0b261f',accent:'#2ee6a6',alert:'#f7c948',ok:'#2ee6a6',bad:'#ff6b6b',text:'#dff7ee',title:'#ffffff',muted:'#86b3a5',fontDisplay:'Sora',fontBody:'Plus Jakarta Sans',background:'particulas'},
  vinho:{name:'Vinho premium',bg:'#13060c',surface:'#251019',accent:'#ff5d8a',alert:'#f2b84b',ok:'#6fd3a8',bad:'#ff5d5d',text:'#f6e6ec',title:'#ffffff',muted:'#b88d9c',fontDisplay:'Fraunces',fontBody:'Manrope',background:'fibras'},
  claro:{name:'Claro corporativo',bg:'#eef2f7',surface:'#ffffff',accent:'#2457d6',alert:'#c26a00',ok:'#13865f',bad:'#c2334a',text:'#1d2638',title:'#0b1220',muted:'#5b6577',fontDisplay:'Bricolage Grotesque',fontBody:'Manrope',background:'particulas',light:true,cards:'solido',glow:false},
  editorial:{name:'Editorial',bg:'#f3eee5',surface:'#fffcf6',accent:'#b4441f',alert:'#a8650a',ok:'#3d7a4f',bad:'#a3322b',text:'#2b2621',title:'#15110d',muted:'#6f665b',fontDisplay:'Fraunces',fontBody:'IBM Plex Sans',background:'topografia',light:true,shape:'sharp',cards:'contorno',glow:false,grain:true,weight:500,tracking:-.01},
  grafite:{name:'Grafite',bg:'#0b0b0c',surface:'#161618',accent:'#e4ff5c',alert:'#ffb547',ok:'#7ee0a1',bad:'#ff6b5e',text:'#e6e6e1',title:'#ffffff',muted:'#8c8c86',fontDisplay:'Space Grotesk',fontBody:'Inter',background:'pontos',shape:'sharp',cards:'contorno',glow:false,grain:true,weight:500,tracking:-.035},
  aurora:{name:'Aurora',bg:'#08061a',surface:'#14112e',accent:'#a78bfa',alert:'#f9a8d4',ok:'#5eead4',bad:'#fb7185',text:'#e5e1ff',title:'#ffffff',muted:'#9b95c9',fontDisplay:'Outfit',fontBody:'Manrope',background:'aurora',grain:true,weight:500}
};
/* direção de arte: cantos, painéis, brilho, granulado e peso dos títulos */
const SHAPES={round:'Arredondados',soft:'Suaves',sharp:'Retos'};
const CARDS={vidro:'Vidro',solido:'Sólido',contorno:'Contorno'};
const FONTS=['Lexend','Manrope','Sora','Outfit','Plus Jakarta Sans','DM Sans','Inter','Space Grotesk','Archivo','Bricolage Grotesque','Fraunces','Playfair Display','Space Mono','IBM Plex Sans','Rubik','Montserrat','Poppins'];
const BACKGROUNDS={fibras:'Fibras de dados',grade:'Grade em perspectiva',particulas:'Constelação',aurora:'Aurora',malha:'Malha de cor',topografia:'Topografia',pontos:'Pontos em onda',luz:'Feixes de luz',bokeh:'Bokeh',liso:'Liso com brilho'};
const fontsLoaded=new Set();
function ensureFonts(list, doc=document){
  const need=[...new Set([...list,'JetBrains Mono'])].filter(f=>f&&!fontsLoaded.has(f));
  if(!need.length) return;
  need.forEach(f=>fontsLoaded.add(f));
  const l=doc.createElement('link');l.rel='stylesheet';
  l.href='https://fonts.googleapis.com/css2?'+need.map(f=>'family='+encodeURIComponent(f).replace(/%20/g,'+')+(f==='Fraunces'||f==='Playfair Display'?':wght@400;500;600;700':f==='Space Mono'?':wght@400;700':':wght@300;400;500;600;700')).join('&')+'&display=swap';
  doc.head.appendChild(l);
}
const hex2rgb=h=>{h=(h||'#000').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return [(n>>16)&255,(n>>8)&255,n&255];};
function themeOf(deck){ const t=deck.theme||{}; const p=PRESETS[t.preset]||PRESETS.eletrico; return Object.assign({},p,t); }
function themeVars(t){
  const a=hex2rgb(t.accent), light=!!t.light;
  return `--bg:${t.bg};--surface:${t.surface};--accent:${t.accent};--alert:${t.alert};--ok:${t.ok};--bad:${t.bad};--text:${t.text};--title:${t.title||t.text};--muted:${t.muted};`+
   `--edge:color-mix(in srgb,${t.accent} ${light?22:20}%,transparent);--faint:color-mix(in srgb,${t.muted} 70%,${t.bg});`+
   `--glow:rgba(${a.join(',')},${light?.25:.5});--vig:${light?'rgba(255,255,255,0)':'rgba(3,6,15,.7)'};--shadow:${light?'0 20px 50px rgba(20,30,60,.08)':'none'};`+
   `--f-display:"${t.fontDisplay}",system-ui,sans-serif;--f-body:"${t.fontBody}",system-ui,sans-serif;--f-mono:"JetBrains Mono",ui-monospace,monospace;color-scheme:${light?'light':'dark'};`+
   styleVars(t);
}
function styleVars(t){
  const R={round:[22,16,12,999],soft:[14,10,8,12],sharp:[2,2,2,2]}[t.shape]||[22,16,12,999];
  const glow=t.glow!==false, light=!!t.light;
  const card=t.cards==='solido'?{card:'var(--surface)',panel:'var(--surface)',bw:'1px'}
    :t.cards==='contorno'?{card:'transparent',panel:'transparent',bw:'1.5px',edge:`color-mix(in srgb,${t.text} ${light?26:22}%,transparent)`}
    :{card:'linear-gradient(160deg,color-mix(in srgb,var(--surface) 82%,transparent),color-mix(in srgb,var(--bg) 70%,transparent))',panel:'color-mix(in srgb,var(--surface) 78%,transparent)',bw:'1px'};
  return `--r:${R[0]}px;--r-md:${R[1]}px;--r-sm:${R[2]}px;--r-pill:${R[3]}px;--card:${card.card};--panel:${card.panel};--bw:${card.bw};`+
    (card.edge?`--edge:${card.edge};`:'')+(glow?'--gm:1;':'--gm:0;--glow:transparent;')+
    `--grain:${t.grain?(light?.06:.09):0};--w-title:${+t.weight||600};--trk:${t.tracking!=null?t.tracking:-.02}em`;
}

/* ---------- blocos comuns ---------- */
const head=(d,h='h2')=>`${d.kicker?`<div class="dk-kicker" data-a="left" data-f="kicker">${esc(d.kicker)}</div>`:''}${d.title?`<${h==='h1'?'h1':'h2'} class="dk-${h}" data-a="words" data-f="title">${rich(d.title)}</${h==='h1'?'h1':'h2'}>`:''}${d.lead?`<p class="dk-lead" data-a="up" data-f="lead">${rich(d.lead)}</p>`:''}`;
const cols=n=>`grid-template-columns:repeat(${n},minmax(0,1fr))`;
function parseNum(v){
  const s=String(v??'').trim(); if(!/^[\d.,]+$/.test(s)||!/\d/.test(s)) return null;
  const hasDec=/,\d{1,2}$/.test(s); const n=parseFloat(s.replace(/\./g,'').replace(',','.'));
  return isNaN(n)?null:{n,dec:hasDec?s.split(',')[1].length:0};
}
const countAttr=v=>{const p=parseNum(v);return p?` data-count="${p.n}" data-dec="${p.dec}"`:'';};
const mock=title=>{
  const bars=[52,61,48,70,66,78,72,84,75,90].map((h,i)=>`<rect x="${10+i*40}" y="${200-h*1.9}" width="16" height="${h*1.9}" rx="3" fill="var(--accent)" opacity="${.45+i*.05}"/><rect x="${28+i*40}" y="${200-(h-8+((i*7)%15))*1.9}" width="16" height="${(h-8+((i*7)%15))*1.9}" rx="3" fill="var(--muted)" opacity=".35"/>`).join('');
  return `<div class="mk"><div class="mk-side"><i></i><i class="on"></i><i></i><i></i><i></i></div><div class="mk-main">
  <div class="mk-top"><b>${esc(title||'Painel')}</b><span class="mk-pill">Exportar</span></div>
  <div class="mk-kpis">${['Indicador A','Indicador B','Indicador C','Indicador D'].map(k=>`<div class="mk-kpi"><small>${k}</small><b></b></div>`).join('')}</div>
  <div class="mk-chart"><svg viewBox="0 0 410 210" preserveAspectRatio="none" class="mk-bars">${bars}<line x1="0" y1="200" x2="410" y2="200" stroke="var(--edge)"/></svg>
  <div class="mk-list">${[0,1,2,3,4].map(()=>'<div class="mk-li"><span></span><span></span><span></span></div>').join('')}</div></div>
  </div></div><span class="dk-ill">Tela ilustrativa</span>`;
};

/* ---------- modelos ---------- */

/* ---------- ícones animados (traço que se desenha) ---------- */
const ICONS={
 grafico:['Gráfico','<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/><path d="M16 8h4v4"/>'],
 alvo:['Alvo','<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
 foguete:['Foguete','<path d="M9 15l-3-3c1-4 5-9 14-9 0 9-5 13-9 14z"/><path d="M6 12H3l3-4h4"/><path d="M12 18v3l4-3v-4"/><circle cx="15" cy="9" r="1.5"/>'],
 escudo:['Escudo','<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'],
 pessoas:['Pessoas','<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2.5.6 4 2.6 4 6"/>'],
 relogio:['Relógio','<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
 raio:['Raio','<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'],
 engrenagem:['Engrenagem','<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>'],
 dinheiro:['Dinheiro','<path d="M3 6h18v12H3z"/><circle cx="12" cy="12" r="2.8"/><path d="M6.5 9.5v5M17.5 9.5v5"/>'],
 ideia:['Ideia','<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'],
 check:['Concluído','<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'],
 globo:['Globo','<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>'],
 coracao:['Coração','<path d="M12 20s-8-5-8-11a4 4 0 0 1 8-1.2A4 4 0 0 1 20 9c0 6-8 11-8 11z"/>'],
 cadeado:['Cadeado','<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>'],
 nuvem:['Nuvem','<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 18z"/>'],
 chat:['Conversa','<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'],
 estrela:['Estrela','<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
 caminhao:['Entrega','<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>']
};
const ICON_OPTS=Object.assign({'':'— sem ícone —'},...Object.entries(ICONS).map(([k,v])=>({[k]:v[0]})));
const ico=k=>ICONS[k]?`<svg class="dk-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k][1].replace(/<(path|circle)/g,'<$1 pathLength="1"')}</svg>`:'';
const TEMPLATES={
 capa:{name:'Capa',desc:'Abertura com logo, título, cadeia animada e imagem de destaque',
  fields:[{k:'showLogo',t:'bool',l:'Mostrar logo do tema'},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'chain',t:'text',l:'Cadeia animada (separe por vírgula)'},{k:'chips',t:'list',l:'Etiquetas'},{k:'image',t:'image',l:'Imagem de destaque (PNG transparente)'}],
  sample:{showLogo:true,kicker:'',title:'Nome do projeto\n*em destaque*',lead:'Uma frase que resume o propósito da apresentação.',chain:'Dados, Análise, Decisão',chips:['Em produção desde 2026','Equipe','Área'],image:''},
  render(d,t){
    const ch=String(d.chain||'').split(',').map(s=>s.trim()).filter(Boolean);
    let chain='';
    if(ch.length>1){ const n=ch.length, X=i=>20+i*(860/(n-1));
      chain=`<svg class="dk-chain" viewBox="0 0 900 90" data-a="chain" aria-hidden="true"><path class="ch-line" d="M20 45 H880" stroke="${t.accent}" stroke-width="3" fill="none" stroke-dasharray="860"/>${ch.map((c,i)=>`<g class="ch-n"><circle cx="${X(i)}" cy="45" r="${i===n-1?14:11}" fill="${i===n-1?t.accent:t.bg}" stroke="${t.accent}" stroke-width="3"/><text x="${X(i)+(i===n-1?-18:i?-30:-14)}" y="22" text-anchor="${i===n-1?'end':i?'middle':'start'}">${esc(c.toUpperCase())}</text></g>`).join('')}<circle class="ch-p" cx="20" cy="45" r="6" fill="${t.light?t.accent:'#fff'}"/></svg>`; }
    return `<div class="dk-l" style="${d.image?'':'max-width:1500px'}">${d.showLogo&&t.logo?`<img class="dk-logo" src="${im(t.logo)}" alt="" data-a="logo">`:''}${head(d,'h1')}${chain}${arr(d.chips).length?`<div class="dk-chips" data-a="stagger">${arr(d.chips).map(c=>`<span class="dk-chip">${esc(c)}</span>`).join('')}</div>`:''}</div>${d.image?`<img class="dk-hero" src="${im(d.image)}" alt="" data-a="hero" data-float>`:''}`;
  }},
 destaque:{name:'Destaque',desc:'Uma mensagem grande, para abrir seção ou marcar uma ideia',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Mensagem'},{k:'lead',t:'area',l:'Texto de apoio'},{k:'image',t:'image',l:'Imagem lateral (opcional)'}],
  sample:{kicker:'Seção 2',title:'Uma ideia\n*que fica*',lead:'Texto curto que sustenta a mensagem principal.',image:''},
  render(d){ return `<div class="dk-l" style="${d.image?'':'max-width:1500px'}">${head(d,'h1')}</div>${d.image?`<img class="dk-side" src="${im(d.image)}" alt="" data-a="hero" data-float>`:''}`; }},
 cartoes:{name:'Cartões',desc:'De 2 a 4 blocos lado a lado, entrando em sequência',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'numbered',t:'bool',l:'Numerar cartões'},{k:'cards',t:'items',l:'Cartões',max:4,sub:[{k:'icon',t:'select',l:'Ícone animado',opts:ICON_OPTS},{k:'label',t:'text',l:'Rótulo'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'}]}],
  sample:{kicker:'O desafio',title:'Três frentes para *organizar*',lead:'',numbered:false,cards:[{label:'Custos',title:'Valores claros',text:'Identificar o que precisa de análise.'},{label:'Materiais',title:'Sem duplicidade',text:'Enxergar faltas e repetições.'},{label:'Acompanhamento',title:'Visão comum',text:'Todas as áreas no mesmo painel.'}]},
  render(d){ const c=arr(d.cards).slice(0,4); return `${head(d)}<div class="dk-grid" style="${cols(Math.max(1,c.length))}" data-a="cards">${c.map((x,i)=>`<div class="dk-card">${ico(x.icon)}${d.numbered?`<span class="dk-num">${String(i+1).padStart(2,'0')}</span>`:''}${x.label?`<span class="dk-ix" data-f="cards.${i}.label">${esc(x.label)}</span>`:''}<h3 data-f="cards.${i}.title">${rich(x.title)}</h3><p data-f="cards.${i}.text">${rich(x.text)}</p></div>`).join('')}</div>`; }},
 fluxo:{name:'Fluxo',desc:'Etapas conectadas por setas que se desenham, com nota de alerta opcional',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'steps',t:'items',l:'Etapas',max:5,sub:[{k:'icon',t:'select',l:'Ícone animado',opts:ICON_OPTS},{k:'tag',t:'text',l:'Rótulo'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'},{k:'hot',t:'bool',l:'Destacar etapa'}]},{k:'noteTitle',t:'text',l:'Nota: destaque'},{k:'note',t:'area',l:'Nota: texto'}],
  sample:{kicker:'Papéis',title:'Como a informação *percorre*',steps:[{tag:'Origem',title:'Sistema A',text:'Fonte oficial dos dados.'},{tag:'Governança',title:'Nosso sistema',text:'Importa e analisa.',hot:true},{tag:'Gestão',title:'Decisão',text:'Apoio com contexto.'},{tag:'Histórico',title:'Registro',text:'Tudo rastreável.'}],noteTitle:'Atenção:',note:'decisões aqui não alteram o sistema de origem.'},
  render(d){ const s=arr(d.steps).slice(0,5); const tpl=s.map((_,i)=>i?'70px minmax(0,1fr)':'minmax(0,1fr)').join(' ');
    return `${head(d)}<div class="dk-flow" style="grid-template-columns:${tpl}">${s.map((x,i)=>`${i?'<div class="dk-arrow" data-a="arrow"></div>':''}<div class="dk-node${x.hot?' hot':''}" data-a="node">${ico(x.icon)}${x.tag?`<span class="tag" data-f="steps.${i}.tag">${esc(x.tag)}</span>`:''}<b data-f="steps.${i}.title">${rich(x.title)}</b><p data-f="steps.${i}.text">${rich(x.text)}</p></div>`).join('')}</div>${d.note?`<div class="dk-note" data-a="up"><svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="var(--alert)" stroke-width="3" style="flex:none"><path d="M27 5l24 42H3z"/><path d="M27 21v12M27 39v2"/></svg><p>${d.noteTitle?`<strong>${esc(d.noteTitle)}</strong> `:''}${rich(d.note)}</p></div>`:''}`; }},
 convergencia:{name:'Convergência',desc:'Fontes que fluem para um núcleo central com pulsos animados',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'sources',t:'items',l:'Fontes',max:4,sub:[{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'}]},{k:'core',t:'text',l:'Texto do núcleo (vazio = logo)'},{k:'checksTitle',t:'text',l:'Título da lista'},{k:'checks',t:'list',l:'Itens verificados'},{k:'statValue',t:'text',l:'Número'},{k:'statLabel',t:'text',l:'Legenda do número'}],
  sample:{kicker:'Fontes de dados',title:'Tudo em *uma visão comum*',sources:[{title:'Reservas',text:'Extração diária do `SAP`'},{title:'Estoque',text:'Saldo e dados de materiais'},{title:'Orçamento',text:'Budget por área e mês'}],core:'',checksTitle:'Qualidade da carga',checks:['Validação antes da gravação','Detecção de duplicidades'],statValue:'30',statLabel:'mil linhas por dia'},
  render(d,t){ const s=arr(d.sources).slice(0,4), n=Math.max(1,s.length);
    const paths=s.map((_,i)=>{const y=620*(i+.5)/n;return `<path class="feed" d="M0 ${y} C 200 ${y}, 220 310, 320 310" stroke="${t.accent}" stroke-opacity=".5" stroke-width="2.5" fill="none"/>`;}).join('')+`<path class="feed out" d="M320 310 C 420 310, 460 310, 640 310" stroke="${t.ok}" stroke-opacity=".6" stroke-width="2.5" fill="none"/>`;
    const core=d.core?esc(d.core):(t.logo?`<img src="${im(t.logo)}" alt="">`:'Núcleo');
    return `${head(d)}<div class="dk-conv"><div class="dk-src" data-a="fromleft">${s.map(x=>`<div class="dk-card"><h3>${rich(x.title)}</h3><p>${rich(x.text)}</p></div>`).join('')}</div>
    <div class="dk-hub" data-a="hub"><svg viewBox="0 0 640 620" preserveAspectRatio="none" aria-hidden="true">${paths}</svg><div class="dk-ring r1" style="width:340px;height:340px;margin:-170px 0 0 -170px"></div><div class="dk-ring r2" style="width:440px;height:440px;margin:-220px 0 0 -220px;border-style:dashed;opacity:.5"></div><div class="dk-core">${core}</div></div>
    <div data-a="fromright"><div class="dk-card">${d.checksTitle?`<span class="dk-ix">${esc(d.checksTitle)}</span>`:''}${arr(d.checks).map(c=>`<div class="dk-check"><i></i>${rich(c)}</div>`).join('')}${d.statValue?`<div style="margin-top:30px;padding-top:24px;border-top:1px solid var(--edge)"><div class="dk-big"><b${countAttr(d.statValue)}>${esc(d.statValue)}</b></div><p style="font-size:21px;margin:8px 0 0">${esc(d.statLabel)}</p></div>`:''}</div></div></div>`; }},
 tela:{name:'Tela do sistema',desc:'Tópicos à esquerda e uma tela (captura ou simulada) entrando em 3D',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'items',t:'items',l:'Tópicos',max:5,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'text',t:'area',l:'Texto'}]},{k:'screen',t:'image',l:'Captura de tela (vazio = tela simulada)'},{k:'mockTitle',t:'text',l:'Título da tela simulada'},{k:'peek',t:'image',l:'Imagem espiando (opcional)'}],
  sample:{kicker:'Visão gerencial',title:'Painéis com *vários recortes*',items:[{label:'Painéis',text:'Por área, equipamento e centro de custo'},{label:'Custos',text:'Orçado contra realizado por mês'},{label:'Saídas',text:'PDF, Excel e CSV'}],screen:'',mockTitle:'Painel de custos',peek:''},
  render(d){ return `${head(d)}<div class="dk-tela"><div class="dk-rows" data-a="stagger">${arr(d.items).map(x=>`<div class="dk-row"><small>${esc(x.label)}</small><span>${rich(x.text)}</span></div>`).join('')}</div><div class="dk-shot-wrap"><div class="dk-screen" data-a="screen">${d.screen?`<img src="${im(d.screen)}" alt="Tela do sistema">`:mock(d.mockTitle)}</div>${d.peek?`<img class="dk-peek" src="${im(d.peek)}" alt="" data-a="peek">`:''}</div></div>`; }},
 numeros:{name:'Números',desc:'De 1 a 4 indicadores com contagem animada',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'stats',t:'items',l:'Indicadores',max:4,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'prefix',t:'text',l:'Prefixo (ex.: R$)'},{k:'value',t:'text',l:'Valor (ex.: 3.116.719,02)'},{k:'suffix',t:'text',l:'Sufixo (ex.: mil, %)'},{k:'text',t:'area',l:'Descrição'},{k:'badge',t:'text',l:'Selo (ex.: dado de 2023)'}]}],
  sample:{kicker:'Resultados',title:'O que *já mudou*',stats:[{label:'Economia',prefix:'R$',value:'1.250.000',suffix:'',text:'Valor evitado no período.',badge:''},{label:'Decisões',prefix:'',value:'832',suffix:'',text:'Reservas analisadas em três meses.',badge:'Recorte histórico'}]},
  render(d){ const s=arr(d.stats).slice(0,4), n=Math.max(1,s.length); const c=n===4?2:n; const fs=n===1?150:n===2?110:n===3?84:96;
    return `${head(d)}<div class="dk-stats" style="${cols(c)}" data-a="cards">${s.map((x,i)=>`<div class="dk-card dk-stat"><small data-f="stats.${i}.label">${esc(x.label)}</small><div class="v" style="font-size:${fs}px">${x.prefix?`<span>${esc(x.prefix)}</span>`:''}<b${countAttr(x.value)}>${esc(x.value)}</b>${x.suffix?`<span class="suf">${esc(x.suffix)}</span>`:''}</div><p data-f="stats.${i}.text">${rich(x.text)}</p>${x.badge?`<span class="dk-badge">${esc(x.badge)}</span>`:''}</div>`).join('')}</div>`; }},
 agenda:{name:'Linha do tempo',desc:'Marcos ou rotinas numa linha que se desenha',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'events',t:'items',l:'Marcos',max:5,sub:[{k:'when',t:'text',l:'Quando'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'}]}],
  sample:{kicker:'Rotina',title:'A informação chega a *quem acompanha*',events:[{when:'Diariamente',title:'Gerência',text:'Resumo do dia anterior.'},{when:'Toda segunda',title:'Aprovadores',text:'Itens dentro da alçada.'},{when:'Toda quarta',title:'Alto impacto',text:'Reunião de análise.'},{when:'Início do mês',title:'Pendências',text:'Itens parados há meses.'}]},
  render(d,t){ const e=arr(d.events).slice(0,5); const cs=[t.accent,t.ok,t.alert,t.bad,t.accent];
    return `${head(d)}<div class="dk-tl" data-a="timeline"><div class="dk-tl-line"></div><div class="dk-tl-cols" style="${cols(Math.max(1,e.length))}">${e.map((x,i)=>`<div class="dk-ev" style="--c:${cs[i]}"><small data-f="events.${i}.when">${esc(x.when)}</small><b data-f="events.${i}.title">${rich(x.title)}</b><p data-f="events.${i}.text">${rich(x.text)}</p></div>`).join('')}</div></div>`; }},
 imagem:{name:'Imagem',desc:'Texto à esquerda e uma imagem grande em moldura',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Texto'},{k:'bullets',t:'list',l:'Tópicos'},{k:'image',t:'image',l:'Imagem'}],
  sample:{kicker:'Na prática',title:'Como fica *no dia a dia*',lead:'Uma imagem vale pelo slide inteiro.',bullets:['Primeiro ponto','Segundo ponto'],image:''},
  render(d){ return `<div class="dk-im"><div>${head(d)}${arr(d.bullets).length?`<div class="dk-bens" style="grid-template-columns:1fr" data-a="stagger">${arr(d.bullets).map(b=>`<div class="dk-ben"><i></i>${rich(b)}</div>`).join('')}</div>`:''}</div><div class="dk-frame" data-a="screen">${d.image?`<img src="${im(d.image)}" alt="">`:'<div class="dk-ph">Sua imagem aqui</div>'}</div></div>`; }},
 encerramento:{name:'Encerramento',desc:'Benefícios, próximos passos e mensagem final com imagem',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'bullets',t:'list',l:'Benefícios'},{k:'nextTitle',t:'text',l:'Próximos passos: título'},{k:'next',t:'list',l:'Próximos passos'},{k:'closing',t:'area',l:'Mensagem final'},{k:'showLogo',t:'bool',l:'Mostrar logo do tema'},{k:'image',t:'image',l:'Imagem (PNG transparente)'}],
  sample:{kicker:'Próximos passos',title:'Uma base clara para *decidir melhor*',bullets:['Mais visibilidade','Decisões justificadas','Rastreabilidade','Menos excessos'],nextTitle:'',next:[],closing:'Mensagem final que resume a apresentação.',showLogo:true,image:''},
  render(d,t){ return `<div class="dk-l">${head(d)}${arr(d.bullets).length?`<div class="dk-bens" data-a="stagger">${arr(d.bullets).map((b,i)=>`<div class="dk-ben" data-f="bullets.${i}"><i></i>${rich(b)}</div>`).join('')}</div>`:''}${arr(d.next).length?`<div data-a="up" style="margin-top:30px"><span class="dk-ix" style="color:var(--alert)">${esc(d.nextTitle||'Próximos passos')}</span><div class="dk-bens" style="margin-top:0">${arr(d.next).map(b=>`<div class="dk-ben" style="font-size:21px;padding:14px 20px"><i style="background:var(--alert);box-shadow:0 0 12px var(--alert)"></i>${rich(b)}</div>`).join('')}</div></div>`:''}${d.closing?`<p class="dk-closing" data-a="up" data-f="closing">${rich(d.closing)}</p>`:''}</div>${d.showLogo&&t.logo?`<img class="dk-endlogo" src="${im(t.logo)}" alt="" data-a="logo">`:''}${d.image?`<img class="dk-hero" src="${im(d.image)}" alt="" data-a="hero" data-float>`:''}`; }}
};

/* ---------- modelos novos ---------- */
Object.assign(TEMPLATES,{
 comparacao:{name:'Comparação',desc:'Antes e depois (ou opção A × B) em duas colunas',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'leftTitle',t:'text',l:'Coluna 1: título'},{k:'left',t:'list',l:'Coluna 1: itens'},{k:'rightTitle',t:'text',l:'Coluna 2: título'},{k:'right',t:'list',l:'Coluna 2: itens'}],
  sample:{kicker:'Antes e depois',title:'O que *muda* na rotina',leftTitle:'Hoje',left:['Planilhas soltas','Decisão sem histórico','Retrabalho mensal'],rightTitle:'Com o sistema',right:['Uma base única','Cada decisão justificada','Alertas automáticos']},
  render(d){ const col=(ti,it,cls,k)=>`<div class="dk-card dk-cmp-col ${cls}"><span class="dk-ix" data-f="${k}Title">${esc(ti)}</span>${arr(it).map((x,i)=>`<div class="dk-cmp-i" data-f="${k}.${i}"><i></i>${rich(x)}</div>`).join('')}</div>`;
    return `${head(d)}<div class="dk-cmp" data-a="cards">${col(d.leftTitle,d.left,'a','left')}${col(d.rightTitle,d.right,'b','right')}</div>`; }},
 grafico:{name:'Gráfico',desc:'Barras que crescem com os valores informados',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'unit',t:'text',l:'Unidade (ex.: R$ mil, %)'},{k:'bars',t:'items',l:'Barras',max:8,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Valor'},{k:'hot',t:'bool',l:'Destacar barra'}]}],
  sample:{kicker:'Evolução',title:'Custo evitado *por trimestre*',lead:'',unit:'R$ mil',bars:[{label:'T1',value:'120'},{label:'T2',value:'210'},{label:'T3',value:'260'},{label:'T4',value:'410',hot:true}]},
  render(d){ const b=arr(d.bars).slice(0,8); const vals=b.map(x=>(parseNum(x.value)||{n:0}).n); const mx=Math.max(1,...vals);
    return `${head(d)}<div class="dk-chart" data-a="bars" style="${cols(Math.max(1,b.length))}">${b.map((x,i)=>`<div class="dk-bar${x.hot?' hot':''}"><div class="dk-bar-v"><b${countAttr(x.value)}>${esc(x.value)}</b>${d.unit?`<small>${esc(d.unit)}</small>`:''}</div><div class="dk-bar-c"><i style="height:${Math.max(2,vals[i]/mx*100)}%"></i></div><span>${esc(x.label)}</span></div>`).join('')}</div>`; }},
 citacao:{name:'Citação',desc:'Uma frase marcante com autor e foto',
  fields:[{k:'quote',t:'area',l:'Citação'},{k:'author',t:'text',l:'Autor'},{k:'role',t:'text',l:'Cargo ou contexto'},{k:'image',t:'image',l:'Foto do autor (opcional)'}],
  sample:{quote:'Pela primeira vez, a gente *decide olhando o mesmo número*.',author:'Nome da pessoa',role:'Gerente de área',image:''},
  render(d){ return `<div class="dk-quote"><div class="dk-qmark" data-a="logo">“</div><blockquote class="dk-h1" data-a="words" data-f="quote">${rich(d.quote)}</blockquote><div class="dk-qby" data-a="up">${d.image?`<img src="${im(d.image)}" alt="">`:''}<div><b data-f="author">${esc(d.author)}</b><small data-f="role">${esc(d.role)}</small></div></div></div>`; }},
 equipe:{name:'Equipe',desc:'De 1 a 6 pessoas com foto, nome e papel',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'people',t:'items',l:'Pessoas',max:6,sub:[{k:'name',t:'text',l:'Nome'},{k:'role',t:'text',l:'Papel'},{k:'photo',t:'image',l:'Foto'}]}],
  sample:{kicker:'Quem faz',title:'A *equipe* por trás',people:[{name:'Pessoa 1',role:'Coordenação',photo:''},{name:'Pessoa 2',role:'Dados',photo:''},{name:'Pessoa 3',role:'Desenvolvimento',photo:''}]},
  render(d){ const p=arr(d.people).slice(0,6);
    return `${head(d)}<div class="dk-team" style="${cols(Math.min(p.length||1,p.length>4?3:4))}" data-a="cards">${p.map(x=>`<div class="dk-card dk-person">${x.photo?`<img src="${im(x.photo)}" alt="">`:`<span class="dk-av">${esc(String(x.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase())}</span>`}<h3>${esc(x.name)}</h3><p>${esc(x.role)}</p></div>`).join('')}</div>`; }},
 tabela:{name:'Tabela',desc:'Tabela simples com linhas entrando em sequência',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'header',t:'text',l:'Cabeçalho (separe colunas com | )'},{k:'rows',t:'list',l:'Linhas (uma por linha, colunas com | )'},{k:'hotRow',t:'text',l:'Destacar linha nº (opcional)'}],
  sample:{kicker:'Comparativo',title:'Indicadores *por área*',header:'Área | Reservas | Economia',rows:['Funilaria | 312 | R$ 410 mil','Pintura | 208 | R$ 260 mil','Montagem | 145 | R$ 180 mil'],hotRow:'1'},
  render(d){ const sp=s=>String(s||'').split('|').map(x=>x.trim()); const h=sp(d.header).filter(Boolean); const hot=parseInt(d.hotRow,10);
    return `${head(d)}<table class="dk-table">${h.length?`<thead><tr>${h.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>`:''}<tbody data-a="stagger">${arr(d.rows).map((r,i)=>`<tr${i+1===hot?' class="hot"':''}>${sp(r).map(c=>`<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }},
 video:{name:'Vídeo',desc:'Vídeo em tela cheia (em loop, sem som) com título por cima',
  fields:[{k:'src',t:'text',l:'Endereço do vídeo (.mp4 ou .webm)'},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Texto de apoio'},{k:'dim',t:'bool',l:'Escurecer o vídeo para o texto aparecer'}],
  sample:{src:'',kicker:'Na prática',title:'Veja *funcionando*',lead:'',dim:true},
  render(d){ return `${d.src?`<video class="dk-video${d.dim?' dim':''}" src="${esc(d.src)}" muted loop playsinline preload="metadata"></video>`:'<div class="dk-video dk-ph">Informe o endereço do vídeo</div>'}<div class="dk-l dk-vtxt">${head(d,'h1')}</div>`; }}
});

/* ---------- modelos cinematográficos (3D) ---------- */
const phx=(i,label)=>`<div class="dk-phx" style="--h:${i*55}deg"><span>${esc(label)}</span></div>`;
const media=(src,i,label)=>src?`<img src="${im(src)}" alt="">`:phx(i,label);
Object.assign(TEMPLATES,{
 mergulho:{name:'Mergulho 3D',desc:'A câmera atravessa imagens em profundidade, uma atrás da outra, até a mensagem final',
  fields:[{k:'layers',t:'items',l:'Camadas (da frente para o fundo)',max:5,sub:[{k:'image',t:'image',l:'Imagem'},{k:'caption',t:'text',l:'Legenda'}]},{k:'kicker',t:'text',l:'Rótulo final'},{k:'title',t:'area',l:'Mensagem final'},{k:'lead',t:'area',l:'Texto de apoio'}],
  sample:{layers:[{image:'',caption:'Onde começamos'},{image:'',caption:'O que construímos'},{image:'',caption:'Para onde vamos'}],kicker:'A jornada',title:'Cada camada\n*nos trouxe até aqui*',lead:''},
  render(d){ const L=arr(d.layers).slice(0,5);
    return `<div class="dk-dive" data-a="dive">${L.map((x,i)=>`<div class="dk-dl" style="--i:${i}">${media(x.image,i,'Camada '+(i+1))}${x.caption?`<div class="cap">${esc(x.caption)}</div>`:''}</div>`).join('')}</div>${d.title||d.kicker?`<div class="dk-dive-end">${head(d,'h1')}</div>`:''}`; }},
 galeria3d:{name:'Galeria 3D',desc:'Imagens num carrossel girando em perspectiva',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'images',t:'items',l:'Imagens',max:8,sub:[{k:'image',t:'image',l:'Imagem'},{k:'caption',t:'text',l:'Legenda'}]}],
  sample:{kicker:'Portfólio',title:'O que já *entregamos*',lead:'',images:[{caption:'Projeto 1'},{caption:'Projeto 2'},{caption:'Projeto 3'},{caption:'Projeto 4'},{caption:'Projeto 5'},{caption:'Projeto 6'}].map(x=>Object.assign({image:''},x))},
  render(d){ const I=arr(d.images).slice(0,8), n=Math.max(3,I.length), W=440, R=Math.round(W/2/Math.tan(Math.PI/n))+60;
    return `${head(d)}<div class="dk-g3" data-a="ring"><div class="dk-g3-tilt"><div class="dk-ring3d">${[...Array(n)].map((_,i)=>{ const x=I[i]||{}; return `<figure style="transform:rotateY(${(i*360/n).toFixed(2)}deg) translateZ(${R}px)">${media(x.image,i,'Imagem '+(i+1))}${x.caption?`<figcaption>${esc(x.caption)}</figcaption>`:''}</figure>`; }).join('')}</div></div></div>`; }},
 revelar:{name:'Revelar',desc:'Imagem em tela cheia surgindo por uma máscara (círculo ou cortina) com zoom',
  fields:[{k:'image',t:'image',l:'Imagem'},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Texto de apoio'},{k:'curtain',t:'bool',l:'Abrir como cortina (em vez de círculo)'},{k:'dim',t:'bool',l:'Escurecer o lado do texto'}],
  sample:{image:'',kicker:'Lançamento',title:'Apresentamos\n*a nova fase*',lead:'',curtain:false,dim:true},
  render(d){ return `<div class="dk-rv${d.curtain?' cur':''}${d.dim?' dim':''}" data-a="reveal">${media(d.image,0,'Sua imagem aqui')}</div><div class="dk-l dk-rv-txt">${head(d,'h1')}</div>`; }},
 paralaxe:{name:'Paralaxe',desc:'Fundo, título e figura recortada em profundidades diferentes (título passa atrás da figura)',
  fields:[{k:'bg',t:'image',l:'Imagem de fundo'},{k:'subject',t:'image',l:'Figura na frente (PNG transparente)'},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título grande'},{k:'lead',t:'area',l:'Texto de apoio'}],
  sample:{bg:'',subject:'',kicker:'Edição 2026',title:'FUTURO',lead:''},
  render(d){ return `<div class="dk-px" data-a="parallax"><div class="px-bg">${media(d.bg,1,'Fundo')}</div><div class="px-tx">${d.kicker?`<div class="dk-kicker">${esc(d.kicker)}</div>`:''}<h1 class="dk-h1 px-title">${rich(d.title)}</h1></div>${d.subject?`<img class="px-fg" src="${im(d.subject)}" alt="">`:''}${d.lead?`<p class="dk-lead px-lead">${rich(d.lead)}</p>`:''}</div>`; }}
});
/* animações desses modelos: devolvem quanto tempo empurrar o resto */
const FX={
  dive(el,tl,at){
    const L=[...el.querySelectorAll('.dk-dl')], n=L.length, DZ=1400, caps=L.map(l=>l.querySelector('.cap')), end=el.parentNode.querySelector('.dk-dive-end');
    const o={z:-600};
    const apply=()=>L.forEach((l,i)=>{ const rel=o.z-i*DZ; const op=rel<=0?1:Math.max(0,1-rel/650);
      l.style.opacity=op; l.style.visibility=op<=.01?'hidden':''; l.style.transform=`translate3d(-50%,-50%,${rel}px)`;
      l.style.filter=rel<-150?`brightness(${Math.max(.4,1+rel/2800).toFixed(3)})`:'none'; });
    apply(); caps.forEach(c=>c&&tl.set(c,{opacity:0},0)); if(end) tl.set(end,{opacity:0},0);
    tl.to(o,{z:0,duration:1.5,ease:'power3.out',onUpdate:apply},at);
    let t=at+1;
    L.forEach((l,i)=>{ if(caps[i]) tl.fromTo(caps[i],{opacity:0,y:30},{opacity:1,y:0,duration:.7,ease:'power2.out'},t); t+=1.7;
      if(i<n-1){ if(caps[i]) tl.to(caps[i],{opacity:0,duration:.3},t-.2); tl.to(o,{z:(i+1)*DZ,duration:1.9,ease:'power2.inOut',onUpdate:apply},t); t+=1.9; } });
    if(end){ if(caps[n-1]) tl.to(caps[n-1],{opacity:0,duration:.4},t-.6); tl.fromTo(end,{opacity:0},{opacity:1,duration:1.1,ease:'power2.out'},t-.5); }
    return 0;
  },
  ring(el,tl,at,keep,G){ const r=el.querySelector('.dk-ring3d'); if(!r) return 0;
    tl.from(r,{rotationY:-150,z:-1600,duration:2.4,ease:'power3.out'},at);
    tl.from(r.children,{opacity:0,stagger:.07,duration:1,ease:'power2.out'},at);
    keep.push(G.to(r,{rotationY:'+=360',duration:40,repeat:-1,ease:'none',delay:2.4})); return .3; },
  reveal(el,tl,at){ const cur=el.classList.contains('cur'), img=el.firstElementChild;
    tl.fromTo(el,{clipPath:cur?'inset(0% 50% 0% 50%)':'circle(0% at 50% 50%)'},{clipPath:cur?'inset(0% 0% 0% 0%)':'circle(85% at 50% 50%)',duration:1.9,ease:'expo.inOut'},at);
    if(img) tl.fromTo(img,{scale:1.4},{scale:1,duration:2.8,ease:'power3.out'},at);
    return 1.1; },
  parallax(el,tl,at,keep,G){ const bg=el.querySelector('.px-bg'), tx=el.querySelector('.px-tx'), fg=el.querySelector('.px-fg');
    if(bg) tl.fromTo(bg,{scale:1.35,filter:'blur(14px)'},{scale:1.06,filter:'blur(0px)',duration:2.6,ease:'power3.out'},at);
    if(tx) tl.fromTo(tx,{y:140,opacity:0,scale:.9},{y:0,opacity:1,scale:1,duration:1.9,ease:'expo.out'},at+.3);
    if(fg) tl.fromTo(fg,{y:220,scale:1.25,opacity:0},{y:0,scale:1,opacity:1,duration:2.1,ease:'expo.out'},at+.5);
    [[bg,10],[tx,22],[fg,42]].forEach(([e,a])=>{ if(e) keep.push(G.to(e,{x:a,y:-a*.35,duration:7,yoyo:true,repeat:-1,ease:'sine.inOut',delay:2.8})); });
    return .9; }
};

/* campos que faltam no slide ganham valor vazio (não texto de exemplo) */
function emptyOf(f){ return f.t==='bool'?false:(f.t==='list'||f.t==='items')?[]:''; }
function fillDefaults(s){ const T=TEMPLATES[s&&s.t]; if(!T) return s; s.d=s.d||{}; T.fields.forEach(f=>{ if(s.d[f.k]===undefined) s.d[f.k]=emptyOf(f); }); return s; }

/* ---------- OnePage: resumo condensado com links para slides ocultos ---------- */
TEMPLATES.onepage={name:'OnePage',desc:'Resumo condensado em uma tela, com blocos que abrem slides ocultos de detalhe',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'blocks',t:'items',l:'Blocos',max:6,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Número de destaque (opcional)'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'},{k:'link',t:'slide',l:'Abre o slide'}]},{k:'footnote',t:'text',l:'Nota de rodapé'}],
  sample:{kicker:'Visão geral',title:'Tudo o que importa *em uma tela*',lead:'',footnote:'Clique num bloco para ver o detalhe.',blocks:[
    {label:'Contexto',value:'',title:'Por que agora',text:'O cenário que torna o projeto urgente.',link:''},
    {label:'Problema',value:'30%',title:'Tempo perdido',text:'Informação espalhada em planilhas e sistemas.',link:''},
    {label:'Solução',value:'',title:'Uma base única',text:'Dados integrados, com histórico e alertas.',link:''},
    {label:'Resultados',value:'1.250.000',title:'Economia em reais',text:'Valor evitado nos primeiros meses.',link:''},
    {label:'Próximos passos',value:'',title:'Expandir',text:'Levar para as demais áreas até dezembro.',link:''},
    {label:'Equipe',value:'6',title:'Pessoas envolvidas',text:'Dados, desenvolvimento e operação.',link:''}]},
  render(d){ const b=arr(d.blocks).slice(0,6), n=Math.max(1,b.length);
    return `${head(d)}<div class="dk-op" style="${cols(n<=3?n:n===4?2:3)}" data-a="cards">${b.map((x,i)=>`<div class="dk-card dk-opb${x.link?' go':''}"${x.link?` data-go="${esc(x.link)}" role="button" tabindex="0"`:''}>${x.label?`<span class="dk-ix" data-f="blocks.${i}.label">${esc(x.label)}</span>`:''}${x.value?`<div class="dk-op-v"><b${countAttr(x.value)}>${esc(x.value)}</b></div>`:''}<h3 data-f="blocks.${i}.title">${rich(x.title)}</h3><p data-f="blocks.${i}.text">${rich(x.text)}</p>${x.link?'<span class="dk-op-go">Ver detalhes <i>→</i></span>':''}</div>`).join('')}</div>${d.footnote?`<p class="dk-op-note" data-a="up" data-f="footnote">${rich(d.footnote)}</p>`:''}`; }};

/* ---------- gráficos e painéis ---------- */
const PALC=['var(--accent)','var(--ok)','var(--alert)','var(--bad)','color-mix(in srgb,var(--accent) 45%,var(--title))','color-mix(in srgb,var(--ok) 50%,var(--accent))','color-mix(in srgb,var(--alert) 55%,var(--bad))','var(--muted)'];
const num=v=>(parseNum(String(v||'').replace(/[^\d.,]/g,''))||{n:0}).n;
const fmtPct=p=>(Math.round(p*10)/10).toLocaleString('pt-BR')+'%';
function donutSVG(items,o={}){
  const vals=items.map(x=>num(x.value)), tot=vals.reduce((s,v)=>s+v,0)||1, full=!!o.full;
  const r=full?100:150, sw=full?200:o.thin?34:56, C=2*Math.PI*r, gap=items.length>1&&!full?6:0; let acc=0;
  const segs=items.map((x,i)=>{ const len=Math.max(0,vals[i]/tot*C-gap); const s=`<circle class="seg" cx="200" cy="200" r="${r}" fill="none" stroke-width="${sw}" style="stroke:${PALC[i%PALC.length]}" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" data-len="${len.toFixed(2)}" data-c="${C.toFixed(2)}"/>`; acc+=vals[i]/tot*C; return s; }).join('');
  return {svg:`<svg viewBox="0 0 400 400" class="dk-donut-svg"><g transform="rotate(-90 200 200)">${full?'':`<circle cx="200" cy="200" r="${r}" fill="none" stroke-width="${sw}" style="stroke:color-mix(in srgb,var(--muted) 14%,transparent)"/>`}${segs}</g></svg>`,tot,vals};
}
const tableHTML=(header,rows,hot,cls='')=>{ const sp=s=>String(s||'').split('|').map(x=>x.trim()); const h=sp(header).filter(Boolean);
  return `<table class="dk-table ${cls}">${h.length?`<thead><tr>${h.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>`:''}<tbody data-a="stagger">${arr(rows).map((r,i)=>`<tr${i+1===hot?' class="hot"':''}>${sp(r).map(c=>`<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; };
Object.assign(TEMPLATES,{
 pizza:{name:'Pizza / rosca',desc:'Gráfico de pizza ou rosca que se desenha, com legenda e porcentagens',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'slices',t:'items',l:'Fatias',max:8,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Valor'}]},{k:'centerValue',t:'text',l:'Centro: valor (vazio = total)'},{k:'centerLabel',t:'text',l:'Centro: legenda'},{k:'full',t:'bool',l:'Pizza cheia (sem furo no meio)'},{k:'showPct',t:'bool',l:'Mostrar porcentagem na legenda'}],
  sample:{kicker:'Distribuição',title:'Para onde vai o *orçamento*',lead:'',slices:[{label:'Manutenção',value:'420'},{label:'Peças',value:'310'},{label:'Serviços',value:'180'},{label:'Outros',value:'90'}],centerValue:'',centerLabel:'R$ mil no ano',full:false,showPct:true},
  render(d){ const s=arr(d.slices).slice(0,8); const D=donutSVG(s,{full:d.full}); const cv=d.centerValue||D.tot.toLocaleString('pt-BR');
    return `${head(d)}<div class="dk-pie"><div class="dk-donut" data-a="donut">${D.svg}${d.full?'':`<div class="dk-donut-c"><b${countAttr(cv)}>${esc(cv)}</b><small data-f="centerLabel">${esc(d.centerLabel)}</small></div>`}</div>
    <div class="dk-legend" data-a="stagger">${s.map((x,i)=>`<div class="dk-lg"><i style="background:${PALC[i%PALC.length]}"></i><span data-f="slices.${i}.label">${esc(x.label)}</span><b>${esc(x.value)}</b>${d.showPct?`<em>${fmtPct(D.vals[i]/(D.tot||1)*100)}</em>`:''}</div>`).join('')}</div></div>`; }},
 barrash:{name:'Barras horizontais',desc:'Ranking com barras deitadas crescendo e valores contando',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'unit',t:'text',l:'Unidade (ex.: R$ mil, %)'},{k:'bars',t:'items',l:'Barras',max:8,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Valor'},{k:'hot',t:'bool',l:'Destacar'}]},{k:'sort',t:'bool',l:'Ordenar do maior para o menor'}],
  sample:{kicker:'Ranking',title:'Economia *por área*',lead:'',unit:'R$ mil',sort:true,bars:[{label:'Funilaria',value:'410',hot:true},{label:'Pintura',value:'260'},{label:'Montagem',value:'180'},{label:'Logística',value:'140'},{label:'Qualidade',value:'95'}].map(x=>Object.assign({hot:false},x))},
  render(d){ let b=arr(d.bars).slice(0,8).map(x=>Object.assign({},x,{n:num(x.value)})); if(d.sort) b=b.slice().sort((p,q)=>q.n-p.n); const mx=Math.max(1,...b.map(x=>x.n));
    return `${head(d)}<div class="dk-hb" data-a="hbars">${b.map(x=>`<div class="hb-r${x.hot?' hot':''}"><span class="hb-l">${esc(x.label)}</span><div class="hb-t"><i class="hb-f" style="width:${Math.max(1.5,x.n/mx*100)}%"></i></div><span class="hb-v"><b${countAttr(x.value)}>${esc(x.value)}</b>${d.unit?` <small>${esc(d.unit)}</small>`:''}</span></div>`).join('')}</div>`; }},
 linha:{name:'Linha / área',desc:'Evolução no tempo: a linha se desenha, a área aparece e os pontos surgem',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'points',t:'items',l:'Pontos',max:12,sub:[{k:'label',t:'text',l:'Rótulo (ex.: Jan)'},{k:'value',t:'text',l:'Valor'}]},{k:'target',t:'text',l:'Linha de meta (valor, opcional)'},{k:'targetLabel',t:'text',l:'Nome da meta'},{k:'showValues',t:'bool',l:'Mostrar valores nos pontos'}],
  sample:{kicker:'Evolução',title:'Economia *mês a mês*',lead:'',target:'300',targetLabel:'Meta',showValues:true,points:[{label:'Abr',value:'120'},{label:'Mai',value:'180'},{label:'Jun',value:'165'},{label:'Jul',value:'260'},{label:'Ago',value:'330'},{label:'Set',value:'410'}]},
  render(d){ const p=arr(d.points).slice(0,12); const W=1600,H=520,pl=20,pr=20,pt=50,pb=60; const vals=p.map(x=>num(x.value)); const tg=d.target?num(d.target):null;
    const mx=Math.max(1,...vals,tg||0)*1.12; const X=i=>pl+(p.length>1?i*(W-pl-pr)/(p.length-1):(W-pl-pr)/2), Y=v=>pt+(1-v/mx)*(H-pt-pb);
    const pts=vals.map((v,i)=>[X(i),Y(v)]); let path=''; pts.forEach((q,i)=>{ if(!i){ path=`M${q[0]},${q[1]}`; return; } const a0=pts[i-2]||pts[i-1], a1=pts[i-1], a3=pts[i+1]||q; const c1=[a1[0]+(q[0]-a0[0])/6,a1[1]+(q[1]-a0[1])/6], c2=[q[0]-(a3[0]-a1[0])/6,q[1]-(a3[1]-a1[1])/6]; path+=` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${q[0].toFixed(1)},${q[1].toFixed(1)}`; });
    const area=pts.length?`${path} L${pts[pts.length-1][0]},${H-pb} L${pts[0][0]},${H-pb} Z`:'';
    const grid=[0,.25,.5,.75,1].map(f=>`<line x1="0" x2="${W}" y1="${pt+f*(H-pt-pb)}" y2="${pt+f*(H-pt-pb)}" class="ln-g"/>`).join('');
    return `${head(d)}<div class="dk-line" data-a="line"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="lnA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>${grid}
      ${tg!=null?`<line x1="0" x2="${W}" y1="${Y(tg)}" y2="${Y(tg)}" class="ln-t"/>`:''}<path d="${area}" class="ln-a" fill="url(#lnA)"/><path d="${path}" class="ln-p" pathLength="1"/></svg>
      ${pts.map((q,i)=>`<div class="ln-d" style="left:${q[0]/W*100}%;top:${q[1]/H*100}%">${d.showValues?`<b>${esc(p[i].value)}</b>`:''}</div>`).join('')}
      ${tg!=null?`<span class="ln-tl" style="top:${Y(tg)/H*100}%">${esc(d.targetLabel||'Meta')} · ${esc(d.target)}</span>`:''}
      <div class="ln-x">${p.map((x,i)=>`<span style="left:${X(i)/W*100}%">${esc(x.label)}</span>`).join('')}</div></div>`; }},
 medidores:{name:'Medidores',desc:'De 1 a 4 anéis de progresso com porcentagem contando',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'gauges',t:'items',l:'Medidores',max:4,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Porcentagem (0 a 100)'},{k:'text',t:'area',l:'Descrição'}]}],
  sample:{kicker:'Metas do ano',title:'Quanto já *alcançamos*',lead:'',gauges:[{label:'Economia',value:'82',text:'da meta anual de R$ 1,5 mi.'},{label:'Cobertura',value:'64',text:'das áreas usando o sistema.'},{label:'Prazo',value:'94',text:'das análises dentro do prazo.'}]},
  render(d){ const g=arr(d.gauges).slice(0,4); const r=120, C=2*Math.PI*r;
    return `${head(d)}<div class="dk-gauges" style="${cols(Math.max(1,g.length))}" data-a="gauges">${g.map((x,i)=>{ const v=Math.max(0,Math.min(100,num(x.value))); return `<div class="dk-gauge"><div class="g-ring"><svg viewBox="0 0 300 300"><circle cx="150" cy="150" r="${r}" class="g-bg"/><circle cx="150" cy="150" r="${r}" class="g-arc" style="stroke:${PALC[i%4]}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-v/100)).toFixed(1)}" data-c="${C.toFixed(1)}" transform="rotate(-90 150 150)"/></svg><div class="g-v"><b${countAttr(String(v))}>${v}</b><small>%</small></div></div><small class="g-l" data-f="gauges.${i}.label">${esc(x.label)}</small><p data-f="gauges.${i}.text">${rich(x.text)}</p></div>`; }).join('')}</div>`; }},
 funil:{name:'Funil',desc:'Etapas que encolhem, com a conversão entre elas',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'stages',t:'items',l:'Etapas',max:6,sub:[{k:'label',t:'text',l:'Etapa'},{k:'value',t:'text',l:'Valor'},{k:'text',t:'text',l:'Detalhe (opcional)'}]},{k:'showRate',t:'bool',l:'Mostrar conversão entre etapas'}],
  sample:{kicker:'Funil de vendas',title:'Da visita ao *contrato*',lead:'',showRate:true,stages:[{label:'Visitas',value:'12.400',text:''},{label:'Cadastros',value:'3.100',text:''},{label:'Demonstrações',value:'620',text:''},{label:'Propostas',value:'210',text:''},{label:'Contratos',value:'84',text:''}]},
  render(d){ const s=arr(d.stages).slice(0,6), v=s.map(x=>num(x.value)), mx=Math.max(1,...v);
    return `${head(d)}<div class="dk-fn" data-a="funnel">${s.map((x,i)=>`${i&&d.showRate?`<div class="fn-rate">${v[i-1]?fmtPct(v[i]/v[i-1]*100):''}</div>`:''}<div class="fn-s" style="--w:${(30+70*Math.pow(v[i]/mx,.4)).toFixed(1)}%;--c:${PALC[i%PALC.length]}"><span class="fn-l" data-f="stages.${i}.label">${esc(x.label)}</span><b${countAttr(x.value)}>${esc(x.value)}</b>${x.text?`<small>${esc(x.text)}</small>`:''}</div>`).join('')}</div>`; }},
 matriz:{name:'Matriz 2×2',desc:'Quatro quadrantes (SWOT, prioridades, riscos)',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'aTitle',t:'text',l:'Quadrante 1 (sup. esquerdo)'},{k:'a',t:'list',l:'Itens do quadrante 1'},{k:'bTitle',t:'text',l:'Quadrante 2 (sup. direito)'},{k:'b',t:'list',l:'Itens do quadrante 2'},{k:'cTitle',t:'text',l:'Quadrante 3 (inf. esquerdo)'},{k:'c',t:'list',l:'Itens do quadrante 3'},{k:'dTitle',t:'text',l:'Quadrante 4 (inf. direito)'},{k:'d',t:'list',l:'Itens do quadrante 4'},{k:'xLabel',t:'text',l:'Legenda do eixo horizontal (opcional)'},{k:'yLabel',t:'text',l:'Legenda do eixo vertical (opcional)'}],
  sample:{kicker:'Análise SWOT',title:'Onde estamos *e para onde ir*',aTitle:'Forças',a:['Dados integrados','Equipe técnica'],bTitle:'Fraquezas',b:['Pouca adoção fora da área','Processos manuais'],cTitle:'Oportunidades',c:['Expandir para compras','Painel para a diretoria'],dTitle:'Ameaças',d:['Mudança de sistema de origem','Falta de tempo das equipes'],xLabel:'',yLabel:''},
  render(d){ const q=[['a','var(--ok)'],['b','var(--bad)'],['c','var(--accent)'],['d','var(--alert)']];
    return `${head(d)}<div class="dk-mx${d.yLabel?' has-y':''}">${d.yLabel?`<span class="mx-y">${esc(d.yLabel)}</span>`:''}<div class="mx-g" data-a="cards">${q.map(([k,c])=>`<div class="dk-card mx-q" style="--c:${c}"><span class="dk-ix" data-f="${k}Title">${esc(d[k+'Title'])}</span>${arr(d[k]).map((x,i)=>`<div class="mx-i" data-f="${k}.${i}"><i></i>${rich(x)}</div>`).join('')}</div>`).join('')}</div>${d.xLabel?`<span class="mx-x">${esc(d.xLabel)}</span>`:''}</div>`; }},
 painel:{name:'Painel (OnePage)',desc:'Dashboard condensado: indicadores, tabela, gráfico de rosca e destaques numa tela só',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'kpis',t:'items',l:'Indicadores (topo)',max:4,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Valor'},{k:'delta',t:'text',l:'Variação (ex.: +12%)'},{k:'link',t:'slide',l:'Abre o slide'}]},{k:'tableTitle',t:'text',l:'Tabela: título'},{k:'header',t:'text',l:'Tabela: cabeçalho (colunas com | )'},{k:'rows',t:'list',l:'Tabela: linhas (colunas com | )'},{k:'chartTitle',t:'text',l:'Gráfico: título'},{k:'mix',t:'items',l:'Gráfico de rosca',max:6,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Valor'}]},{k:'highlights',t:'list',l:'Destaques (rodapé)'}],
  sample:{kicker:'Painel do trimestre',title:'Operação *em uma tela*',
    kpis:[{label:'Economia',value:'1.250.000',delta:'+18%',link:''},{label:'Decisões',value:'832',delta:'+9%',link:''},{label:'No prazo',value:'94%',delta:'+3 p.p.',link:''},{label:'Pendências',value:'27',delta:'-41%',link:''}],
    tableTitle:'Por área',header:'Área | Reservas | Economia',rows:['Funilaria | 312 | R$ 410 mil','Pintura | 208 | R$ 260 mil','Montagem | 145 | R$ 180 mil','Logística | 98 | R$ 140 mil'],
    chartTitle:'Tipo de gasto',mix:[{label:'Peças',value:'45'},{label:'Serviços',value:'30'},{label:'Mão de obra',value:'25'}],
    highlights:['Funilaria lidera a economia','Pendências caíram 41%','Meta anual em 82%']},
  render(d){ const k=arr(d.kpis).slice(0,4), m=arr(d.mix).slice(0,6), D=donutSVG(m,{thin:true}); const hasT=!!(String(d.header||'').trim()||arr(d.rows).length), hasC=m.length>0;
    return `${head(d)}<div class="dk-pn">
      <div class="pn-k" style="${cols(Math.max(1,k.length))}" data-a="cards">${k.map((x,i)=>`<div class="dk-card pn-kpi${x.link?' go':''}"${x.link?` data-go="${esc(x.link)}" role="button" tabindex="0"`:''}><small data-f="kpis.${i}.label">${esc(x.label)}</small><b${countAttr(x.value)}>${esc(x.value)}</b>${x.delta?`<span class="pn-d${/^\s*-/.test(x.delta)?' neg':''}">${esc(x.delta)}</span>`:''}${x.link?'<i class="pn-go">→</i>':''}</div>`).join('')}</div>
      ${hasT||hasC?`<div class="pn-m" style="${hasT&&hasC?'':'grid-template-columns:1fr'}">${hasT?`<div class="dk-card pn-box" data-a="up"><span class="dk-ix" data-f="tableTitle">${esc(d.tableTitle)}</span>${tableHTML(d.header,d.rows,0,'pn-tb')}</div>`:''}
      ${hasC?`<div class="dk-card pn-box pn-ch" data-a="up"><span class="dk-ix" data-f="chartTitle">${esc(d.chartTitle)}</span><div class="pn-dn"><div class="dk-donut" data-a="donut">${D.svg}</div><div class="dk-legend sm">${m.map((x,i)=>`<div class="dk-lg"><i style="background:${PALC[i%PALC.length]}"></i><span>${esc(x.label)}</span><em>${fmtPct(D.vals[i]/(D.tot||1)*100)}</em></div>`).join('')}</div></div></div>`:''}</div>`:''}
      ${arr(d.highlights).length?`<div class="pn-h" data-a="stagger">${arr(d.highlights).map((x,i)=>`<span class="dk-chip" data-f="highlights.${i}">${rich(x)}</span>`).join('')}</div>`:''}</div>`; }}
});
Object.assign(FX,{
  donut(el,tl,at){ const s=[...el.querySelectorAll('.seg')]; s.forEach((c,i)=>tl.fromTo(c,{attr:{'stroke-dasharray':`0 ${c.dataset.c}`}},{attr:{'stroke-dasharray':`${c.dataset.len} ${c.dataset.c}`},duration:.9,ease:'power2.inOut'},at+.2+i*.32)); tl.from(el.querySelector('.dk-donut-svg'),{rotation:-60,scale:.85,opacity:0,transformOrigin:'50% 50%',duration:1.4,ease:'expo.out'},at); return .3; },
  hbars(el,tl,at){ const f=el.querySelectorAll('.hb-f'); tl.from(el.querySelectorAll('.hb-l'),{x:-30,opacity:0,stagger:.08,duration:.7},at); tl.from(f,{scaleX:0,transformOrigin:'0% 50%',stagger:.1,duration:1.2,ease:'power3.out'},at+.2); tl.from(el.querySelectorAll('.hb-v'),{opacity:0,x:-20,stagger:.1,duration:.6},at+.6); return .3; },
  line(el,tl,at){ const p=el.querySelector('.ln-p'), a=el.querySelector('.ln-a'); if(p) tl.fromTo(p,{attr:{'stroke-dashoffset':1}},{attr:{'stroke-dashoffset':0},duration:1.8,ease:'power2.inOut'},at+.2); if(a) tl.from(a,{opacity:0,duration:1.2},at+1); tl.from(el.querySelectorAll('.ln-d'),{scale:0,opacity:0,stagger:.12,duration:.5,ease:'back.out(2)'},at+.4); tl.from(el.querySelectorAll('.ln-x span,.ln-tl'),{opacity:0,y:10,stagger:.04,duration:.5},at+.2); return .3; },
  gauges(el,tl,at){ el.querySelectorAll('.g-arc').forEach((c,i)=>tl.fromTo(c,{attr:{'stroke-dashoffset':c.dataset.c}},{attr:{'stroke-dashoffset':c.getAttribute('stroke-dashoffset')},duration:1.8,ease:'power3.out'},at+.2+i*.15)); tl.from(el.children,{y:40,opacity:0,stagger:.12,duration:1},at); return .3; },
  funnel(el,tl,at){ tl.from(el.querySelectorAll('.fn-s'),{scaleX:.15,opacity:0,transformOrigin:'50% 50%',stagger:.14,duration:1,ease:'expo.out'},at+.1); tl.from(el.querySelectorAll('.fn-rate'),{opacity:0,y:-8,stagger:.14,duration:.5},at+.5); return .3; }
});

/* ---------- 3D de verdade (canvas, sem biblioteca) ---------- */
const cfgAttr=o=>esc(JSON.stringify(o));
Object.assign(TEMPLATES,{
 particulas3d:{name:'Partículas 3D',desc:'Milhares de partículas em 3D que formam uma palavra, se desfazem numa forma e voltam, com a câmera orbitando',
  fields:[{k:'word',t:'text',l:'Palavra formada pelas partículas (curta: 1 a 12 letras)'},{k:'shape',t:'select',l:'Forma intermediária',opts:{esfera:'Esfera',helice:'Hélice (DNA)',onda:'Onda',galaxia:'Galáxia'}},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título (embaixo)'},{k:'lead',t:'area',l:'Texto de apoio'}],
  sample:{word:'2026',shape:'esfera',kicker:'O próximo passo',title:'Um novo *capítulo*',lead:''},
  render(d){ return `<canvas class="dk-3d dk-3d-full" width="1600" height="900" data-kind="particles" data-cfg="${cfgAttr({word:d.word||'',shape:d.shape||'esfera'})}"></canvas><div class="dk-l dk-p3-txt">${head(d,'h2')}</div>`; }},
 barras3d:{name:'Barras 3D',desc:'Gráfico de barras em 3D sobre um piso, crescendo do chão com a câmera girando em volta',
  fields:[{k:'camera',t:'select',l:'Câmera',opts:{orbita:'Orbitar em volta',foco:'Focar em cada barra enquanto ela sobe',voo:'Voar rente sobre as barras',topo:'Descer do alto até o gráfico',cinema:'Cinema (do alto, voa e foca o destaque)'}},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'unit',t:'text',l:'Unidade (ex.: R$ mil)'},{k:'bars',t:'items',l:'Barras',max:8,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'value',t:'text',l:'Valor'},{k:'hot',t:'bool',l:'Destacar'}]}],
  sample:{kicker:'Resultados',title:'Economia *por trimestre*',lead:'',unit:'R$ mil',bars:[{label:'T1',value:'120',hot:false},{label:'T2',value:'210',hot:false},{label:'T3',value:'260',hot:false},{label:'T4',value:'410',hot:true}]},
  render(d){ const b=arr(d.bars).slice(0,8).map(x=>({l:String(x.label||''),v:String(x.value||''),n:num(x.value),h:!!x.hot}));
    return `<canvas class="dk-3d dk-3d-full" width="1600" height="900" data-kind="bars" data-cfg="${cfgAttr({bars:b,unit:d.unit||'',camera:d.camera||'orbita'})}"></canvas><div class="dk-b3-txt">${head(d)}</div>`; }},
 globo3d:{name:'Globo 3D',desc:'Planeta de pontos girando, com arcos de conexão que saem de um ponto central e pulsos viajando entre os locais',
  fields:[{k:'camera',t:'select',l:'Câmera',opts:{girar:'Girar devagar',tour:'Tour: visita cada local, um por vez'}},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Texto de apoio'},{k:'stats',t:'list',l:'Destaques (ex.: 12 países)'},{k:'points',t:'items',l:'Locais (o primeiro é o centro das conexões)',max:10,sub:[{k:'label',t:'text',l:'Nome'},{k:'lat',t:'text',l:'Latitude (ex.: -23.5)'},{k:'lon',t:'text',l:'Longitude (ex.: -46.6)'}]}],
  sample:{kicker:'Presença',title:'Do Brasil *para o mundo*',lead:'Operação conectada em quatro continentes.',stats:['5 escritórios','12 países'],points:[{label:'São Paulo',lat:'-23.5',lon:'-46.6'},{label:'Lisboa',lat:'38.7',lon:'-9.1'},{label:'Nova York',lat:'40.7',lon:'-74'},{label:'Cidade do México',lat:'19.4',lon:'-99.1'},{label:'Tóquio',lat:'35.7',lon:'139.7'},{label:'Cidade do Cabo',lat:'-33.9',lon:'18.4'}]},
  render(d){ const pts=arr(d.points).slice(0,10).map(x=>({l:String(x.label||''),la:parseFloat(String(x.lat).replace(',','.'))||0,lo:parseFloat(String(x.lon).replace(',','.'))||0}));
    return `<canvas class="dk-3d dk-3d-full" width="1600" height="900" data-kind="globe" data-cfg="${cfgAttr({pts,camera:d.camera||'girar'})}"></canvas><div class="dk-gl-txt">${head(d)}${arr(d.stats).length?`<div class="dk-gl-st" data-a="stagger">${arr(d.stats).map((x,i)=>`<span class="dk-chip" data-f="stats.${i}">${rich(x)}</span>`).join('')}</div>`:''}</div>`; }},
 logo3d:{name:'Logo 3D',desc:'Sua logo vira uma escultura 3D de partículas que se monta no ar e gira com profundidade',
  fields:[{k:'image',t:'image',l:'Logo (PNG transparente). Vazio = logo do tema'},{k:'word',t:'text',l:'Texto, se não houver logo'},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título (embaixo)'},{k:'lead',t:'area',l:'Texto de apoio'}],
  sample:{image:'',word:'MARCA',kicker:'Apresentamos',title:'Uma marca *em movimento*',lead:''},
  render(d,t){ const src=resolveImage(d.image||(t&&t.logo)||''); return `<canvas class="dk-3d dk-3d-full" width="1600" height="900" data-kind="logo" data-cfg="${cfgAttr({src,word:d.word||''})}"></canvas><div class="dk-l dk-p3-txt">${head(d,'h2')}</div>`; }},
 tunel3d:{name:'Túnel 3D',desc:'Viagem por um túnel 3D em alta velocidade que desacelera e revela o título no centro (ótimo para abrir capítulos)',
  fields:[{k:'style',t:'select',l:'Estilo do túnel',opts:{aneis:'Anéis de luz',grade:'Grade (malha)',estrelas:'Estrelas (dobra espacial)'}},{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Texto de apoio'}],
  sample:{style:'aneis',kicker:'Capítulo 02',title:'O que vem *a seguir*',lead:''},
  render(d){ return `<canvas class="dk-3d dk-3d-full" width="1600" height="900" data-kind="tunnel" data-cfg="${cfgAttr({style:d.style||'aneis'})}"></canvas><div class="dk-tn-txt">${head(d,'h1')}</div>`; }}
});
const V3={
  proj(x,y,z,c){ const cy=Math.cos(c.yaw), sy=Math.sin(c.yaw); const X=x*cy-z*sy; let Z=x*sy+z*cy; const cp=Math.cos(c.pitch), sp=Math.sin(c.pitch); const Y=y*cp+Z*sp; Z=-y*sp+Z*cp; const s=c.f/(c.f+Z+c.dist); return [c.cx+X*s,c.cy-Y*s,s,Z]; },
  colors(cv){ const cs=getComputedStyle(cv), g=k=>hex2rgb((cs.getPropertyValue(k)||'').trim()||'#888'); return {a:g('--accent'),b:g('--alert'),c:g('--ok'),t:g('--title'),m:g('--muted'),light:cs.colorScheme==='light',fd:cs.getPropertyValue('--f-display'),fb:cs.getPropertyValue('--f-body')}; },
  ease:p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2
};
/* nuvens de pontos */
function ptsSphere(N){ const o=new Float32Array(N*3); for(let i=0;i<N;i++){ const y=1-2*(i+.5)/N, r=Math.sqrt(1-y*y), th=i*2.39996; o[i*3]=Math.cos(th)*r*330; o[i*3+1]=y*330; o[i*3+2]=Math.sin(th)*r*330; } return o; }
function ptsHelix(N){ const o=new Float32Array(N*3); for(let i=0;i<N;i++){ const s=i%2, u=(i/N)*14*Math.PI, j=(Math.random()-.5)*26; o[i*3]=Math.cos(u+s*Math.PI)*170+j; o[i*3+1]=(i/N-.5)*700; o[i*3+2]=Math.sin(u+s*Math.PI)*170+j; } return o; }
function ptsWave(N){ const o=new Float32Array(N*3), c=Math.ceil(Math.sqrt(N*2.2)), r=Math.ceil(N/c); for(let i=0;i<N;i++){ const gx=i%c, gz=Math.floor(i/c), x=(gx/c-.5)*1300, z=(gz/r-.5)*600; o[i*3]=x; o[i*3+1]=Math.sin(x*.012)*70+Math.cos(z*.015)*50-60; o[i*3+2]=z; } return o; }
function ptsGalaxy(N){ const o=new Float32Array(N*3); for(let i=0;i<N;i++){ const arm=i%3, d=Math.pow(Math.random(),.6)*560, an=arm*2.094+d*.011+(Math.random()-.5)*.6; const y0=(Math.random()-.5)*(70-d*.08), z0=Math.sin(an)*d; o[i*3]=Math.cos(an)*d; o[i*3+1]=y0*.8-z0*.6; o[i*3+2]=y0*.6+z0*.8; } return o; } // galáxia inclinada para a espiral aparecer
function ptsWord(word,font,N){
  const w=String(word||'').trim()||'•'; const c=document.createElement('canvas'); c.width=1800; c.height=560; const x=c.getContext('2d');
  let fs=430; x.font=`700 ${fs}px ${font||'sans-serif'}`; const mw=x.measureText(w).width; if(mw>1700){ fs=Math.floor(fs*1700/mw); x.font=`700 ${fs}px ${font||'sans-serif'}`; }
  x.fillStyle='#fff'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(w,900,290);
  const px=x.getImageData(0,0,1800,560).data, cand=[];
  for(let y=0;y<560;y+=3) for(let i=0;i<1800;i+=3){ if(px[(y*1800+i)*4+3]>140) cand.push((i-900)*.8,(280-y)*.8); }
  const o=new Float32Array(N*3), k=cand.length/2; if(!k) return ptsSphere(N);
  for(let i=0;i<N;i++){ const j=Math.floor(Math.random()*k); o[i*3]=cand[j*2]+(Math.random()-.5)*2; o[i*3+1]=cand[j*2+1]+(Math.random()-.5)*2; o[i*3+2]=(Math.random()-.5)*36; } return o;
}
function run3dParticles(cv,cfg,o){
  const W=cv.width,H=cv.height,cx=cv.getContext('2d'),K=V3.colors(cv),N=4200;
  const font=K.fd||'sans-serif'; let word=ptsWord(cfg.word,font,N);
  const shp=({esfera:ptsSphere,helice:ptsHelix,onda:ptsWave,galaxia:ptsGalaxy}[cfg.shape]||ptsSphere)(N), gal=ptsGalaxy(N);
  const delay=new Float32Array(N).map(()=>Math.random()*.35);
  const cur=new Float32Array(o.still?word:gal); let from=new Float32Array(cur), to=o.still?word:gal, t0=null, mStart=0, mDur=1, phase=0, alive=true, raf=0;
  /* sequência: galáxia → palavra → forma → palavra → forma … */
  const seq=[{to:()=>word,at:1.1,dur:2.4},{to:()=>shp,at:8,dur:2.2},{to:()=>word,at:12.5,dur:2.2}];
  const cols=[K.a,K.b,K.c].map(c=>`rgb(${c[0]},${c[1]},${c[2]})`);
  if(document.fonts&&document.fonts.load) document.fonts.load(`700 100px ${font}`).then(()=>{ if(!alive) return; const nw=ptsWord(cfg.word,font,N); if(to===word){ to=nw; } word=nw; if(o.still){ cur.set(nw); draw(0); } }).catch(()=>{});
  function morph(target,now,dur){ from=new Float32Array(cur); to=target; mStart=now; mDur=dur; }
  function draw(tt){
    cx.clearRect(0,0,W,H); cx.globalCompositeOperation=K.light?'source-over':'lighter';
    const cam={yaw:Math.sin(tt*.22)*.5+(o.still?.22:0),pitch:.1+Math.sin(tt*.17)*.07,f:1100,dist:380,cx:W/2,cy:H*.44};
    const buckets=[[],[],[]];
    for(let i=0;i<N;i++){ const p=V3.proj(cur[i*3],cur[i*3+1],cur[i*3+2],cam); if(p[2]<=0) continue; buckets[i%7===0?2:i%3===0?1:0].push(p); }
    buckets.forEach((bk,j)=>{ cx.fillStyle=cols[j]; for(const p of bk){ const s=Math.max(1.5,3.4*p[2]); cx.globalAlpha=Math.min(1,(K.light?.6:.55)+.55*p[2]-.2); cx.fillRect(p[0]-s/2,p[1]-s/2,s,s); } });
    cx.globalAlpha=1; cx.globalCompositeOperation='source-over';
  }
  function frame(now){
    if(!alive) return; if(t0==null) t0=now; const tt=(now-t0)/1000;
    if(phase<seq.length&&tt>=seq[phase].at){ morph(seq[phase].to(),tt,seq[phase].dur); phase++; if(phase===seq.length){ seq.push({to:()=>shp,at:tt+5,dur:2.2},{to:()=>word,at:tt+9.5,dur:2.2}); } }
    const p=(tt-mStart)/mDur;
    if(p<=1.35) for(let i=0;i<N;i++){ const q=V3.ease(Math.max(0,Math.min(1,(p-delay[i])/.65))); const k=i*3; cur[k]=from[k]+(to[k]-from[k])*q; cur[k+1]=from[k+1]+(to[k+1]-from[k+1])*q; cur[k+2]=from[k+2]+(to[k+2]-from[k+2])*q; }
    draw(tt); raf=requestAnimationFrame(frame);
  }
  if(o.still) draw(0); else raf=requestAnimationFrame(frame);
  return {kill(){ alive=false; cancelAnimationFrame(raf); }};
}
function run3dBars(cv,cfg,o){
  const W=cv.width,H=cv.height,cx=cv.getContext('2d'),K=V3.colors(cv); const B=cfg.bars||[]; const n=B.length; if(!n) return {kill(){}};
  const mx=Math.max(1,...B.map(b=>b.n)), sp=Math.min(190,1100/Math.max(1,n)), bw=sp*.55, x0=-(n-1)*sp/2;
  const HT=i=>Math.max(2,B[i].n/mx*430), XI=i=>x0+i*sp;
  const shade=(c,f,add=0)=>'rgb('+(Math.min(255,c[0]*f+add)|0)+','+(Math.min(255,c[1]*f+add)|0)+','+(Math.min(255,c[2]*f+add)|0)+')';
  const mode=cfg.camera||'orbita', hot=Math.max(0,B.findIndex(b=>b.h)), lerp=(a,b,t)=>a+(b-a)*t;
  /* câmera: yaw, pitch, dist, alvo (tx,ty) e altura do centro na tela (cy) */
  const OV={yaw:-.6,pitch:.42,dist:950,tx:0,ty:0,cy:.74};
  const FOC=i=>({yaw:-.42+(i%2?.14:-.14),pitch:.24,dist:-560,tx:XI(i),ty:HT(i)*.55,cy:.56});
  /* quando cada barra cresce e roteiro de quadros-chave da câmera */
  let grow=i=>({s:.3+i*.18,d:1.4}), keys=[];
  if(mode==='foco'){ grow=i=>({s:1.1+i*1.9,d:1.1}); keys.push({t:0,c:Object.assign({},OV,{dist:1350,pitch:.6})}); for(let i=0;i<n;i++){ const g=grow(i); keys.push({t:g.s-.5,c:FOC(i)},{t:g.s+g.d+.25,c:FOC(i)}); } keys.push({t:grow(n-1).s+grow(n-1).d+1.8,c:OV}); }
  else if(mode==='voo'){ const T=Math.max(4,n*1.2); grow=i=>({s:.5+(n>1?i/(n-1):0)*T*.92,d:.9}); keys.push({t:0,c:{yaw:-.28,pitch:.5,dist:-380,tx:XI(0)-sp*1.2,ty:150,cy:.62}},{t:T+.6,c:{yaw:-.28,pitch:.5,dist:-380,tx:XI(n-1)+sp*.6,ty:150,cy:.62},lin:true},{t:T+2.6,c:OV}); }
  else if(mode==='topo'){ grow=i=>({s:.6+i*.15,d:1.8}); keys.push({t:0,c:{yaw:0,pitch:1.42,dist:1500,tx:0,ty:0,cy:.5}},{t:3.4,c:OV}); }
  else if(mode==='cinema'){ grow=i=>({s:.8+i*.22,d:1.5}); const g=grow(hot); keys.push({t:0,c:{yaw:.3,pitch:1.3,dist:1600,tx:0,ty:0,cy:.5}},{t:2.6,c:{yaw:-.9,pitch:.36,dist:900,tx:0,ty:60,cy:.7}},{t:Math.max(4.4,g.s+g.d+.6),c:FOC(hot)},{t:Math.max(6.4,g.s+g.d+2.6),c:FOC(hot)},{t:Math.max(8.6,g.s+g.d+4.8),c:OV}); }
  const tEnd=keys.length?keys[keys.length-1].t:0;
  function camAt(tt){
    if(o.still||!keys.length||tt>=tEnd){ const k=Math.max(0,tt-tEnd); return Object.assign({},OV,{yaw:OV.yaw+(o.still?0:Math.sin(k*.2)*.22)}); }
    let j=0; while(j<keys.length-1&&keys[j+1].t<=tt) j++;
    const A=keys[j], Bk=keys[Math.min(j+1,keys.length-1)]; const q=Bk.t>A.t?Math.min(1,(tt-A.t)/(Bk.t-A.t)):1, e=Bk.lin?q:V3.ease(q);
    const c={}; for(const k in OV) c[k]=lerp(A.c[k],Bk.c[k],e); return c; }
  let alive=true, raf=0, t0=null;
  function draw(tt){
    cx.clearRect(0,0,W,H);
    const C=camAt(tt), cam={yaw:C.yaw,pitch:C.pitch,f:1500,dist:C.dist,cx:W/2,cy:H*C.cy};
    const P=(x,y,z)=>V3.proj(x-C.tx,y-C.ty,z,cam);
    /* piso em grade */
    cx.lineWidth=1; cx.strokeStyle='rgba('+K.m[0]+','+K.m[1]+','+K.m[2]+',.22)';
    const G=Math.max(700,n*sp*.75); const line=(a,b)=>{ if(a[2]<=0||b[2]<=0) return; cx.beginPath(); cx.moveTo(a[0],a[1]); cx.lineTo(b[0],b[1]); cx.stroke(); };
    for(let g=-G;g<=G;g+=80) line(P(g,0,-360),P(g,0,360));
    for(let z=-360;z<=360;z+=80) line(P(-G,0,z),P(G,0,z));
    const faces=[], tops=[];
    B.forEach((b,i)=>{ const gr=grow(i), g=o.still?1:V3.ease(Math.max(0,Math.min(1,(tt-gr.s)/gr.d))); const h=Math.max(2,HT(i)*g); const X0=XI(i)-bw/2, X1=X0+bw, Z0=-bw/2, Z1=bw/2; const c=b.h?K.b:K.a;
      const cz=P(X0+bw/2,h/2,0)[3];
      const q=(pts,col)=>{ const pp=pts.map(v=>P(...v)); if(pp.some(v=>v[2]<=0)) return; const z=pp.reduce((s,v)=>s+v[3],0)/4; if(z>cz+.5) return; faces.push({pp,col,z}); }; // só faces viradas para a câmera
      q([[X0,0,Z1],[X1,0,Z1],[X1,h,Z1],[X0,h,Z1]],shade(c,.62)); q([[X0,0,Z0],[X1,0,Z0],[X1,h,Z0],[X0,h,Z0]],shade(c,.62));
      q([[X0,0,Z0],[X0,0,Z1],[X0,h,Z1],[X0,h,Z0]],shade(c,.82)); q([[X1,0,Z0],[X1,0,Z1],[X1,h,Z1],[X1,h,Z0]],shade(c,.82));
      q([[X0,h,Z0],[X1,h,Z0],[X1,h,Z1],[X0,h,Z1]],shade(c,1,45));
      tops.push({top:P(X0+bw/2,h+34,0),base:P(X0+bw/2,0,0),b,g}); });
    faces.sort((p,q)=>q.z-p.z).forEach(f=>{ cx.fillStyle=f.col; cx.beginPath(); f.pp.forEach((v,i)=>i?cx.lineTo(v[0],v[1]):cx.moveTo(v[0],v[1])); cx.closePath(); cx.fill(); cx.strokeStyle='rgba(255,255,255,.08)'; cx.stroke(); });
    cx.textAlign='center'; const tc='rgb('+K.t[0]+','+K.t[1]+','+K.t[2]+')', mc='rgb('+K.m[0]+','+K.m[1]+','+K.m[2]+')';
    tops.forEach(({top,base,b,g})=>{ if(top[2]<=0||base[2]<=0) return; cx.globalAlpha=Math.min(1,g*1.4); cx.fillStyle=tc; cx.font='600 '+Math.round(Math.min(110,40*top[2]*1.6))+'px '+K.fd; cx.fillText(b.v,top[0],top[1]);
      cx.fillStyle=mc; cx.font='500 '+Math.round(Math.min(56,22*base[2]*1.6))+'px '+K.fb; cx.fillText(b.l,base[0],base[1]+(bw*.75+34)*base[2]); });
    cx.globalAlpha=1;
    if(cfg.unit){ cx.textAlign='right'; cx.fillStyle=mc; cx.font='500 20px '+K.fb; cx.fillText(cfg.unit.toUpperCase(),W-70,90); }
  }
  function frame(now){ if(!alive) return; if(t0==null) t0=now; draw((now-t0)/1000); raf=requestAnimationFrame(frame); }
  if(o.still) draw(0); else raf=requestAnimationFrame(frame);
  return {kill(){ alive=false; cancelAnimationFrame(raf); }};
}
/* globo de pontos com arcos de conexão */
function run3dGlobe(cv,cfg,o){
  const W=cv.width,H=cv.height,cx=cv.getContext('2d'),K=V3.colors(cv); const P=cfg.pts||[]; const R=318, CX=W*.71, CY=H*.5, rad=Math.PI/180;
  const N=1700, dots=ptsSphere(N).map(v=>v/330);
  const ll=(la,lo)=>[Math.cos(la*rad)*Math.sin(lo*rad),Math.sin(la*rad),Math.cos(la*rad)*Math.cos(lo*rad)];
  const loc=P.map(p=>ll(p.la,p.lo)); const hub=P[0]||{lo:0,la:0};
  const rgb=(c,a)=>'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
  let alive=true, raf=0, t0=null;
  /* tour: a câmera vira para cada local, aproxima e o arco nasce ali */
  const tour=cfg.camera==='tour'&&P.length>1, STEP=2.6, T0=1.4, unwrap=[]; { let prev=-hub.lo*rad; P.forEach((p,i)=>{ let y=-p.lo*rad; while(y-prev>Math.PI) y-=2*Math.PI; while(prev-y>Math.PI) y+=2*Math.PI; unwrap[i]=y; prev=y; }); }
  const tEndTour=T0+(P.length-1)*STEP+2.4, endYaw=unwrap[0]-.35-(P.length?0:0);
  function tourCam(tt){ const at=i=>({yaw:unwrap[i],pitch:P[i].la*rad*.9,zoom:1.32});
    if(tt<T0) return {yaw:unwrap[0]+.35,pitch:-.12,zoom:1};
    const k=(tt-T0)/STEP, i=Math.floor(k);
    if(i>=P.length-1){ const q=V3.ease(Math.min(1,(tt-(T0+(P.length-1)*STEP))/2.4)), A=at(P.length-1); const yEnd=A.yaw+.4; return tt>=tEndTour?{yaw:yEnd-(tt-tEndTour)*.12,pitch:lerpN(A.pitch,hub.la*rad*.6-.12,1),zoom:1}:{yaw:lerpN(A.yaw,yEnd,q),pitch:lerpN(A.pitch,hub.la*rad*.6-.12,q),zoom:lerpN(1.32,1,q)}; }
    const A=at(i), Bk=at(i+1), q=V3.ease(Math.min(1,Math.max(0,(k-i-.35)/.65)));
    return {yaw:lerpN(A.yaw,Bk.yaw,q),pitch:lerpN(A.pitch,Bk.pitch,q),zoom:1.32-Math.sin(q*Math.PI)*.22}; }
  const lerpN=(a,b,t)=>a+(b-a)*t;
  function rot(v,yaw,pitch){ const cy=Math.cos(yaw), sy=Math.sin(yaw); let x=v[0]*cy+v[2]*sy, z=-v[0]*sy+v[2]*cy; const cp=Math.cos(pitch), sp=Math.sin(pitch); const y=v[1]*cp-z*sp; z=v[1]*sp+z*cp; return [x,y,z]; }
  function slerp(a,b,t){ const d=Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])), om=Math.acos(d)||1e-6, s=Math.sin(om); const k1=Math.sin((1-t)*om)/s, k2=Math.sin(t*om)/s; const lift=1+Math.sin(Math.PI*t)*Math.min(.32,.06+om*.2); return [(a[0]*k1+b[0]*k2)*lift,(a[1]*k1+b[1]*k2)*lift,(a[2]*k1+b[2]*k2)*lift]; }
  function draw(tt){
    cx.clearRect(0,0,W,H);
    let yaw=-hub.lo*rad+.35-tt*.12, pitch=hub.la*rad*.6-.12, zoom=1; const intro=o.still?1:V3.ease(Math.min(1,tt/1.6));
    if(tour&&!o.still){ const cam=tourCam(tt); yaw=cam.yaw; pitch=cam.pitch; zoom=cam.zoom; }
    const r=R*(.75+.25*intro)*zoom;
    const g=cx.createRadialGradient(CX,CY,r*.85,CX,CY,r*1.35); g.addColorStop(0,rgb(K.a,0)); g.addColorStop(.2,rgb(K.a,K.light?.10:.16)); g.addColorStop(1,rgb(K.a,0)); cx.fillStyle=g; cx.beginPath(); cx.arc(CX,CY,r*1.35,0,7); cx.fill();
    cx.fillStyle=rgb(K.a,K.light?.05:.07); cx.beginPath(); cx.arc(CX,CY,r,0,7); cx.fill();
    for(let i=0;i<N;i++){ const q=rot([dots[i*3],dots[i*3+1],dots[i*3+2]],yaw,pitch); const f=q[2]; const a=f>0?(.25+.6*f):.07; cx.fillStyle=rgb(f>0?K.a:K.m,a*intro); const s=f>0?2.6:1.6; cx.fillRect(CX+q[0]*r-s/2,CY-q[1]*r-s/2,s,s); }
    const H0=loc[0];
    loc.forEach((L,i)=>{ if(i===0||!H0) return; const grow=o.still?1:V3.ease(Math.max(0,Math.min(1,(tt-(tour?T0+(i-1)*STEP+.9:1.2+i*.35))/1.3))); if(grow<=0) return;
      const seg=48, m=Math.ceil(seg*grow); cx.lineWidth=2.4; let last=null;
      for(let k=0;k<=m;k++){ const v=rot(slerp(H0,L,k/seg),yaw,pitch), x=CX+v[0]*r, y=CY-v[1]*r; if(last){ cx.strokeStyle=rgb(i%2?K.b:K.a,v[2]>-.1?.85:.18); cx.beginPath(); cx.moveTo(last[0],last[1]); cx.lineTo(x,y); cx.stroke(); } last=[x,y]; }
      if(grow>=1&&!o.still){ const pt=((tt*.45+i*.23)%1), v=rot(slerp(H0,L,pt),yaw,pitch); if(v[2]>-.1){ cx.fillStyle=rgb(K.t,.95); cx.shadowColor=rgb(K.a,1); cx.shadowBlur=14; cx.beginPath(); cx.arc(CX+v[0]*r,CY-v[1]*r,4.5,0,7); cx.fill(); cx.shadowBlur=0; } } });
    cx.textAlign='left'; cx.textBaseline='middle';
    loc.forEach((L,i)=>{ const v=rot(L,yaw,pitch); if(v[2]<0) return; const x=CX+v[0]*r, y=CY-v[1]*r, a=Math.min(1,v[2]*2.5)*intro, pul=o.still?2:(tt*1.2+i)%1.6;
      cx.fillStyle=rgb(i?K.b:K.a,a); cx.beginPath(); cx.arc(x,y,i?6:9,0,7); cx.fill();
      if(pul<1){ cx.strokeStyle=rgb(i?K.b:K.a,(1-pul)*a*.8); cx.lineWidth=2; cx.beginPath(); cx.arc(x,y,(i?6:9)+pul*26,0,7); cx.stroke(); }
      if(P[i].l){ cx.font='600 '+(i?20:24)+'px '+K.fb; cx.fillStyle=rgb(K.t,a); cx.fillText(P[i].l,x+16,y-14); } });
  }
  function frame(now){ if(!alive) return; if(t0==null) t0=now; draw((now-t0)/1000); raf=requestAnimationFrame(frame); }
  if(o.still) draw(5); else raf=requestAnimationFrame(frame);
  return {kill(){ alive=false; cancelAnimationFrame(raf); }};
}
/* logo em partículas extrudadas, girando */
function run3dLogo(cv,cfg,o){
  const W=cv.width,H=cv.height,cx=cv.getContext('2d'),K=V3.colors(cv);
  let pts=null, col=null, n=0, scat=null, alive=true, raf=0, t0=null;
  function setPts(arr,cols){ n=arr.length/3; pts=arr; col=cols; scat=new Float32Array(n*3); for(let i=0;i<n;i++){ const a=Math.random()*6.28, b=Math.acos(2*Math.random()-1), d=500+Math.random()*700; scat[i*3]=Math.sin(b)*Math.cos(a)*d; scat[i*3+1]=Math.cos(b)*d; scat[i*3+2]=Math.sin(b)*Math.sin(a)*d; } }
  function fromWord(){ const w=ptsWord(cfg.word||'•',K.fd,5200); const m=w.length/3, out=new Float32Array(m*6), cols=[]; for(let i=0;i<m;i++){ out[i*6]=w[i*3]*.75; out[i*6+1]=w[i*3+1]*.75+40; out[i*6+2]=-22; out[i*6+3]=w[i*3]*.75; out[i*6+4]=w[i*3+1]*.75+40; out[i*6+5]=22; const c=i%5?K.a:K.b; cols.push(c,c); } setPts(out,cols); }
  function fromImage(img){ const S=260, c=document.createElement('canvas'); c.width=c.height=S; const x=c.getContext('2d'); const k=Math.min(S/img.width,S/img.height); const w=img.width*k,h=img.height*k; x.drawImage(img,(S-w)/2,(S-h)/2,w,h);
    let px; try{ px=x.getImageData(0,0,S,S).data; }catch(_){ return; }
    const A=(i,j)=>i<0||j<0||i>=S||j>=S?0:px[(j*S+i)*4+3]; const out=[], cols=[]; let opaque=0; for(let j=0;j<S;j++) for(let i=0;i<S;i++) if(A(i,j)>120) opaque++;
    const solid=opaque>S*S*.9; // imagem sem transparência: separa pelo contraste com o canto
    const on=(i,j)=>{ if(i<0||j<0||i>=S||j>=S) return false; const q=(j*S+i)*4; if(!solid) return A(i,j)>120; const l=(px[q]+px[q+1]+px[q+2])/3; return Math.abs(l-(px[0]+px[1]+px[2])/3)>40; };
    let cnt=0; for(let j=0;j<S;j++) for(let i=0;i<S;i++) if(on(i,j)) cnt++;
    const step=Math.max(2,Math.round(Math.sqrt(cnt/2600)));
    for(let j=0;j<S;j+=step) for(let i=0;i<S;i+=step){ if(!on(i,j)) continue; const q=(j*S+i)*4, c3=[px[q],px[q+1],px[q+2]]; const edge=!on(i-step,j)||!on(i+step,j)||!on(i,j-step)||!on(i,j+step);
      const X=(i-S/2)*2.3, Y=(S/2-j)*2.3+40; const layers=edge?[-30,-15,0,15,30]:[-30,30]; layers.forEach(z=>{ out.push(X,Y,z); cols.push(z===-30||z===30?c3:c3.map(v=>v*.6)); }); }
    if(!out.length) return; setPts(new Float32Array(out),cols); t0=null; }
  fromWord();
  if(cfg.src){ const img=new Image(); img.onload=()=>{ if(alive){ fromImage(img); if(o.still) draw(9); } }; img.src=cfg.src; }
  function draw(tt){
    cx.clearRect(0,0,W,H); if(!pts) return;
    const p=o.still?1:V3.ease(Math.min(1,Math.max(0,(tt-.2)/2.6)));
    const spin=(1-p)*Math.PI*3;
    const cam={yaw:spin+Math.sin(tt*.55)*.55,pitch:Math.sin(tt*.35)*.12,f:1200,dist:700,cx:W/2,cy:H*.42};
    const order=[];
    for(let i=0;i<n;i++){ const k=i*3, x=scat[k]+(pts[k]-scat[k])*p, y=scat[k+1]+(pts[k+1]-scat[k+1])*p, z=scat[k+2]+(pts[k+2]-scat[k+2])*p; const q=V3.proj(x,y,z,cam); if(q[2]<=0) continue; order.push([q[3],q[0],q[1],q[2],i]); }
    order.sort((a,b)=>b[0]-a[0]);
    for(const [z,x,y,s,i] of order){ const c=col[i], l=Math.min(1.25,.55+.6*s); cx.fillStyle='rgb('+(Math.min(255,c[0]*l)|0)+','+(Math.min(255,c[1]*l)|0)+','+(Math.min(255,c[2]*l)|0)+')'; const r=Math.max(1.6,3.2*s); cx.fillRect(x-r/2,y-r/2,r,r); }
  }
  function frame(now){ if(!alive) return; if(t0==null) t0=now; draw((now-t0)/1000); raf=requestAnimationFrame(frame); }
  if(o.still) draw(9); else raf=requestAnimationFrame(frame);
  return {kill(){ alive=false; cancelAnimationFrame(raf); }};
}
/* túnel em alta velocidade */
function run3dTunnel(cv,cfg,o){
  const W=cv.width,H=cv.height,cx=cv.getContext('2d'),K=V3.colors(cv); const st=cfg.style||'aneis';
  const rgb=(c,a)=>'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
  const RINGS=34, GAP=150, SEG=st==='grade'?24:56, F=520; let z0=0, alive=true, raf=0, t0=null, last=0;
  const stars=Array.from({length:700},()=>({a:Math.random()*6.28,r:120+Math.random()*700,z:Math.random()*RINGS*GAP}));
  function draw(tt,dt){
    const speed=o.still?0:(1700*Math.exp(-tt*.9)+140); z0=(z0+speed*dt)%GAP;
    cx.globalCompositeOperation='destination-out'; cx.fillStyle='rgba(0,0,0,'+(st==='estrelas'?.35:.6)+')'; cx.fillRect(0,0,W,H); cx.globalCompositeOperation=K.light?'source-over':'lighter';
    const swx=Math.sin(tt*.4)*60, swy=Math.cos(tt*.31)*40, CX=W/2, CY=H/2;
    if(st==='estrelas'){ stars.forEach(s=>{ s.z-=speed*dt; if(s.z<20) s.z+=RINGS*GAP; const k=F/s.z, k2=F/(s.z+speed*.05+8); const x=Math.cos(s.a)*s.r, y=Math.sin(s.a)*s.r;
      cx.strokeStyle=rgb(s.r%3<1?K.b:K.a,Math.min(1,k*1.2)); cx.lineWidth=Math.max(1,k*2.2); cx.beginPath(); cx.moveTo(CX+(x+swx)*k,CY+(y+swy)*k); cx.lineTo(CX+(x+swx)*k2,CY+(y+swy)*k2); cx.stroke(); }); }
    else for(let r=RINGS-1;r>=0;r--){ const z=r*GAP-z0+40; if(z<30) continue; const k=F/z, a=Math.min(1,k*1.4)*(1-r/RINGS), tw=r*.09+tt*.15, rad=520;
      const c=r%4===0?K.b:K.a; cx.strokeStyle=rgb(c,a*.9); cx.fillStyle=rgb(c,a); cx.lineWidth=Math.max(.6,k*2.4);
      if(st==='grade'){ cx.beginPath(); for(let i=0;i<=SEG;i++){ const an=i/SEG*6.283+tw; const x=CX+(Math.cos(an)*rad+swx)*k, y=CY+(Math.sin(an)*rad*.62+swy)*k; i?cx.lineTo(x,y):cx.moveTo(x,y); } cx.stroke();
        const kn=F/(z+GAP); for(let i=0;i<SEG;i+=2){ const an=i/SEG*6.283+tw; cx.beginPath(); cx.moveTo(CX+(Math.cos(an)*rad+swx)*k,CY+(Math.sin(an)*rad*.62+swy)*k); cx.lineTo(CX+(Math.cos(an+.09)*rad+swx)*kn,CY+(Math.sin(an+.09)*rad*.62+swy)*kn); cx.stroke(); } }
      else for(let i=0;i<SEG;i++){ const an=i/SEG*6.283+tw; const x=CX+(Math.cos(an)*rad+swx)*k, y=CY+(Math.sin(an)*rad*.62+swy)*k, s=Math.max(1.4,k*5); cx.fillRect(x-s/2,y-s/2,s,s); } }
    cx.globalCompositeOperation='source-over';
  }
  function frame(now){ if(!alive) return; if(t0==null){ t0=now; last=now; } const tt=(now-t0)/1000, dt=Math.min(.05,(now-last)/1000); last=now; draw(tt,dt); raf=requestAnimationFrame(frame); }
  if(o.still){ cx.clearRect(0,0,W,H); draw(4,0); } else raf=requestAnimationFrame(frame);
  return {kill(){ alive=false; cancelAnimationFrame(raf); }};
}
/* liga/desliga os canvases 3D de um slide */
function start3D(sl,o={}){ return [...sl.querySelectorAll('canvas.dk-3d')].map(cv=>{ let cfg={}; try{ cfg=JSON.parse(cv.dataset.cfg||'{}'); }catch(_){} return ({bars:run3dBars,globe:run3dGlobe,logo:run3dLogo,tunnel:run3dTunnel}[cv.dataset.kind]||run3dParticles)(cv,cfg,o); }); }

/* ---------- faixa de cabeçalho (deck.header = {on, image, text, logo}) ---------- */
const NOHEAD=['capa','mergulho','revelar','paralaxe','video'];
function headShown(deck,s){ const h=deck.header; if(!h||!h.on||!s) return false; if(s.head==='show') return true; if(s.head==='hide') return false; return !NOHEAD.includes(s.t); }
function bandHTML(deck,t){ const h=deck.header; if(!h||!h.on) return '';
  return `<div class="dk-band" aria-hidden="true">${h.image?`<img class="dk-band-bg" src="${im(h.image)}" alt="">`:''}<div class="dk-band-in"><span>${esc(h.text||deck.name||'')}</span>${h.logo!==false&&t.logo?`<img src="${im(t.logo)}" alt="">`:''}</div></div>`; }

function slideHTML(deck,i,t){
  const s=deck.slides[i]; const T=TEMPLATES[s&&s.t]||TEMPLATES.destaque;
  let inner=''; try{ inner=T.render(Object.assign({},s.d||{}),t); }catch(e){ inner=`<p class="dk-lead">Erro neste slide: ${esc(e.message)}</p>`; }
  return `<section class="dk-slide dk-t-${esc(s.t)}${headShown(deck,s)?' with-head':''}" data-i="${i}" aria-label="Slide ${i+1}">${inner}</section>`;
}
function footHTML(deck,t,i){
  if(deck.footer===false) return '';
  const n=deck.slides.length;
  return `<div class="dk-foot" aria-hidden="true">${t.logo?`<img src="${im(t.logo)}" alt="">`:'<span></span>'}<span>${esc(deck.footerText||deck.name||'')}</span><span class="dk-pg">${String(i+1).padStart(2,'0')} / ${String(n).padStart(2,'0')}</span></div>`;
}

/* ---------- títulos em palavras ---------- */
function splitWords(root){
  root.querySelectorAll('[data-a="words"]').forEach(h=>{
    const walk=node=>{[...node.childNodes].forEach(n=>{
      if(n.nodeType===3){const f=document.createDocumentFragment();n.textContent.split(/(\s+)/).forEach(tk=>{if(!tk)return;if(/^\s+$/.test(tk)){f.appendChild(document.createTextNode(' '));return;}const s=document.createElement('span');s.className='dk-w';s.textContent=tk;f.appendChild(s);});n.replaceWith(f);}
      else if(n.nodeType===1&&n.tagName!=='BR'&&!n.classList.contains('dk-code')) walk(n);});};
    walk(h);
  });
}

/* ---------- animações ---------- */
const fmtN=(v,dec)=>v.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
/* estilos de entrada por slide: padrao | suave | dinamico */
const ANIMS={padrao:'Padrão (completa)',suave:'Suave (só aparece)',dinamico:'Dinâmica (mais movimento)',nenhuma:'Sem animação'};
const TRANSITIONS={magico:'Movimento mágico (elementos viajam)',deslizar:'Deslizar',fade:'Esmaecer',zoom:'Zoom',subir:'Subir',voo:'Voo pela tela infinita (estilo Prezi)',nenhuma:'Corte seco'};
function build(sl,G,keep,o={}){
  const style=o.anim||'padrao';
  const tl=G.timeline({defaults:{ease:'expo.out',duration:1.1}}); let at=0;
  if(style==='suave'){
    sl.querySelectorAll('[data-a]').forEach(el=>{
      if(el.closest('[data-mm]')) return;
      if(FX[el.dataset.a]){ at+=FX[el.dataset.a](el,tl,at,keep,G); return; }
      const multi=['stagger','cards','fromleft'].includes(el.dataset.a);
      tl.from(multi?el.children:el,{opacity:0,duration:.9,ease:'power2.out',stagger:multi?.08:0},at); at+=.12;
      if(el.dataset.a==='bars') tl.from(el.querySelectorAll('.dk-bar-c i'),{scaleY:0,transformOrigin:'50% 100%',stagger:.06,duration:1,ease:'power3.out'},at);
    });
  } else sl.querySelectorAll('[data-a]').forEach(el=>{
    if(el.closest('[data-mm]')) return;
    if(FX[el.dataset.a]){ at+=FX[el.dataset.a](el,tl,at,keep,G); return; }
    switch(el.dataset.a){
      case 'bars': tl.from(el.querySelectorAll('.dk-bar-c i'),{scaleY:0,transformOrigin:'50% 100%',stagger:.1,duration:1.3,ease:'power3.out'},at+.2);
        tl.from(el.querySelectorAll('.dk-bar-v, .dk-bar > span'),{opacity:0,y:20,stagger:.05,duration:.7},at+.5); at+=.3; break;
      case 'left': tl.from(el,{x:-60,opacity:0},at); at+=.12; break;
      case 'words': tl.from(el.querySelectorAll('.dk-w'),{yPercent:110,opacity:0,rotationX:-60,filter:'blur(8px)',stagger:.045,duration:1.2,transformOrigin:'50% 100%'},at); at+=.35; break;
      case 'up': tl.from(el,{y:40,opacity:0,filter:'blur(6px)'},at+.15); at+=.15; break;
      case 'logo': tl.from(el,{opacity:0,scale:.85,filter:'blur(14px)',duration:1.4},at); at+=.2; break;
      case 'hero': tl.from(el,{opacity:0,x:120,scale:1.06,filter:'blur(18px)',duration:1.8,ease:'power3.out'},.1); break;
      case 'stagger': tl.from(el.children,{y:30,opacity:0,stagger:.08,duration:.9},at+.1); at+=.2; break;
      case 'cards': G.set(el.children,{transformPerspective:1200}); tl.from(el.children,{y:70,opacity:0,rotationX:18,transformOrigin:"50% 100%",force3D:true,stagger:.12,duration:1.3,ease:"power3.out",clearProps:"transform,opacity"},at+.1);
        tl.add(()=>[...el.children].forEach((c,i)=>setTimeout(()=>c.classList.add('lit'),i*180)),at+.6); at+=.3; break;
      case 'node': tl.from(el,{y:50,opacity:0,scale:.92,duration:.9},at); at+=.22; break;
      case 'arrow': tl.from(el,{scaleX:0,duration:.5,ease:'power2.out'},at-.1); break;
      case 'chain': tl.fromTo(el.querySelector('.ch-line'),{attr:{'stroke-dashoffset':860}},{attr:{'stroke-dashoffset':0},duration:1.6,ease:'power2.inOut'},at);
        tl.from(el.querySelectorAll('.ch-n'),{opacity:0,y:12,stagger:1.6/Math.max(1,el.querySelectorAll('.ch-n').length),duration:.6},at);
        tl.fromTo(el.querySelector('.ch-p'),{attr:{cx:20}},{attr:{cx:880},duration:1.6,ease:'power2.inOut'},at); at+=.3; break;
      case 'fromleft': tl.from(el.children,{x:-80,opacity:0,stagger:.12},at); break;
      case 'fromright': tl.from(el,{x:80,opacity:0},at+.3); break;
      case 'hub': tl.from(el.querySelector('.dk-core'),{scale:0,rotation:-90,duration:1.3,ease:'back.out(1.6)'},at); at+=.3; break;
      case 'screen': G.set(el,{transformPerspective:1600}); tl.from(el,{y:90,opacity:0,rotationY:-14,rotationX:8,scale:.94,force3D:true,duration:1.6,ease:'power3.out',clearProps:"transform,opacity"},at);
        { const r=el.querySelectorAll('.mk-bars rect'); if(r.length) tl.from(r,{scaleY:0,transformOrigin:'50% 100%',transformBox:'fill-box',stagger:.02,duration:.7,ease:'power3.out'},at+.6);
          const li=el.querySelectorAll('.mk-li'); if(li.length) tl.from(li,{x:40,opacity:0,stagger:.08,duration:.6},at+.7); }
        at+=.25; break;
      case 'peek': tl.from(el,{y:160,opacity:0,rotation:-8,duration:1.2,ease:'back.out(1.4)'},at+.5); break;
      case 'timeline': tl.from(el.querySelector('.dk-tl-line'),{scaleX:0,duration:1.6,ease:'power2.inOut'},at);
        tl.from(el.querySelectorAll('.dk-ev'),{y:40,opacity:0,stagger:.22,duration:.9},at+.2); at+=.3; break;
    }
  });
  sl.querySelectorAll('[data-count]').forEach(el=>{
    if(el.closest('[data-mm]')) return;
    const end=parseFloat(el.dataset.count), dec=+el.dataset.dec||0, o={v:0};
    tl.to(o,{v:end,duration:1.8,ease:'power3.out',onUpdate:()=>el.textContent=fmtN(o.v,dec)},.5);
  });
  const fl=sl.querySelector('[data-float]'); if(fl) tl.to(fl,{y:-14,duration:3,yoyo:true,repeat:-1,ease:'sine.inOut'},2);
  keep.push(...hubLoops(sl,G));
  if(style==='dinamico') G.set(sl,{transformPerspective:1600}); tl.from(sl,{scale:1.08,rotationX:7,y:40,transformOrigin:'50% 60%',duration:1.8,ease:'expo.out'},0); // câmera se aproximando
  if(o.speed) tl.timeScale(tl.timeScale()*o.speed);
  return tl;
}
function hubLoops(sl,G){
  const out=[]; const svg=sl.querySelector('.dk-hub svg'); if(!svg) return out;
  svg.querySelectorAll('.pz').forEach(n=>n.remove());
  [...svg.querySelectorAll('.feed')].forEach((path,i)=>{
    const L=path.getTotalLength(); path.style.strokeDasharray=L; path.style.strokeDashoffset=L;
    out.push(G.to(path,{strokeDashoffset:0,duration:1,delay:.5+i*.15,ease:'power2.inOut'}));
    const out1=path.classList.contains('out');
    for(let j=0;j<3;j++){
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('r',6);c.setAttribute('class','pz');c.setAttribute('fill',out1?'var(--ok)':'var(--accent)');c.style.filter='drop-shadow(0 0 6px var(--accent))';c.setAttribute('cx',-50);
      svg.appendChild(c); const o={d:0};
      out.push(G.to(o,{d:1,duration:2.2,repeat:-1,ease:'none',delay:1.4+j*.73+i*.2,onUpdate:()=>{const p=path.getPointAtLength(o.d*L);c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);}}));
    }
  });
  const r1=sl.querySelector('.r1'),r2=sl.querySelector('.r2');
  if(r1) out.push(G.to(r1,{rotation:360,duration:30,repeat:-1,ease:'none'}));
  if(r2) out.push(G.fromTo(r2,{scale:.9,opacity:.2},{scale:1.08,opacity:.6,duration:2.4,yoyo:true,repeat:-1,ease:'sine.inOut'}));
  return out;
}

/* ---------- fundo vivo ---------- */
function background(cv,t,reduce){
  const cx=cv.getContext('2d'); const a=hex2rgb(t.accent); const light=!!t.light; const kind=t.background||'fibras';
  let W=0,H=0,dpr=1,raf=0,alive=true; const cam={x:0,amp:1}; const t0=performance.now();
  const parts=[...Array(70)].map(()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.8+.4,s:Math.random()*.02+.005,p:Math.random()*6,vx:(Math.random()-.5)*.02,vy:(Math.random()-.5)*.02}));
  const rgba=al=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;
  /* fundos premium: usam destaque, alerta e positivo do tema */
  const b2=hex2rgb(t.alert), c2=hex2rgb(t.ok), PAL=[a,b2,c2];
  const col=(c,al)=>`rgba(${c[0]},${c[1]},${c[2]},${al})`;
  const lo=['malha','aurora'].includes(kind)?document.createElement('canvas'):null, lx=lo&&lo.getContext('2d'); // desenha em baixa resolução e amplia: desfoque natural e barato
  const bok=[...Array(26)].map((_,i)=>({x:Math.random(),y:Math.random(),r:Math.random()*.08+.025,s:Math.random()*.015+.004,p:Math.random()*6,c:PAL[i%3],o:Math.random()*.5+.35}));
  function size(){ const r=cv.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,1.5); W=cv.width=Math.max(2,r.width*dpr); H=cv.height=Math.max(2,r.height*dpr); if(lo){ lo.width=Math.max(2,Math.round(W/8)); lo.height=Math.max(2,Math.round(H/8)); } }
  const ro=new ResizeObserver(size); ro.observe(cv); size();
  function draw(now){
    if(!alive) return; const tt=(now-t0)/1000;
    cx.clearRect(0,0,W,H);
    const g=cx.createRadialGradient(W*.62,H*.45,0,W*.62,H*.45,W*.7);
    g.addColorStop(0,rgba(light?.10:.30));g.addColorStop(1,rgba(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);
    cx.globalCompositeOperation=light?'source-over':'lighter';
    if(kind==='fibras'){
      for(let k=0;k<9;k++){ cx.beginPath(); const off=k*.7, base=H*(.3+k*.05), A=H*.09*cam.amp*(1+k*.08);
        for(let x=0;x<=W;x+=W/80){const u=x/W;const y=base+Math.sin(u*5+tt*.35+off+cam.x)*A+Math.sin(u*11-tt*.2+k)*A*.25;x?cx.lineTo(x,y):cx.moveTo(x,y);}
        cx.strokeStyle=rgba((light?.06:.05)+k*.012);cx.lineWidth=(1+k*.15)*dpr;cx.stroke(); }
    } else if(kind==='grade'){
      const hz=H*.58, sp=(tt*.25+cam.x*.3)%1;
      cx.strokeStyle=rgba(light?.12:.16); cx.lineWidth=dpr;
      for(let i=-24;i<=24;i++){cx.beginPath();cx.moveTo(W/2+i*W*.02,hz);cx.lineTo(W/2+i*W*.16*cam.amp,H);cx.stroke();}
      for(let j=0;j<16;j++){const z=(j+sp)/16, y=hz+(H-hz)*z*z; cx.strokeStyle=rgba((light?.14:.2)*z); cx.beginPath();cx.moveTo(0,y);cx.lineTo(W,y);cx.stroke();}
    } else if(kind==='particulas'){
      const P=parts.map(p=>({x:((p.x+Math.sin(tt*p.s*3+p.p)*.03+cam.x*.01)%1+1)%1*W,y:(p.y+Math.cos(tt*p.s*2+p.p)*.03)*H}));
      for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const dx=P[i].x-P[j].x,dy=P[i].y-P[j].y,d=Math.hypot(dx,dy)/dpr; if(d<160){cx.strokeStyle=rgba((1-d/160)*(light?.18:.22));cx.lineWidth=dpr;cx.beginPath();cx.moveTo(P[i].x,P[i].y);cx.lineTo(P[j].x,P[j].y);cx.stroke();}}
    } else if(kind==='malha'){ // manchas de cor se misturando
      const w=lo.width,h=lo.height; lx.clearRect(0,0,w,h); lx.globalCompositeOperation=light?'source-over':'lighter';
      [[.22,.28,a],[.78,.3,b2],[.45,.82,c2],[.88,.78,a]].forEach(([bx,by,c],i)=>{ const x=(bx+Math.sin(tt*.13+i*1.7+cam.x*.15)*.2)*w, y=(by+Math.cos(tt*.11+i*2.3)*.18)*h, r=Math.max(w,h)*(.42+.08*Math.sin(tt*.2+i));
        const gg=lx.createRadialGradient(x,y,0,x,y,r); gg.addColorStop(0,col(c,light?.30:.45)); gg.addColorStop(1,col(c,0)); lx.fillStyle=gg; lx.fillRect(0,0,w,h); });
      cx.imageSmoothingEnabled=true; cx.drawImage(lo,0,0,W,H);
    } else if(kind==='aurora'){ // cortinas de luz ondulando
      const w=lo.width,h=lo.height; lx.clearRect(0,0,w,h); lx.globalCompositeOperation=light?'source-over':'lighter';
      for(let k=0;k<3;k++){ const c=PAL[k], base=h*(.34+k*.11);
        for(let x=0;x<=w;x+=1){ const u=x/w; const y=base+Math.sin(u*3.2+tt*.25+k*1.3+cam.x*.4)*h*.12+Math.sin(u*7.1-tt*.18+k)*h*.04; const hg=h*(.26+.12*Math.sin(u*4+tt*.3+k*2));
          const gg=lx.createLinearGradient(0,y-hg,0,y+hg*.15); gg.addColorStop(0,col(c,0)); gg.addColorStop(.78,col(c,light?.16:.25)); gg.addColorStop(1,col(c,0)); lx.fillStyle=gg; lx.fillRect(x,y-hg,1.6,hg*1.15); } }
      cx.imageSmoothingEnabled=true; cx.drawImage(lo,0,0,W,H);
    } else if(kind==='topografia'){ // curvas de nível respirando
      const ox=W*(.64+cam.x*.012), oy=H*.5, R=Math.max(W,H); cx.lineWidth=dpr;
      for(let k=1;k<=22;k++){ const r0=k*R*.045; cx.beginPath();
        for(let s=0;s<=96;s++){ const an=s/96*6.2832; const rr=r0*(1+.08*Math.sin(an*3+tt*.3+k*.4)+.05*Math.sin(an*5-tt*.22+k*.7)); const x=ox+Math.cos(an)*rr, y=oy+Math.sin(an)*rr*.72; s?cx.lineTo(x,y):cx.moveTo(x,y); }
        cx.closePath(); cx.strokeStyle=rgba((light?.15:.17)*(1-k/26)+(k%5===0?.07:0)); cx.stroke(); }
    } else if(kind==='pontos'){ // grade de pontos com onda passando
      const sp=30*dpr, ox=((cam.x*40*dpr)%sp+sp)%sp, wx=W*(.5+.3*Math.sin(tt*.15)), wy=H*(.5+.3*Math.cos(tt*.12));
      cx.fillStyle=rgba(light?.32:.5); cx.beginPath();
      for(let y=sp/2;y<H;y+=sp) for(let x=sp/2-ox;x<W+sp;x+=sp){ const d=Math.hypot(x-wx,y-wy)/dpr; const v=.5+.5*Math.sin(d*.018-tt*1.6); const r=(.5+v*v*2.3)*dpr*cam.amp; cx.moveTo(x+r,y); cx.arc(x,y,r,0,6.2832); }
      cx.fill();
    } else if(kind==='luz'){ // feixes de luz volumétrica
      const ox=W*(-.04+cam.x*.012), oy=-H*.18, len=Math.hypot(W,H)*1.25;
      for(let k=0;k<6;k++){ const ang=.5+k*.14+Math.sin(tt*.15+k*1.7)*.05, wd=.03+.018*Math.sin(tt*.3+k*2);
        const gg=cx.createLinearGradient(ox,oy,ox+Math.cos(ang)*len*.8,oy+Math.sin(ang)*len*.8); gg.addColorStop(0,rgba(light?.13:.2)); gg.addColorStop(1,rgba(0));
        cx.fillStyle=gg; cx.beginPath(); cx.moveTo(ox,oy); cx.lineTo(ox+Math.cos(ang-wd)*len,oy+Math.sin(ang-wd)*len); cx.lineTo(ox+Math.cos(ang+wd)*len,oy+Math.sin(ang+wd)*len); cx.closePath(); cx.fill(); }
    } else if(kind==='bokeh'){ // luzes desfocadas flutuando
      bok.forEach(b=>{ const x=((b.x+Math.sin(tt*b.s*4+b.p)*.04+cam.x*.03)%1+1)%1*W, y=((b.y-tt*b.s*.6)%1+1)%1*H, r=b.r*Math.max(W,H)*(1+.1*Math.sin(tt+b.p));
        const o=b.o*(light?.3:.45)*(.7+.3*Math.sin(tt*.7+b.p)); const gg=cx.createRadialGradient(x,y,r*.5,x,y,r);
        gg.addColorStop(0,col(b.c,o*.5)); gg.addColorStop(.86,col(b.c,o*.75)); gg.addColorStop(1,col(b.c,0)); cx.fillStyle=gg; cx.beginPath(); cx.arc(x,y,r,0,6.2832); cx.fill(); });
    }
    if(['fibras','grade','particulas','luz'].includes(kind)) parts.forEach(p=>{ const x=((p.x+tt*p.s*.3+cam.x*.02)%1)*W, y=(p.y*H)+Math.sin(tt+p.p)*10*dpr;
      cx.beginPath();cx.arc(x,y,p.r*dpr,0,7);cx.fillStyle=light?rgba(.25+.2*Math.sin(tt*2+p.p)):`rgba(${Math.min(255,a[0]+90)},${Math.min(255,a[1]+70)},${Math.min(255,a[2]+40)},${.35+.35*Math.sin(tt*2+p.p)})`;cx.fill(); });
    cx.globalCompositeOperation='source-over';
    if(!reduce) raf=requestAnimationFrame(draw);
  }
  raf=requestAnimationFrame(draw);
  return {cam,stop(){alive=false;cancelAnimationFrame(raf);ro.disconnect();}};
}

/* ---------- player ---------- */
function createPlayer(root,deck,opts={}){
  const G=window.gsap, reduce=matchMedia('(prefers-reduced-motion: reduce)').matches||opts.noMotion;
  const t=themeOf(deck); ensureFonts([t.fontDisplay,t.fontBody], root.ownerDocument);
  root.innerHTML=`<div class="dk-player" style='${themeVars(t)}'><canvas class="dk-bg" aria-hidden="true"></canvas><div class="dk-vig"></div><div class="dk-vp"><div class="dk-stage">${deck.slides.map((_,i)=>slideHTML(deck,i,t)).join('')}${bandHTML(deck,t)}${footHTML(deck,t,0)}</div></div></div>`;
  const player=root.firstElementChild, stage=player.querySelector('.dk-stage'), slides=[...stage.querySelectorAll('.dk-slide')];
  splitWords(stage);
  const bg=background(player.querySelector('.dk-bg'),t,reduce);
  function fit(){const r=player.getBoundingClientRect(); if(!r.width) return; const s=Math.min(r.width/1920,r.height/1080);stage.style.transform=`translate(-50%,-50%) scale(${s})`;}
  const ro=new ResizeObserver(fit); ro.observe(player); fit();
  let cur=-1,busy=false,tl=null,loops=[],autoT=null;
  const kill=()=>{ if(tl) tl.kill(); loops.forEach(l=>l.kill()); loops=[]; tl=null; };
  const tame=sl=>sl.querySelectorAll('video').forEach(v=>{ v.removeAttribute('autoplay'); v.pause(); });
  slides.forEach(tame);
  const videos=(sl,on)=>sl.querySelectorAll('video').forEach(v=>{ if(on){ try{v.currentTime=0;}catch(_){} v.play().catch(()=>{}); } else v.pause(); });
  const pgTxt=n=>{ const pg=stage.querySelector('.dk-pg'); if(pg) pg.textContent=String(n+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0'); };
  const S=n=>deck.slides[n]||{};
  /* avanço automático: deck.auto={secs,loop}; slide.dur sobrescreve */
  function arm(n){
    clearTimeout(autoT); if(!opts.autoplay) return;
    const a=deck.auto||{}; let secs=+S(n).dur||+a.secs||0; if(secs<=0) return;
    if(!S(n).dur && tl) secs=Math.max(secs,Math.min(tl.duration(),60)+1); // espera animações longas (ex.: Mergulho 3D)
    autoT=setTimeout(()=>{ if(next()===false){ if(a.loop){ const f=visNext(-1,1); go(f<0?0:f,1); } else opts.onEnd&&opts.onEnd(); } },secs*1000);
  }
  /* recria o slide do zero a cada entrada: animação interrompida nunca deixa elemento torto */
  function fresh(n){ const tmp=document.createElement('div'); tmp.innerHTML=slideHTML(deck,n,t); const ns=tmp.firstElementChild; splitWords(ns); tame(ns); slides[n].replaceWith(ns); slides[n]=ns; return ns; }
  /* slides ocultos: só abrem por link (OnePage) e voltam para quem chamou */
  let backTo=null; const hid=n=>!!S(n).hidden;
  const visNext=(n,d)=>{ let j=n+d; while(j>=0&&j<slides.length&&hid(j)) j+=d; return j>=0&&j<slides.length?j:-1; };
  const band=stage.querySelector('.dk-band');
  const backBtn=document.createElement('button'); backBtn.className='dk-back'; backBtn.type='button'; backBtn.textContent='← Voltar ao resumo'; backBtn.hidden=true;
  if(opts.links) stage.appendChild(backBtn);
  backBtn.addEventListener('click',e=>{ e.stopPropagation(); if(backTo!=null){ const b=backTo; backTo=null; go(b,-1); } });
  if(opts.links) stage.addEventListener('click',e=>{ const el=e.target.closest('[data-go]'); if(!el) return; e.stopPropagation(); e.preventDefault(); link(el.dataset.go); });
  function link(id){ const j=deck.slides.findIndex(s=>s.id===id); if(j<0||j===cur) return; if(!hid(cur)) backTo=cur; go(j,1); }
  function next(){ if(hid(cur)&&backTo!=null){ const b=backTo; backTo=null; return go(b,1); } const j=visNext(cur,1); if(j>=0) go(j,1); else return false; }
  function prev(){ if(hid(cur)&&backTo!=null){ const b=backTo; backTo=null; return go(b,-1); } const j=visNext(cur,-1); if(j>=0) go(j,-1); }
  function enter(n,pre,delay){
    const sl=pre||fresh(n); sl.classList.add('on'); videos(sl,true);
    if(band) band.classList.toggle('on',headShown(deck,S(n)));
    backBtn.hidden=!(hid(n)&&backTo!=null);
    if(G && !reduce && S(n).anim!=='nenhuma'){ G.set(sl,{clearProps:'all'}); tl=build(sl,G,loops,{anim:S(n).anim,speed:+S(n).speed||0}); if(delay) tl.delay(delay);
      sl.querySelectorAll('.dk-ico').forEach((ic,i)=>tl.fromTo(ic.querySelectorAll('path,circle'),{attr:{'stroke-dashoffset':1}},{attr:{'stroke-dashoffset':0},duration:1.4,stagger:.15,ease:'power2.inOut'},.45+i*.2)); }
    else if(G) loops=hubLoops(sl,G);
    loops.push(...start3D(sl,{still:reduce}));
    pgTxt(n); arm(n);
  }
  const EXIT={deslizar:d=>({opacity:0,x:-d*80,scale:.97,filter:'blur(10px)'}),fade:()=>({opacity:0}),zoom:()=>({opacity:0,scale:1.12,filter:'blur(14px)'}),subir:d=>({opacity:0,y:-d*90,filter:'blur(8px)'})};
  function go(n,dir,instant){
    if(!slides.length) return; n=Math.max(0,Math.min(slides.length-1,n));
    if(busy) return; if(n===cur && !instant) return;
    dir=dir||(n>cur?1:-1); const prev=slides[cur]; const tr=S(dir>0?n:cur).tr||deck.tr||'deslizar';
    const done=()=>{ if(prev&&prev!==slides[n]){prev.classList.remove('on'); videos(prev,false); if(G) G.set(prev,{clearProps:'all'});} kill(); enter(n); cur=n; busy=false; opts.onChange&&opts.onChange(n); };
    const anim=G && !reduce && !instant && tr!=='nenhuma';
    if(anim){ G.to(bg.cam,{x:bg.cam.x+dir*1.4,duration:1.6,ease:'power3.inOut'}); G.fromTo(bg.cam,{amp:1},{amp:1.6,duration:.6,yoyo:true,repeat:1,ease:'sine.inOut'}); }
    if(prev && anim && prev!==slides[n] && tr==='voo'){ busy=true; if(tl) tl.pause(); return fly(prev,cur,n); }
    if(prev && anim && prev!==slides[n] && tr==='magico'){ busy=true; if(tl) tl.pause(); if(magic(prev,n)) return; }
    if(prev && anim && prev!==slides[n]){ busy=true; if(tl) tl.pause(); G.to(prev,Object.assign((EXIT[tr]||EXIT.fade)(dir),{duration:.45,ease:'power2.in',onComplete:done})); }
    else done();
  }
  /* ---------- tela infinita: todos os slides num mapa, a câmera voa de um para o outro ---------- */
  const wpos=i=>{ const c=4, col=i%c, row=Math.floor(i/c); return {x:col*2500, y:row*1700+(col%2)*420, r:[-4,3,-2,5,-3,2,-5,4][i%8]}; };
  function fly(pv,a,b){
    const world=document.createElement('div'); world.className='dk-world'; stage.appendChild(world);
    deck.slides.forEach((_,j)=>{ let el; if(j===a){ el=pv.cloneNode(true); } else { const tmp=document.createElement('div'); tmp.innerHTML=slideHTML(deck,j,t); el=tmp.firstElementChild; }
      el.classList.add('on','dk-tile'); if(j!==a&&j!==b) el.classList.add('dim'); const q=wpos(j); el.removeAttribute('style'); Object.assign(el.style,{left:q.x+'px',top:q.y+'px',transform:'rotate('+q.r+'deg)'}); world.appendChild(el); });
    world.querySelectorAll('video').forEach(v=>{ v.removeAttribute('autoplay'); v.pause(); });
    const A=wpos(a), B=wpos(b), cam={x:A.x+960,y:A.y+540,r:A.r,s:1};
    const put=()=>{ world.style.transform='translate(960px,540px) scale('+cam.s+') rotate('+(-cam.r)+'deg) translate('+(-cam.x)+'px,'+(-cam.y)+'px)'; }; put();
    pv.classList.remove('on'); videos(pv,false);
    const dist=Math.hypot(B.x-A.x,B.y-A.y), low=Math.max(.2,Math.min(.5,1500/(dist+1500)*.62));
    const ft=G.timeline({onUpdate:put,onComplete:()=>{ G.set(pv,{clearProps:'all'}); kill(); enter(b); cur=b; G.to(world,{opacity:0,duration:.45,ease:'power1.out',onComplete:()=>world.remove()}); busy=false; opts.onChange&&opts.onChange(b); }});
    ft.to(cam,{x:B.x+960,y:B.y+540,r:B.r,duration:1.9,ease:'power2.inOut'},0).to(cam,{s:low,duration:.95,ease:'power2.out'},0).to(cam,{s:1,duration:.95,ease:'power2.in'},.95);
    return true;
  }
  /* ---------- movimento mágico: elementos equivalentes viajam de um slide para o outro ---------- */
  function magic(pv,n){
    const nx=fresh(n); nx.classList.add('on');
    const sr=stage.getBoundingClientRect(), sc=sr.width/1920||1;
    const R=el=>{ const r=el.getBoundingClientRect(); return {x:(r.left-sr.left)/sc,y:(r.top-sr.top)/sc,w:Math.max(1,r.width/sc),h:Math.max(1,r.height/sc)}; };
    const vis=el=>{ const r=el.getBoundingClientRect(); return r.width>2&&r.height>2; };
    const pairs=[], used=[];
    const add=(a,b)=>{ if(!a||!b||!vis(a)||!vis(b)) return; if(used.some(u=>u===a||u===b||u.contains(a)||u.contains(b)||a.contains(u)||b.contains(u))) return; used.push(a,b); pairs.push([a,b]); };
    pv.querySelectorAll('[data-f]').forEach(a=>{ let b=null; try{ b=nx.querySelector(`[data-f="${CSS.escape(a.dataset.f)}"]`); }catch(_){} add(a,b); });  // mesmo papel
    const imgs=[...nx.querySelectorAll('img')]; pv.querySelectorAll('img').forEach(a=>add(a,imgs.find(x=>x.getAttribute('src')===a.getAttribute('src')&&!used.includes(x)))); // mesma imagem
    const cnt=[...nx.querySelectorAll('[data-count]')]; pv.querySelectorAll('[data-count]').forEach(a=>add(a,cnt.find(x=>x.dataset.count===a.dataset.count&&!used.includes(x)))); // mesmo número
    if(!pairs.length){ nx.classList.remove('on'); return false; }
    const mk=src=>{ const s=document.createElement('section'); s.className=src.className+' dk-mm-ov'; stage.appendChild(s); return s; };
    const ovA=mk(pv), ovB=mk(nx);
    const clean=c=>{ [c,...c.querySelectorAll('*')].forEach(e=>{ if(e.style){ e.style.transform=''; e.style.opacity=''; e.style.filter=''; e.style.visibility=''; } e.removeAttribute('data-a'); e.removeAttribute('data-f'); }); return c; };
    const mtl=G.timeline({defaults:{duration:1,ease:'power3.inOut'}});
    pairs.forEach(([a,b])=>{ const ra=R(a), rb=R(b), ca=clean(a.cloneNode(true)), cb=clean(b.cloneNode(true));
      const typo=(src,c)=>{ const cs=getComputedStyle(src); ['fontSize','fontFamily','fontWeight','lineHeight','letterSpacing','color','textShadow','textTransform','textAlign','whiteSpace','fontVariantNumeric'].forEach(k=>{ c.style[k]=cs[k]; }); };
      typo(a,ca); typo(b,cb);
      [[ca,ra,ovA],[cb,rb,ovB]].forEach(([c,r,ov])=>{ Object.assign(c.style,{position:'absolute',left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',margin:'0',maxWidth:'none',boxSizing:'border-box',transformOrigin:'0 0'}); ov.appendChild(c); });
      const s=Math.sqrt((rb.w/ra.w)*(rb.h/ra.h)); // escala uniforme: texto não deforma
      mtl.fromTo(ca,{x:0,y:0,scale:1,opacity:1},{x:rb.x-ra.x,y:rb.y-ra.y,scale:s,opacity:0},0);
      mtl.fromTo(cb,{x:ra.x-rb.x,y:ra.y-rb.y,scale:1/s,opacity:0},{x:0,y:0,scale:1,opacity:1},0);
      a.style.visibility='hidden'; b.setAttribute('data-mm',''); b.style.visibility='hidden'; });
    mtl.to(pv,{opacity:0,duration:.45,ease:'power2.out'},0);
    mtl.eventCallback('onComplete',()=>{ ovA.remove(); ovB.remove(); pairs.forEach(([,b])=>{ b.style.visibility=''; }); pv.classList.remove('on'); videos(pv,false); G.set(pv,{clearProps:'all'}); busy=false; opts.onChange&&opts.onChange(n); });
    kill(); enter(n,nx,.45); cur=n;
    return true;
  }
  function still(n){ // mostra o slide sem animar
    n=Math.max(0,Math.min(slides.length-1,n)); slides.forEach(s=>{ s.classList.remove('on'); videos(s,false); }); kill(); fresh(n).classList.add('on'); cur=n; if(band) band.classList.toggle('on',headShown(deck,S(n)));
    pgTxt(n); videos(slides[n],true);
    if(G){ loops=hubLoops(slides[n],G); slides[n].querySelectorAll('.feed').forEach(p=>{p.style.strokeDashoffset=0;}); }
    loops.push(...start3D(slides[n],{still:reduce}));
  }
  function replay(){ const n=cur; slides[n].classList.remove('on'); kill(); enter(n); }
  /* troca só um slide (edição ao vivo, sem reconstruir o deck inteiro) */
  function update(n,nd){
    deck=nd; if(!slides[n]) return;
    fresh(n);
    if(n===cur) still(n);
  }
  go(opts.start||0,1,true);
  return {go,still,replay,update,link,next,prev,get index(){return cur;},get count(){return slides.length;},el:player,
    destroy(){kill();clearTimeout(autoT);slides.forEach(s=>videos(s,false));bg.stop();ro.disconnect();root.innerHTML='';}};
}

/* ---------- miniatura estática ---------- */
function renderStatic(root,deck,i){
  const t=themeOf(deck); ensureFonts([t.fontDisplay,t.fontBody], root.ownerDocument);
  root.innerHTML=`<div class="dk-player dk-static" style='${themeVars(t)};background:radial-gradient(ellipse at 62% 45%,${t.light?'color-mix(in srgb,'+t.accent+' 7%,'+t.bg+')':'color-mix(in srgb,'+t.accent+' 25%,'+t.bg+')'},${t.bg} 70%)'><div class="dk-vp"><div class="dk-stage">${slideHTML(deck,i,t)}${headShown(deck,deck.slides[i])?bandHTML(deck,t).replace('class="dk-band"','class="dk-band on"'):''}${footHTML(deck,t,i)}</div></div></div>`;
  const p=root.firstElementChild, st=p.querySelector('.dk-stage');
  start3D(p,{still:true});
  const fit=()=>{const r=p.getBoundingClientRect(); if(!r.width) return; st.style.transform=`translate(-50%,-50%) scale(${Math.min(r.width/1920,r.height/1080)})`;};
  fit(); const ro=new ResizeObserver(fit); ro.observe(p); return ()=>ro.disconnect();
}

window.Deck={TEMPLATES,PRESETS,FONTS,BACKGROUNDS,SHAPES,CARDS,ANIMS,TRANSITIONS,createPlayer,renderStatic,themeOf,themeVars,ensureFonts,esc,fillDefaults,
  setImageResolver(fn){resolveImage=fn;}, resolveImage:v=>resolveImage(v), ICONS,version:'2.1'};
})();

