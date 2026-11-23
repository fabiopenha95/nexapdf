# Arquitetura da NexaPDF

O código-fonte é TypeScript em modo `strict` (`src/**/*.ts`). Os tipos
compartilhados ficam em `css/types.ts`, `layout/types.ts` e `core/options.ts`.
O pacote publicado contém apenas o JavaScript compilado e os `.d.ts` (`dist/`).

## Pipeline

```
HTML (string)
  │  html/tokenizer.ts → html/parser.ts
  ▼
DOM (html/dom-node.ts)
  │  css/tokenizer.ts → css/parser.ts → css/selector-engine.ts
  │  css/cascade.ts (RuleIndex) → css/computed-style.ts
  ▼
Estilos computados (Map<Elemento, estilo>, comprimentos em pt)
  │  css/page-rules.ts + core/configuration.ts  → página, margens, limites
  │  layout/box-tree.ts                          → árvore de caixas
  │  layout/block-layout.ts, inline-layout.ts, table-layout.ts
  ▼
Árvore de layout (geometria absoluta num "espaço contínuo")
  │  pagination/fragmentation.ts → folhas, faixas e unidades
  │  pagination/pagination-engine.ts → deslocamentos por folha
  ▼
Árvore paginada
  │  graphics/renderer.ts, borders.ts, pagination/headers-footers.ts
  ▼
Listas de exibição (graphics/canvas.ts), uma por página
  │  pdf/pdf-content.ts → pdf/pdf-document.ts → pdf/pdf-serializer.ts
  ▼
PDF 1.7 (Buffer)
```

`core/pipeline.ts` executa as etapas, mede o tempo de cada uma e verifica o
prazo de conversão. `core/engine.ts` expõe a API pública.

## Princípios

- **Uma unidade interna:** todos os comprimentos são convertidos para pontos PDF
  (`layout/measurements.ts`) a partir de razões exatas (72/96, 72/25,4).
- **Sem dependências circulares:** o layout de blocos e o de tabelas se chamam
  por meio de um objeto de contexto (`ctx.layoutBlock`, `ctx.layoutTable`), e
  não por importação mútua.
- **O PDF não reinterpreta HTML/CSS:** o gerador consome apenas listas de
  exibição (retângulos, polígonos, linhas, círculos e textos).
- **Determinismo:** sem datas implícitas; `/ID` derivado de hash do conteúdo.

## Espaço contínuo e paginação

O layout posiciona tudo como se a área útil da página fosse uma faixa de altura
infinita. A paginação, então:

1. coleta **folhas** — linhas de texto e caixas sem linhas — em ordem;
2. transforma restrições (`break-inside: avoid`, `break-after: avoid`,
   órfãs/viúvas, linhas de tabela, thead + primeira linha) em **faixas** de
   folhas que devem permanecer juntas, e quebras forçadas em marcações;
3. une as faixas em **unidades** e as percorre em ordem, mantendo um
   deslocamento vertical acumulado. Uma unidade que ultrapassaria o fim da
   página é empurrada para o topo da seguinte — e, com ela, todo o restante.

Como o deslocamento nunca diminui, não há sobreposição nem páginas vazias
inesperadas. Caixas que atravessam páginas são desenhadas em fragmentos (borda
superior só no primeiro, inferior só no último).

## Pontos de extensão planejados

- **Imagens:** `resources/` receberá um carregador controlado pelo
  desenvolvedor (lista de protocolos/domínios permitidos) e
  `graphics/images.ts` uma interface de decodificador (`decode(bytes) →
  { width, height, colorSpace, data }`) para PNG/JPEG.
- **Fontes TTF:** `fonts/font-parser.ts` (tabelas cmap, hmtx, hhea, OS/2,
  glyf/loca), subsetting e incorporação Type0/CIDFontType2 com ToUnicode.
  O `FontManager` já centraliza a resolução de faces para isso.
- **Flexbox:** `layout/flex-layout.ts`, registrado no contexto de layout como
  o de tabelas.
