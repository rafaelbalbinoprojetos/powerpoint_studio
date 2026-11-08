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
  claro:{name:'Claro corporativo',bg:'#eef2f7',surface:'#ffffff',accent:'#2457d6',alert:'#c26a00',ok:'#13865f',bad:'#c2334a',text:'#1d2638',title:'#0b1220',muted:'#5b6577',fontDisplay:'Bricolage Grotesque',fontBody:'Manrope',background:'particulas',light:true}
};
const FONTS=['Lexend','Manrope','Sora','Outfit','Plus Jakarta Sans','DM Sans','Archivo','Bricolage Grotesque','Fraunces','Playfair Display','Space Mono','IBM Plex Sans','Rubik','Montserrat','Poppins'];
const BACKGROUNDS={fibras:'Fibras de dados',grade:'Grade em perspectiva',particulas:'Constelação',liso:'Liso com brilho'};
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
   `--f-display:"${t.fontDisplay}",system-ui,sans-serif;--f-body:"${t.fontBody}",system-ui,sans-serif;--f-mono:"JetBrains Mono",ui-monospace,monospace;color-scheme:${light?'light':'dark'}`;
}

/* ---------- blocos comuns ---------- */
const head=(d,h='h2')=>`${d.kicker?`<div class="dk-kicker" data-a="left">${esc(d.kicker)}</div>`:''}${d.title?`<${h==='h1'?'h1':'h2'} class="dk-${h}" data-a="words">${rich(d.title)}</${h==='h1'?'h1':'h2'}>`:''}${d.lead?`<p class="dk-lead" data-a="up">${rich(d.lead)}</p>`:''}`;
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
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'numbered',t:'bool',l:'Numerar cartões'},{k:'cards',t:'items',l:'Cartões',max:4,sub:[{k:'label',t:'text',l:'Rótulo'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'}]}],
  sample:{kicker:'O desafio',title:'Três frentes para *organizar*',lead:'',numbered:false,cards:[{label:'Custos',title:'Valores claros',text:'Identificar o que precisa de análise.'},{label:'Materiais',title:'Sem duplicidade',text:'Enxergar faltas e repetições.'},{label:'Acompanhamento',title:'Visão comum',text:'Todas as áreas no mesmo painel.'}]},
  render(d){ const c=arr(d.cards).slice(0,4); return `${head(d)}<div class="dk-grid" style="${cols(Math.max(1,c.length))}" data-a="cards">${c.map((x,i)=>`<div class="dk-card">${d.numbered?`<span class="dk-num">${String(i+1).padStart(2,'0')}</span>`:''}${x.label?`<span class="dk-ix">${esc(x.label)}</span>`:''}<h3>${rich(x.title)}</h3><p>${rich(x.text)}</p></div>`).join('')}</div>`; }},
 fluxo:{name:'Fluxo',desc:'Etapas conectadas por setas que se desenham, com nota de alerta opcional',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'steps',t:'items',l:'Etapas',max:5,sub:[{k:'tag',t:'text',l:'Rótulo'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'},{k:'hot',t:'bool',l:'Destacar etapa'}]},{k:'noteTitle',t:'text',l:'Nota: destaque'},{k:'note',t:'area',l:'Nota: texto'}],
  sample:{kicker:'Papéis',title:'Como a informação *percorre*',steps:[{tag:'Origem',title:'Sistema A',text:'Fonte oficial dos dados.'},{tag:'Governança',title:'Nosso sistema',text:'Importa e analisa.',hot:true},{tag:'Gestão',title:'Decisão',text:'Apoio com contexto.'},{tag:'Histórico',title:'Registro',text:'Tudo rastreável.'}],noteTitle:'Atenção:',note:'decisões aqui não alteram o sistema de origem.'},
  render(d){ const s=arr(d.steps).slice(0,5); const tpl=s.map((_,i)=>i?'70px minmax(0,1fr)':'minmax(0,1fr)').join(' ');
    return `${head(d)}<div class="dk-flow" style="grid-template-columns:${tpl}">${s.map((x,i)=>`${i?'<div class="dk-arrow" data-a="arrow"></div>':''}<div class="dk-node${x.hot?' hot':''}" data-a="node">${x.tag?`<span class="tag">${esc(x.tag)}</span>`:''}<b>${rich(x.title)}</b><p>${rich(x.text)}</p></div>`).join('')}</div>${d.note?`<div class="dk-note" data-a="up"><svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="var(--alert)" stroke-width="3" style="flex:none"><path d="M27 5l24 42H3z"/><path d="M27 21v12M27 39v2"/></svg><p>${d.noteTitle?`<strong>${esc(d.noteTitle)}</strong> `:''}${rich(d.note)}</p></div>`:''}`; }},
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
    return `${head(d)}<div class="dk-stats" style="${cols(c)}" data-a="cards">${s.map(x=>`<div class="dk-card dk-stat"><small>${esc(x.label)}</small><div class="v" style="font-size:${fs}px">${x.prefix?`<span>${esc(x.prefix)}</span>`:''}<b${countAttr(x.value)}>${esc(x.value)}</b>${x.suffix?`<span class="suf">${esc(x.suffix)}</span>`:''}</div><p>${rich(x.text)}</p>${x.badge?`<span class="dk-badge">${esc(x.badge)}</span>`:''}</div>`).join('')}</div>`; }},
 agenda:{name:'Linha do tempo',desc:'Marcos ou rotinas numa linha que se desenha',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Subtítulo'},{k:'events',t:'items',l:'Marcos',max:5,sub:[{k:'when',t:'text',l:'Quando'},{k:'title',t:'text',l:'Título'},{k:'text',t:'area',l:'Texto'}]}],
  sample:{kicker:'Rotina',title:'A informação chega a *quem acompanha*',events:[{when:'Diariamente',title:'Gerência',text:'Resumo do dia anterior.'},{when:'Toda segunda',title:'Aprovadores',text:'Itens dentro da alçada.'},{when:'Toda quarta',title:'Alto impacto',text:'Reunião de análise.'},{when:'Início do mês',title:'Pendências',text:'Itens parados há meses.'}]},
  render(d,t){ const e=arr(d.events).slice(0,5); const cs=[t.accent,t.ok,t.alert,t.bad,t.accent];
    return `${head(d)}<div class="dk-tl" data-a="timeline"><div class="dk-tl-line"></div><div class="dk-tl-cols" style="${cols(Math.max(1,e.length))}">${e.map((x,i)=>`<div class="dk-ev" style="--c:${cs[i]}"><small>${esc(x.when)}</small><b>${rich(x.title)}</b><p>${rich(x.text)}</p></div>`).join('')}</div></div>`; }},
 imagem:{name:'Imagem',desc:'Texto à esquerda e uma imagem grande em moldura',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'lead',t:'area',l:'Texto'},{k:'bullets',t:'list',l:'Tópicos'},{k:'image',t:'image',l:'Imagem'}],
  sample:{kicker:'Na prática',title:'Como fica *no dia a dia*',lead:'Uma imagem vale pelo slide inteiro.',bullets:['Primeiro ponto','Segundo ponto'],image:''},
  render(d){ return `<div class="dk-im"><div>${head(d)}${arr(d.bullets).length?`<div class="dk-bens" style="grid-template-columns:1fr" data-a="stagger">${arr(d.bullets).map(b=>`<div class="dk-ben"><i></i>${rich(b)}</div>`).join('')}</div>`:''}</div><div class="dk-frame" data-a="screen">${d.image?`<img src="${im(d.image)}" alt="">`:'<div class="dk-ph">Sua imagem aqui</div>'}</div></div>`; }},
 encerramento:{name:'Encerramento',desc:'Benefícios, próximos passos e mensagem final com imagem',
  fields:[{k:'kicker',t:'text',l:'Rótulo'},{k:'title',t:'area',l:'Título'},{k:'bullets',t:'list',l:'Benefícios'},{k:'nextTitle',t:'text',l:'Próximos passos: título'},{k:'next',t:'list',l:'Próximos passos'},{k:'closing',t:'area',l:'Mensagem final'},{k:'showLogo',t:'bool',l:'Mostrar logo do tema'},{k:'image',t:'image',l:'Imagem (PNG transparente)'}],
  sample:{kicker:'Próximos passos',title:'Uma base clara para *decidir melhor*',bullets:['Mais visibilidade','Decisões justificadas','Rastreabilidade','Menos excessos'],nextTitle:'',next:[],closing:'Mensagem final que resume a apresentação.',showLogo:true,image:''},
  render(d,t){ return `<div class="dk-l">${head(d)}${arr(d.bullets).length?`<div class="dk-bens" data-a="stagger">${arr(d.bullets).map(b=>`<div class="dk-ben"><i></i>${rich(b)}</div>`).join('')}</div>`:''}${arr(d.next).length?`<div data-a="up" style="margin-top:30px"><span class="dk-ix" style="color:var(--alert)">${esc(d.nextTitle||'Próximos passos')}</span><div class="dk-bens" style="margin-top:0">${arr(d.next).map(b=>`<div class="dk-ben" style="font-size:21px;padding:14px 20px"><i style="background:var(--alert);box-shadow:0 0 12px var(--alert)"></i>${rich(b)}</div>`).join('')}</div></div>`:''}${d.closing?`<p class="dk-closing" data-a="up">${rich(d.closing)}</p>`:''}</div>${d.showLogo&&t.logo?`<img class="dk-endlogo" src="${im(t.logo)}" alt="" data-a="logo">`:''}${d.image?`<img class="dk-hero" src="${im(d.image)}" alt="" data-a="hero" data-float>`:''}`; }}
};

function slideHTML(deck,i,t){
  const s=deck.slides[i]; const T=TEMPLATES[s&&s.t]||TEMPLATES.destaque;
  let inner=''; try{ inner=T.render(Object.assign({},T.sample&&{},s.d||{}),t); }catch(e){ inner=`<p class="dk-lead">Erro neste slide: ${esc(e.message)}</p>`; }
  return `<section class="dk-slide dk-t-${esc(s.t)}" data-i="${i}" aria-label="Slide ${i+1}">${inner}</section>`;
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
function build(sl,G,keep){
  const tl=G.timeline({defaults:{ease:'expo.out',duration:1.1}}); let at=0;
  sl.querySelectorAll('[data-a]').forEach(el=>{
    switch(el.dataset.a){
      case 'left': tl.from(el,{x:-60,opacity:0},at); at+=.12; break;
      case 'words': tl.from(el.querySelectorAll('.dk-w'),{yPercent:110,opacity:0,rotationX:-60,filter:'blur(8px)',stagger:.045,duration:1.2,transformOrigin:'50% 100%'},at); at+=.35; break;
      case 'up': tl.from(el,{y:40,opacity:0,filter:'blur(6px)'},at+.15); at+=.15; break;
      case 'logo': tl.from(el,{opacity:0,scale:.85,filter:'blur(14px)',duration:1.4},at); at+=.2; break;
      case 'hero': tl.from(el,{opacity:0,x:120,scale:1.06,filter:'blur(18px)',duration:1.8,ease:'power3.out'},.1); break;
      case 'stagger': tl.from(el.children,{y:30,opacity:0,stagger:.08,duration:.9},at+.1); at+=.2; break;
      case 'cards': tl.from(el.children,{y:80,opacity:0,rotationX:25,transformPerspective:900,stagger:.12,duration:1.2},at+.1);
        tl.add(()=>[...el.children].forEach((c,i)=>setTimeout(()=>c.classList.add('lit'),i*180)),at+.6); at+=.3; break;
      case 'node': tl.from(el,{y:50,opacity:0,scale:.92,duration:.9},at); at+=.22; break;
      case 'arrow': tl.from(el,{scaleX:0,duration:.5,ease:'power2.out'},at-.1); break;
      case 'chain': tl.fromTo(el.querySelector('.ch-line'),{attr:{'stroke-dashoffset':860}},{attr:{'stroke-dashoffset':0},duration:1.6,ease:'power2.inOut'},at);
        tl.from(el.querySelectorAll('.ch-n'),{opacity:0,y:12,stagger:1.6/Math.max(1,el.querySelectorAll('.ch-n').length),duration:.6},at);
        tl.fromTo(el.querySelector('.ch-p'),{attr:{cx:20}},{attr:{cx:880},duration:1.6,ease:'power2.inOut'},at); at+=.3; break;
      case 'fromleft': tl.from(el.children,{x:-80,opacity:0,stagger:.12},at); break;
      case 'fromright': tl.from(el,{x:80,opacity:0},at+.3); break;
      case 'hub': tl.from(el.querySelector('.dk-core'),{scale:0,rotation:-90,duration:1.3,ease:'back.out(1.6)'},at); at+=.3; break;
      case 'screen': tl.from(el,{y:90,opacity:0,rotationY:-14,rotationX:8,transformPerspective:1600,scale:.94,duration:1.6,ease:'power4.out'},at);
        { const r=el.querySelectorAll('.mk-bars rect'); if(r.length) tl.from(r,{scaleY:0,transformOrigin:'50% 100%',transformBox:'fill-box',stagger:.02,duration:.7,ease:'power3.out'},at+.6);
          const li=el.querySelectorAll('.mk-li'); if(li.length) tl.from(li,{x:40,opacity:0,stagger:.08,duration:.6},at+.7); }
        at+=.25; break;
      case 'peek': tl.from(el,{y:160,opacity:0,rotation:-8,duration:1.2,ease:'back.out(1.4)'},at+.5); break;
      case 'timeline': tl.from(el.querySelector('.dk-tl-line'),{scaleX:0,duration:1.6,ease:'power2.inOut'},at);
        tl.from(el.querySelectorAll('.dk-ev'),{y:40,opacity:0,stagger:.22,duration:.9},at+.2); at+=.3; break;
    }
  });
  sl.querySelectorAll('[data-count]').forEach(el=>{
    const end=parseFloat(el.dataset.count), dec=+el.dataset.dec||0, o={v:0};
    tl.to(o,{v:end,duration:1.8,ease:'power3.out',onUpdate:()=>el.textContent=fmtN(o.v,dec)},.5);
  });
  const fl=sl.querySelector('[data-float]'); if(fl) tl.to(fl,{y:-14,duration:3,yoyo:true,repeat:-1,ease:'sine.inOut'},2);
  keep.push(...hubLoops(sl,G));
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
  function size(){ const r=cv.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,1.5); W=cv.width=Math.max(2,r.width*dpr); H=cv.height=Math.max(2,r.height*dpr); }
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
    }
    if(kind!=='liso') parts.forEach(p=>{ const x=((p.x+tt*p.s*.3+cam.x*.02)%1)*W, y=(p.y*H)+Math.sin(tt+p.p)*10*dpr;
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
  root.innerHTML=`<div class="dk-player" style='${themeVars(t)}'><canvas class="dk-bg" aria-hidden="true"></canvas><div class="dk-vig"></div><div class="dk-vp"><div class="dk-stage">${deck.slides.map((_,i)=>slideHTML(deck,i,t)).join('')}${footHTML(deck,t,0)}</div></div></div>`;
  const player=root.firstElementChild, stage=player.querySelector('.dk-stage'), slides=[...stage.querySelectorAll('.dk-slide')];
  splitWords(stage);
  const bg=background(player.querySelector('.dk-bg'),t,reduce);
  function fit(){const r=player.getBoundingClientRect(); if(!r.width) return; const s=Math.min(r.width/1920,r.height/1080);stage.style.transform=`translate(-50%,-50%) scale(${s})`;}
  const ro=new ResizeObserver(fit); ro.observe(player); fit();
  let cur=-1,busy=false,tl=null,loops=[];
  const kill=()=>{ if(tl) tl.kill(); loops.forEach(l=>l.kill()); loops=[]; tl=null; };
  function enter(n){
    const sl=slides[n]; sl.classList.add('on');
    if(G && !reduce){ G.set(sl,{clearProps:'all'}); tl=build(sl,G,loops); }
    const pg=stage.querySelector('.dk-pg'); if(pg) pg.textContent=String(n+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
  }
  function go(n,dir,instant){
    if(!slides.length) return; n=Math.max(0,Math.min(slides.length-1,n));
    if(busy) return; if(n===cur && !instant) return;
    dir=dir||(n>cur?1:-1); const prev=slides[cur];
    const done=()=>{ if(prev&&prev!==slides[n]){prev.classList.remove('on'); if(G) G.set(prev,{clearProps:'all'});} kill(); enter(n); cur=n; busy=false; opts.onChange&&opts.onChange(n); };
    if(G && !reduce && !instant){ G.to(bg.cam,{x:bg.cam.x+dir*1.4,duration:1.6,ease:'power3.inOut'}); G.fromTo(bg.cam,{amp:1},{amp:1.6,duration:.6,yoyo:true,repeat:1,ease:'sine.inOut'}); }
    if(prev && G && !reduce && !instant && prev!==slides[n]){ busy=true; if(tl) tl.pause(); G.to(prev,{opacity:0,x:-dir*80,scale:.97,filter:'blur(10px)',duration:.45,ease:'power2.in',onComplete:done}); }
    else done();
  }
  function still(n){ // mostra o slide sem animar
    n=Math.max(0,Math.min(slides.length-1,n)); slides.forEach(s=>s.classList.remove('on')); kill(); slides[n].classList.add('on'); cur=n;
    const pg=stage.querySelector('.dk-pg'); if(pg) pg.textContent=String(n+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
    if(G){ loops=hubLoops(slides[n],G); slides[n].querySelectorAll('.feed').forEach(p=>{p.style.strokeDashoffset=0;}); }
  }
  function replay(){ const n=cur; slides[n].classList.remove('on'); kill(); enter(n); }
  go(opts.start||0,1,true);
  return {go,still,replay,next:()=>go(cur+1,1),prev:()=>go(cur-1,-1),get index(){return cur;},get count(){return slides.length;},el:player,
    destroy(){kill();bg.stop();ro.disconnect();root.innerHTML='';}};
}

/* ---------- miniatura estática ---------- */
function renderStatic(root,deck,i){
  const t=themeOf(deck); ensureFonts([t.fontDisplay,t.fontBody], root.ownerDocument);
  root.innerHTML=`<div class="dk-player dk-static" style='${themeVars(t)};background:radial-gradient(ellipse at 62% 45%,${t.light?'rgba(0,0,0,0)':'color-mix(in srgb,'+t.accent+' 25%,transparent)'},${t.bg} 70%)'><div class="dk-vp"><div class="dk-stage">${slideHTML(deck,i,t)}${footHTML(deck,t,i)}</div></div></div>`;
  const p=root.firstElementChild, st=p.querySelector('.dk-stage');
  const fit=()=>{const r=p.getBoundingClientRect(); if(!r.width) return; st.style.transform=`translate(-50%,-50%) scale(${Math.min(r.width/1920,r.height/1080)})`;};
  fit(); const ro=new ResizeObserver(fit); ro.observe(p); return ()=>ro.disconnect();
}

window.Deck={TEMPLATES,PRESETS,FONTS,BACKGROUNDS,createPlayer,renderStatic,themeOf,themeVars,ensureFonts,esc,
  setImageResolver(fn){resolveImage=fn;}, resolveImage:v=>resolveImage(v), version:'1.0'};
})();

