---
name: "apresentacao-motion"
description: "Use quando Rafa pedir uma apresentação animada (estilo motion/After Effects) a partir de um roteiro, PDF, tópicos ou imagens; gera o deck direto no Estúdio Motion."
---

# Apresentação Motion

Transforma um roteiro em uma apresentação animada dentro do **Estúdio Motion**, o editor de Rafa:
https://claude.ai/artifact/TtQgbZhWTBw8XxiNaUxQoG

O deck é gravado no banco do Estúdio. Rafa abre o Estúdio, escolhe a apresentação na lista e já pode editar, apresentar ou exportar em HTML. Não construa uma página HTML nova: o motor de animação já existe no Estúdio.

## Fluxo

1. **Ler o material.** Roteiro em PDF, texto ou tópicos. Separe slide a slide: título, mensagem, blocos, números, etapas.
2. **Escolher o modelo de cada slide** (tabela abaixo). Varie os modelos; evite três slides seguidos iguais. Abra com `capa` e feche com `encerramento`.
3. **Imagens enviadas por Rafa** (logo, mascote, capturas):
   - Converta para WebP (largura até 1600 px; logo até 900 px), preservando transparência.
   - Envie ao Estúdio com o Artifact tool: `action: "publish"`, `url` do Estúdio, `asset: true`, `file_paths: [...]`. Antes disso, faça `action: "read"` no Estúdio uma vez nesta conversa.
   - Cada resultado traz um `id` de 32 caracteres. Use no deck como `"asset:<id>"`.
   - Imagens já publicadas junto ao Estúdio podem ser usadas pelo caminho: `assets/logo.webp`, `assets/mascote-a.webp`, `assets/mascote-b.webp`, `assets/mascote-ilustrado.webp` (identidade e-Dog).
4. **Montar o JSON do deck** (formato abaixo) e salvar em arquivo local.
5. **Gravar no Estúdio** com `ArtifactData`: `action: "set"`, `url` do Estúdio, `collection: "decks"`, `doc_id`: slug curto (letras, números, hífen), `file_path` do JSON. Para atualizar um deck que já existe, leia antes (`get`) e passe `if_version`.
6. **Responder** em uma ou duas frases: nome da apresentação no Estúdio, quantos slides, e o que ficou para Rafa completar (por exemplo, capturas reais no modelo `tela`). Não cole o JSON na resposta.

## Formato do deck

```json
{
  "name": "Nome que aparece na lista",
  "footerText": "Texto do rodapé",
  "updatedAt": 1794010000000,
  "theme": {"preset": "eletrico", "logo": "asset:<id>"},
  "slides": [ {"id": "s1", "t": "capa", "d": { ...campos... }} ]
}
```

- `updatedAt`: horário atual em milissegundos.
- `footer: false` esconde o rodapé.
- Ids de slide únicos dentro do deck.
- Documento até 256 KiB: nunca coloque imagem em base64 no deck; use `asset:`.
- `header`: faixa de ponta a ponta no topo, ex.: `{"on": true, "text": "Pitch · Rodada Seed 2026", "image": "asset:<id>"}` (`logo: false` tira a logo da faixa). Sem imagem, usa as cores do tema. Capa e slides de tela cheia ficam sem faixa automaticamente.
- `tr`: transição padrão do deck inteiro (mesmos valores do `tr` de cada slide). `voo` = tela infinita estilo Prezi: os slides ficam espalhados num mapa e a câmera voa entre eles; ótimo para narrativas e visão geral.
- `calm: true`: movimento reduzido ao apresentar (acessibilidade).
- `auto`: avanço automático ao apresentar, ex.: `{"secs": 6, "loop": true}`. Use só se Rafa pedir (TV, quiosque, vídeo).

### Opções de cada slide (ao lado de `t` e `d`)

- `notes`: notas do apresentador (texto). Escreva o que falar quando o roteiro trouxer isso.
- `hidden: true`: slide oculto, pulado na navegação normal; só abre por um link de um `onepage`.
- `anim`: `suave`, `dinamico` ou `nenhuma` (padrão: completa). `speed`: 0.5 a 2. `tr` (transição ao chegar): `magico`, `morph` (as caixas do slide se transformam nas do próximo; ótimo entre cartões, números e fluxo), `voo`, `fade`, `zoom`, `subir`, `nenhuma` (padrão: deslizar). **`magico` (movimento mágico)**: título, rótulo, imagens e números iguais viajam do slide anterior para a nova posição. Para usar bem, repita o mesmo `kicker`/`title` (ou o mesmo número/imagem) em slides seguidos com modelos diferentes, ex.: `destaque` → `cartoes` com o mesmo título; `numeros` → `painel` com o mesmo valor. `dur`: segundos no avanço automático.
- `head`: `show` ou `hide` força a faixa de cabeçalho neste slide.
- `lay`: layout alternativo do mesmo conteúdo (vazio = padrão). `cartoes`: `lado`, `lista`, `destaque` · `numeros`: `lado`, `gigante`, `faixa` · `comparacao`: `versus`, `foco` · `fluxo`: `lado` (vertical) · `destaque`: `centro`, `dividido` · `capa` e `encerramento`: `centro`. Varie layouts para slides seguidos do mesmo modelo não parecerem repetidos.
- `src` + `live: true` (só modelos com itens de valor: gráficos, pizza, barras, funil etc.): link de Google Planilhas publicado ou CSV; coluna A = rótulo, B = valor. Com `live`, os números são buscados de novo ao apresentar.

### Temas (`theme.preset`)

`eletrico` (azul elétrico, fibras), `ambar` (industrial, grade), `esmeralda` (verde, constelação), `vinho` (premium, serifada), `claro` (corporativo claro), `editorial` (papel creme, serifada, cantos retos; ótimo para relatórios e resultados), `grafite` (preto e verde-limão, técnico e minimalista; ótimo para lançamentos), `aurora` (roxo com granulado; ótimo para pitch e tecnologia).

Ajustes de estilo no `theme`: `shape` (`round`, `soft`, `sharp`), `cards` (`vidro`, `solido`, `contorno`), `glow` (false tira o brilho neon), `grain` (true põe granulado de filme), `weight` (300 a 700, peso dos títulos).

Para uma marca própria, mantenha o preset mais próximo e sobrescreva no `theme`: `bg`, `surface`, `accent`, `alert`, `ok`, `bad`, `title`, `text`, `muted` (hex), `fontDisplay`, `fontBody` (Lexend, Manrope, Sora, Outfit, Plus Jakarta Sans, DM Sans, Inter, Space Grotesk, Archivo, Bricolage Grotesque, Fraunces, Playfair Display, Space Mono, IBM Plex Sans, Rubik, Montserrat, Poppins), `background` (`fibras`, `grade`, `particulas`, `liso`; premium: `aurora` (faixas de luz), `malha` (manchas de cor), `topografia` (curvas de nível, ótimo em tema claro), `pontos` (grade de pontos em onda), `luz` (feixes de luz), `bokeh`, `poeira` (estrelas 3D vindo na direção da câmera), `galaxia` (espiral de partículas), `vagalumes`, `fluxo` (partículas em correntes com rastro) (luzes desfocadas)), `light: true` para fundo claro.

### Texto

- `*palavra*` destaca na cor do tema (use em 2 a 5 palavras do título, não no título inteiro).
- `` `SQ01` `` vira etiqueta de código.
- `\n` no título quebra a linha.
- Títulos com até ~60 caracteres; textos de cartão com até ~110.

### Modelos (`t`) e campos (`d`)

- `story` (gráficos, pizza, linha, combo, funil, medidores, números, cartões): etapas ao apresentar, ex.: `[{"i":2,"text":"Sudeste lidera com *41%*","zoom":true},{"i":-1,"text":"Conclusão"}]` (`i` = índice do item; -1 = só o comentário). Cada avanço mostra uma etapa antes de ir ao próximo slide. Use em gráficos que contam uma história, 2 a 4 etapas.

- `tr: "grafico"` (morph de gráfico): categorias de mesmo nome viajam entre gráficos seguidos (barras → pizza → linha). Itens de gráfico aceitam `link` (id de um slide, normalmente `hidden: true`): clicar na categoria abre o detalhe e o Voltar retorna.
| Modelo | Quando usar | Campos |
|---|---|---|
| `capa` | Abertura | `showLogo` (bool), `kicker`, `title`, `lead`, `chain` ("Dados, Análise, Decisão" — 2 a 4 itens, vírgula), `chips` (lista de textos), `image` (PNG transparente grande à direita) |
| `destaque` | Frase de seção ou ideia central | `kicker`, `title`, `lead`, `image` (opcional) |
| `cartoes` | 2 a 4 blocos paralelos | `kicker`, `title`, `lead`, `numbered` (bool), `cards`: [{`icon`, `label`, `title`, `text`}] |
| `fluxo` | Processo, papéis, etapas em sequência | `kicker`, `title`, `lead`, `steps`: [{`icon`, `tag`, `title`, `text`, `hot` (bool, destaca)}] (2 a 5), `noteTitle`, `note` (alerta opcional) |
| `convergencia` | Várias fontes alimentando um sistema | `kicker`, `title`, `sources`: [{`title`, `text`}] (2 a 4), `core` (texto do núcleo; vazio usa o logo), `checksTitle`, `checks` (lista), `statValue`, `statLabel` |
| `tela` | Funcionalidades com captura do sistema | `kicker`, `title`, `items`: [{`label`, `text`}] (até 5), `screen` (captura; vazio gera tela simulada), `mockTitle`, `peek` (imagem espiando, opcional) |
| `numeros` | 1 a 4 indicadores com contagem | `kicker`, `title`, `lead`, `stats`: [{`label`, `prefix`, `value`, `suffix`, `text`, `badge`}] |
| `agenda` | Rotina, cronograma, marcos | `kicker`, `title`, `lead`, `events`: [{`when`, `title`, `text`}] (2 a 5) |
| `imagem` | Foto ou captura grande | `kicker`, `title`, `lead`, `bullets` (lista), `image` |
| `encerramento` | Fechamento | `kicker`, `title`, `bullets` (lista), `nextTitle`, `next` (lista), `closing`, `showLogo` (bool), `image` |
| `onepage` | Resumo condensado em uma tela; muitas vezes é o único slide mostrado, com detalhes em slides ocultos | `kicker`, `title`, `lead`, `blocks`: [{`label`, `value` (número de destaque, opcional), `title`, `text`, `link` (id de um slide, normalmente `hidden: true`)}] (até 6), `footnote` |
| `comparacao` | Antes × depois, opção A × B | `kicker`, `title`, `leftTitle`, `left` (lista), `rightTitle`, `right` (lista) |
| `grafico` | Evolução ou comparação de valores em barras | `kicker`, `title`, `lead`, `unit`, `bars`: [{`label`, `value`, `hot` (bool)}] (até 8) |
| `citacao` | Depoimento ou frase marcante | `quote`, `author`, `role`, `image` (foto, opcional) |
| `equipe` | Pessoas | `kicker`, `title`, `people`: [{`name`, `role`, `photo`}] (até 6; sem foto mostra as iniciais) |
| `tabela` | Dados tabulares curtos | `kicker`, `title`, `header` ("A \| B \| C"), `rows` (lista, colunas com `\|`), `hotRow` (número da linha destacada) |
| `video` | Vídeo em tela cheia, sem som | `src` (URL .mp4/.webm), `kicker`, `title`, `lead`, `dim` (bool)  Extras: `start` (segundos), `textAt` (texto entra aos N s), `sound` (bool), `loop` (`parar`, `proximo`) |
| `mergulho` | Efeito 3D: a câmera atravessa imagens, uma atrás da outra, até a mensagem final | `layers`: [{`image`, `caption`}] (2 a 5, da frente para o fundo), `kicker`, `title`, `lead` |
| `galeria3d` | Carrossel de imagens girando em perspectiva | `kicker`, `title`, `lead`, `images`: [{`image`, `caption`}] (3 a 8) |
| `revelar` | Imagem em tela cheia surgindo por máscara, com título | `image`, `kicker`, `title`, `lead`, `curtain` (bool: cortina em vez de círculo), `dim` (bool) |
| `paralaxe` | Capa de impacto: fundo, título gigante e figura recortada na frente | `bg` (imagem de fundo), `subject` (PNG transparente), `kicker`, `title` (1 a 2 palavras), `lead` |
| `pizza` | Distribuição, participação (até 8 fatias) | `kicker`, `title`, `lead`, `slices`: [{`label`, `value`}], `centerValue` (vazio = total), `centerLabel`, `full` (bool: pizza sem furo), `showPct` (bool) |
| `barrash` | Ranking, comparação entre itens com nomes longos | `kicker`, `title`, `lead`, `unit`, `bars`: [{`label`, `value`, `hot`}] (até 8), `sort` (bool) |
| `linha` | Evolução no tempo (até 12 pontos) | `kicker`, `title`, `lead`, `points`: [{`label`, `value`}], `target` (meta, opcional), `targetLabel`, `showValues` (bool) |
| `medidores` | Percentual de metas (1 a 4 anéis) | `kicker`, `title`, `lead`, `gauges`: [{`label`, `value` (0 a 100), `text`}] |
| `funil` | Conversão entre etapas (até 6) | `kicker`, `title`, `lead`, `stages`: [{`label`, `value`, `text`}], `showRate` (bool) |
| `matriz` | SWOT, prioridades, riscos (4 quadrantes) | `kicker`, `title`, `aTitle`, `a` (lista), `bTitle`, `b`, `cTitle`, `c`, `dTitle`, `d`, `xLabel`, `yLabel` |
| `painel` | OnePage de dashboard: indicadores, tabela, rosca e destaques numa tela | `kicker`, `title`, `kpis`: [{`label`, `value`, `delta` ("+12%"; negativo fica vermelho), `link` (id de slide oculto)}] (até 4), `tableTitle`, `header`, `rows`, `chartTitle`, `mix`: [{`label`, `value`}] (até 6), `highlights` (lista) |
| `particulas3d` | Momento "uau" (abertura, virada de capítulo, número-chave): partículas 3D formam uma palavra, viram outra forma e voltam | `word` (1 a 12 letras: nome, número, ano), `shape` (`esfera`, `helice`, `onda`, `galaxia`), `kicker`, `title`, `lead` |
| `barras3d` | Gráfico de barras em 3D com câmera girando (até 8 barras) | `camera` (`orbita`, `foco` = foca cada barra enquanto sobe, `voo` = voa rente sobre as barras, `topo` = desce do alto, `cinema` = do alto, voa e foca a barra `hot`), `kicker`, `title`, `lead`, `unit`, `bars`: [{`label`, `value`, `hot`}] |
| `globo3d` | Planeta de pontos girando com arcos de conexão a partir do 1º local (presença, expansão, alcance) | `camera` (`girar` ou `tour` = visita cada local um por vez), `kicker`, `title`, `lead`, `stats` (lista curta), `points`: [{`label`, `lat`, `lon`}] (até 10; o primeiro é o centro) |
| `logo3d` | Logo vira escultura 3D de partículas que se monta e gira (abertura, lançamento de marca) | `image` (vazio = logo do tema), `word` (texto se não houver logo), `kicker`, `title`, `lead` |
| `tunel3d` | Viagem por túnel 3D que desacelera e revela o título no centro (abrir capítulos) | `style` (`aneis`, `grade`, `estrelas`), `kicker`, `title`, `lead` |

**Ícones animados:** `icon` em `cartoes` e `fluxo` desenha um ícone com traço animado. Valores: `grafico`, `alvo`, `foguete`, `escudo`, `pessoas`, `relogio`, `raio`, `engrenagem`, `dinheiro`, `ideia`, `check`, `globo`, `coracao`, `cadeado`, `nuvem`, `chat`, `estrela`, `caminhao` (vazio = sem ícone). Use quando o tema de cada cartão for claro.

**OnePage com slides ocultos:** crie o `onepage` e, para cada bloco que precisa de detalhe, um slide com `hidden: true`; ponha o `id` desse slide no `link` do bloco. Na apresentação, clicar no bloco abre o slide oculto, que mostra "Voltar ao resumo".

**Modelos cinematográficos** (`mergulho`, `galeria3d`, `revelar`, `paralaxe`) dependem de imagens boas; sem imagem, aparecem degradês provisórios. Use quando Rafa enviar fotos ou pedir impacto visual, no máximo 2 ou 3 por apresentação.

`value` em `numeros` anima quando é número no padrão brasileiro (`3.116.719,02`, `501`, `30`). Texto como `16/10` aparece sem contagem.

### Estúdio Motion 2.0: transições, direção e modelos premium

- `tr` também aceita transições que revelam o próximo slide por máscara: `vidro` (faixas diagonais de vidro), `anel` (anel de energia), `portal` (portal de profundidade), `luz` (varredura de luz), `raios` (florescer radial), `obturador` (persianas digitais), `pixels`, `glitch`, `onda`, `tinta` (manchas orgânicas), `mascara` (PNG/SVG do tema em `trMask`). Sem máscara: `dissolver`, `desfoque`, `perspectiva`, `cortina` (painéis em camadas). Use no máximo 2 ou 3 tipos por apresentação.
- No deck: `trDur` = `rapida` ou `lenta`; `anim` e `speed` valem para todos os slides sem configuração própria; `motion` = `corporativo`, `cinematografico`, `dinamico`, `minimalista` ou `tecnologico` (só um rótulo do estilo; aplique também `tr`, `trDur`, `anim` e `speed` correspondentes).
- `share` no slide: liga elementos ao próximo slide no `magico`, ex.: `{"title":"kicker","cards.0.title":"title","logo":"logo"}` (chaves = `data-f` deste slide, valores = do próximo). A logo já viaja sozinha.

| Modelo | Quando usar | Campos |
|---|---|---|
| `heroi` | Abertura cinematográfica sobre foto | `image`, `kicker`, `title`, `lead`, `chips` (até 3), `light` |
| `dividir` | Imagem e texto com divisor que revela | `image`, `kicker`, `title`, `lead`, `bullets`, `ratio` (`p40`,`p60`), `side` (`esq`) |
| `numerao` | Um número que conta a história | `kicker`, `prefix`, `value`, `suffix`, `title`, `trend` (`baixa`,`neutra`), `delta`, `compareLabel`, `compareValue`, `lead` |
| `vidros` | Pilares em cartões de vidro flutuando | `kicker`, `title`, `cards`: [{`label`,`title`,`text`}] (até 4) |
| `rede` | Ecossistema, integrações, áreas conectadas | `kicker`, `title`, `center`, `nodes`: [{`label`,`text`,`hot`}] (até 8), `mesh` |
| `jornada` | Roteiro com câmera viajando de marco em marco | `kicker`, `title`, `steps`: [{`when`,`title`,`text`}] (até 7), `dwell` (`rapido`,`lento`) |
| `holofote` | Revelar produto ou tela no escuro | `image`, `kicker`, `title`, `points` (até 4) |
| `antesdepois` | Comparar duas imagens com divisor arrastável | `kicker`, `title`, `before`, `after`, `beforeLabel`, `afterLabel`, `beforeValue`, `afterValue`, `pos` |
| `combo` | Realizado em barras e projeção em linha | `kicker`, `title`, `lead`, `points`: [{`label`,`value`,`proj`}], `barName`, `lineName`, `showValues` |

## Cuidados

- O Estúdio publicado precisa estar na versão 2 (código em github.com/rafaelbalbinoprojetos/powerpoint_studio, `index.html` gerado pelo `build.ps1`) para mostrar os modelos, temas e opções novos. Numa versão antiga, modelo desconhecido aparece como `destaque`.

- Não invente números, datas ou resultados. Se o roteiro marca um dado como histórico, use `badge` (ex.: "Dado de nov/2023").
- Sem captura real, deixe `screen` vazio: a tela simulada já sai marcada como ilustrativa.
- Mascotes e figuras recortadas (PNG transparente) vão em `capa.image`, `encerramento.image`, `destaque.image` ou `tela.peek`. Fotos e capturas vão em `imagem.image` ou `tela.screen`.
- Se Rafa pedir um arquivo para enviar, lembre que o botão Exportar do Estúdio gera um HTML que roda sozinho, com as imagens embutidas.