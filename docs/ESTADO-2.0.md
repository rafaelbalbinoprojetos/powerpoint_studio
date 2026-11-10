# Estúdio Motion 2.0: estado técnico

Avaliação do "Prompt Master 2.0" contra o sistema real, e o que foi feito.

## Arquitetura (auditoria)

- Sem framework. É JavaScript puro, com um build (`build.ps1`) que junta `src/` num único `index.html`.
  - `src/engine.js`: motor e player. Tem os modelos (`TEMPLATES`), as animações por modelo (`FX`), as transições (`TRANSITIONS` / `go()`), o fundo animado e o 3D (Three.js).
  - `src/editor.js` e `src/editor.css`: o editor.
  - `src/seed.js`: as apresentações de exemplo.
- Animações em GSAP 3, embutido no HTML. O 3D é feito em canvas e Three.js.
- Persistência: no armazenamento do navegador (local e IndexedDB), ou no armazenamento do Claude quando disponível.
  - O deck é JSON: `{theme, tr, slides:[{t, d, tr, anim, ...}]}`.
  - Campos novos são opcionais, por isso não foi preciso migração: decks antigos abrem iguais.
- Exportação: um único HTML com motor, CSS, GSAP e imagens embutidos. Abre direto do disco (`file://`).
  - Única chamada externa: Google Fonts. Sem internet, cai para fontes do sistema.

## Decisões sobre as tecnologias sugeridas

| Sugestão | Decisão | Motivo |
|---|---|---|
| Motion (React) | Não adotado | O sistema não usa React. Adotar exigiria reescrever o editor e o player. O GSAP já é o único responsável por todas as propriedades animadas, então não há conflito a evitar. |
| GSAP | Mantido como motor central | Já controla timelines, play/pause, replay e velocidade. |
| React Three Fiber / Drei | Não adotado | O Three.js puro já roda os modelos 3D. R3F traria React junto. |
| Shaders GLSL de transição | Ainda não | As transições novas usam máscaras CSS e clip-path reais, que funcionam no `file://` sem WebGL e têm fallback natural. |
| ECharts | Não se aplica | Os gráficos são SVG/HTML próprios, animados pelo GSAP. |
| Remotion | Não adotado | Exigiria Node e renderização no servidor. Fica como módulo futuro e separado. |
| ZIP com pastas | Não adotado | O HTML único já funciona offline e é mais simples de enviar. Um ZIP só se justifica com modelos GLB grandes ou vídeos. |

## Implementado nesta fase

1. **Transições com máscara real.** O próximo slide aparece através de uma máscara animada. Não é uma sobreposição decorativa.
   - Lista: Vidro diagonal, Anel de energia, Portal de profundidade, Varredura de luz, Florescer radial, Obturador digital, Dissolver em pixels, Glitch, Onda, Tinta orgânica e Máscara personalizada.
   - Também entraram quatro transições sem máscara: Dissolver cruzado, Revelar com desfoque, Empurrar em perspectiva e Cortina em camadas.
   - Função `reveal()` em `engine.js`.
   - A duração é ajustável no deck: normal, rápida ou lenta.
   - Respeita movimento reduzido: o slide troca sem animar.
   - Botão "▶ Prévia da transição" no painel do slide.
2. **Máscara personalizada (PNG/SVG).**
   - O PNG respeita o canal alpha.
   - O SVG é higienizado: remove `script`, `foreignObject`, atributos `on*` e links externos.
   - Fica guardada como data URL no deck e por isso vai junto na exportação.
3. **Smart Morph com vínculos.** No painel do slide, a seção "Elementos compartilhados com o próximo slide" liga cada elemento ao correspondente do próximo slide (campo `share`).
   - O "Movimento mágico" faz o elemento viajar: posição, tamanho, cor e tipografia.
   - A logo é ligada automaticamente.
   - Tem botão "▶ Prévia do movimento".
   - Ao criar um vínculo, a transição do próximo slide passa para "Movimento mágico".
4. **Estilos de direção (Motion Studio, presets globais).** Corporativo, Cinematográfico, Dinâmico, Minimalista e Tecnológico.
   - Cada um ajusta de uma vez a transição, a duração, a entrada dos elementos e a velocidade.
   - Para isso, o deck ganhou `anim` e `speed` padrão.
5. **Oito modelos premium**, editáveis e com tags no texto:
   - Herói cinematográfico.
   - Divisão revelada.
   - Número em destaque (contagem, tendência e comparação).
   - Vidro flutuante.
   - Rede de inteligência (dados fluindo pelas linhas).
   - Jornada com câmera: mostra o todo, depois viaja de marco em marco e volta.
   - Holofote.
   - Antes/Depois: o divisor corre sozinho e pode ser arrastado na apresentação sem trocar de slide.
6. **Barras + linha** (`combo`): realizado em barras e projeção em linha.

## Testes executados (navegador headless, Chromium)

- As 14 transições foram executadas no editor, com captura no meio do efeito. Todas revelaram o próximo slide pela forma esperada e limparam máscaras e camadas ao terminar.
- Os 8 modelos foram criados pela galeria e conferidos por captura de tela, com verificação automática de texto saindo do slide: nenhum caso.
- Texto com as novas tags gerou os 6 modelos esperados.
- O estilo "Cinematográfico" aplicou a transição `vidro` com duração `lenta`.
- No HTML exportado, aberto via `file://` sem o editor:
  - a transição com máscara roda;
  - o divisor do Antes/Depois arrasta sem mudar de slide;
  - não houve erros;
  - o único recurso externo é o Google Fonts.
- Um SVG malicioso (com `onload` e `<script>`) chegou limpo à máscara, e nenhum alerta disparou.
- Regressão: os testes anteriores qa7, qa13, qa27, qa32, qa34 e qa35 passaram sem erros.

## Pendente: não implementado

- Shaders WebGL de transição (liquid, displacement, particle morph).
- Timeline visual com keyframes, arrastar e soltar.
- Câmera virtual livre por slide (pan/zoom com posições salvas). Hoje existem câmeras prontas: Jornada, Voo, Globo (tour) e Mergulho.
- Background Composer em camadas.
- Exploded View com GLB/GLTF.
- Geographic Story com rotas entre cidades.
- Data storytelling em etapas (drill-down, transformar um gráfico em outro).
- Janela separada do apresentador.
- AI Scene Director.
- Fontes embutidas na exportação.
- Exportação em vídeo MP4.
