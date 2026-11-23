# NexaPDF

Engine independente de renderização **HTML/CSS → PDF**, escrita em
**TypeScript** (modo `strict`), sem navegador, sem binários nativos e **sem
nenhuma dependência de execução**. Funciona em Linux, macOS e Windows: basta
instalar o pacote, sem Chrome, sem caminhos e sem `.env`.

> **Estado: 0.1.0 — Fase 1 (Fundação).** Texto, blocos, listas, tabelas e
> paginação funcionam. Imagens, flexbox e fontes TrueType ainda não. Veja a
> [matriz de compatibilidade](docs/compatibilidade.md) antes de usar em produção.

**Novo por aqui?** Comece pelo [guia de uso passo a passo](docs/guia-de-uso.md):
download em APIs, tamanho de página, quebras de página e checklist de templates.

## Instalação

Requer Node.js 20 ou superior (ES Modules). Os tipos TypeScript já vêm no
pacote; não é preciso instalar `@types/...`.

```bash
npm install nexapdf
```

```ts
// ES Modules / TypeScript
import { NexaPDF } from 'nexapdf';

// CommonJS (Node.js 20.19+ ou 22.12+)
const { NexaPDF } = require('nexapdf');
```

## Uso

```ts
import { NexaPDF, type ConvertOptions } from 'nexapdf';

const pdf = new NexaPDF();

await pdf.convert({
  html: `<h1>Meu documento</h1><p>Gerado pela NexaPDF.</p>`,
  options: {
    format: 'A4',
    orientation: 'portrait',
    margin: { top: 20, bottom: 20, left: 15, right: 15 }, // números = mm
  },
  output: './documento.pdf',
});
```

Em memória e como stream:

```ts
const { buffer, pageCount, warnings, metrics } = await pdf.convert({ html });
const stream = pdf.createStream({ html, options: { format: 'A4' } });
stream.pipe(fs.createWriteStream('saida.pdf'));
```

Para scripts síncronos há `pdf.convertSync({ html, css, options })`.

## API

### `new NexaPDF(defaults?)`
Opções padrão mescladas em todas as conversões.

### `convert({ html, css?, options?, output? }) → Promise<Resultado>`

| Campo | Descrição |
|---|---|
| `html` | String HTML (tratada sempre como documento estático) |
| `css` | CSS adicional do usuário, aplicado após os `<style>` do documento |
| `output` | Omitido ou `'buffer'`: só em memória. Caminho: grava o arquivo |

Resultado: `{ buffer, pageCount, warnings, metrics: { timings, bytes }, path? }`.

### Opções

| Opção | Padrão | Descrição |
|---|---|---|
| `format` | `'A4'` | A0–A6, Letter, Legal, Ledger, Tabloid, Ofício |
| `width`, `height` | — | Tamanho personalizado (`210`, `'21cm'`, `'8.5in'`, `'612pt'`) |
| `orientation` | `'portrait'` | `'portrait'` ou `'landscape'` |
| `margin` | `{20,15,20,15}` mm | Número (todas) ou `{ top, right, bottom, left }`; aceita unidades em string |
| `header`, `footer` | — | String ou `{ text, align, fontSize, color }`; marcadores `{{page}}` e `{{pages}}` |
| `metadata` | — | `{ title, author, subject, keywords, creator, creationDate, modDate }` |
| `compress` | `true` | Compressão Flate dos streams |
| `background` | `'white'` | `'white'` ou `'transparent'` |
| `limits` | ver abaixo | Limites de segurança |

Precedência do tamanho da página: opções explícitas > `@page` no CSS > padrão.

### Limites de segurança (`options.limits`)

| Limite | Padrão |
|---|---|
| `maxHtmlSize` | 10 MiB |
| `maxCssSize` | 5 MiB |
| `maxDepth` | 512 níveis |
| `maxNodes` | 500 000 nós |
| `maxPages` | 2 000 |
| `timeout` | 30 000 ms (0 desativa) |

JavaScript nunca é executado. Nenhum recurso externo (CSS, imagens, fontes) é
carregado — não há acesso a rede nem ao sistema de arquivos durante a
conversão, o que elimina riscos de SSRF e leitura arbitrária de arquivos.

### Erros

Todos herdam de `NexaPDFError` e têm `code`, `stage` e `details`:
`ConfigurationError` (`INVALID_CONFIGURATION`), `LimitExceededError`
(`LIMIT_EXCEEDED`), `ConversionTimeoutError` (`CONVERSION_TIMEOUT`),
`ParseError`, `RenderError`.

## Paginação

A paginação entende o fluxo do documento: nunca corta uma linha ao meio,
respeita `break-before/after: page`, `break-inside: avoid`, `orphans`,
`widows`, mantém títulos junto do conteúdo seguinte, não divide linhas de
tabela e repete o `<thead>` em cada página.

```css
@page { size: A4; margin: 20mm; }
h1 { break-before: page; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
```

### Tipos

Tudo que a API recebe e devolve é tipado e exportado:

```ts
import type {
  ConvertOptions, ConvertRequest, ConversionResult, ConversionMetrics,
  MarginOptions, HeaderFooterOptions, DocumentMetadata, ConversionLimits,
  PageFormat, Orientation, Measure,
} from 'nexapdf';
```

Opções inválidas são apontadas pelo editor antes de executar (por exemplo,
`orientation: 'diagonal'`). Quem usa JavaScript puro recebe as mesmas
verificações em tempo de execução, como `ConfigurationError`.

## Arquitetura

O código-fonte fica em `src/` (TypeScript); o pacote publicado contém apenas
`dist/` (JavaScript ES2022 + `.d.ts`).

```
src/
  core/        engine, pipeline, configuração, erros
  html/        tokenizer, parser, DOM, entidades
  css/         tokenizer, parser, seletores, especificidade, cascata,
               herança, estilos computados, @page, propriedades/
  layout/      árvore de caixas, box model, bloco, inline, tabela, unidades
  fonts/       gerenciador, métricas AFM, WinAnsi, medição de texto
  pagination/  fragmentação, motor de paginação, cabeçalhos/rodapés
  graphics/    canvas, cores, bordas, renderizador
  pdf/         objetos, content streams, documento, serializador
```

Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Testes e benchmarks

Para desenvolver é preciso Node.js 22.18+, que executa `.ts` diretamente.

```bash
npm install                    # typescript e @types/node (só desenvolvimento)
npm run check                  # tsc --strict + 138 testes (node:test)
npm run build                  # compila para dist/
node examples/basic.ts         # gera examples/output/relatorio.pdf
node --expose-gc benchmarks/basic.ts 30
```

Resultados de referência (Node 22, contêiner Linux, 20 iterações; reproduza
no seu ambiente antes de tirar conclusões):

| Cenário | Páginas | Mediana | PDF |
|---|---|---|---|
| Uma página | 1 | ~3 ms | 1,2 KB |
| Texto (120 parágrafos) | 7 | ~16 ms | 5,2 KB |
| Tabela com 500 linhas | 11 | ~74 ms | 15 KB |
| Misto | 35 | ~123 ms | 35 KB |

Não há comparação com Puppeteer neste repositório: para manter zero
dependências, ela deve ser feita à parte, com cenários equivalentes e métricas
publicadas.

## Limitações conhecidas (Fase 1)

- Fontes: apenas Helvetica e Courier (Standard 14, não incorporadas); outras
  famílias usam Helvetica. Caracteres fora do WinAnsi aparecem como `?`.
  Sem kerning, ligaduras ou shaping.
- Sem imagens, flexbox, `position`, `float`, `border-radius`, sombras,
  gradientes, `calc()` e variáveis CSS.
- Tabelas sem `rowspan` e `<col>`; `border-collapse` aproximado.
- `inline-block` tratado como inline; fundos de inline cobrem só o texto.

## Roteiro proposto

1. **Fase 1 — Fundação** ✅ estrutura, pipeline, erros, configuração, HTML,
   CSS, layout de bloco/inline/tabela, paginação, PDF 1.7.
2. **Fase 2 — Imagens:** decodificadores próprios de PNG (inflate via zlib
   nativo) e JPEG (passthrough DCT), carregador de recursos controlado.
3. **Fase 3 — Fontes TrueType:** parser TTF, subsetting, incorporação
   Type0/CIDFontType2 + ToUnicode, Unicode completo.
4. **Fase 4 — Layout avançado:** flexbox, position, float, border-radius,
   box-shadow, calc(), variáveis CSS.
5. **Fase 5 — PDF avançado:** links, marcadores, PDF/A, tagged PDF.

## Licença

MIT — veja [LICENSE](LICENSE).
