# Matriz de compatibilidade HTML/CSS — NexaPDF 0.1.0 (Fase 1)

Estados: **Suportado** · **Suportado com limitações** · **Experimental** · **Em desenvolvimento** · **Não implementado**

Cada item marcado como suportado possui testes automatizados em `tests/`.

## HTML

| Recurso | Estado | Observações |
|---|---|---|
| Estrutura html/head/body (implícita) | Suportado | Criada automaticamente quando ausente |
| Elementos de bloco (div, p, h1–h6, section, article, header, footer, main, nav, blockquote, pre) | Suportado | |
| Elementos inline (span, strong, b, em, i, u, s, a, code, small, mark, sub, sup) | Suportado com limitações | `sub`/`sup` reduzem a fonte, mas sem deslocamento vertical |
| br, hr | Suportado | |
| Listas ul/ol/li (start, reversed, value) | Suportado com limitações | `list-style-position: inside` é tratado como `outside` |
| Tabelas (table, thead, tbody, tfoot, tr, th, td, caption, colspan) | Suportado com limitações | Sem `rowspan`, `<col>`/`<colgroup>`; caption só no topo |
| img | Não implementado | Fase 2 (PNG/JPEG). Hoje o `alt` é exibido como texto |
| Entidades nomeadas e numéricas | Suportado | Latin-1 completo e pontuação tipográfica |
| Fechamentos implícitos e recuperação de erros | Suportado com limitações | Subconjunto do algoritmo WHATWG |
| Comentários, DOCTYPE | Suportado | |
| script | Suportado (nunca executado) | O HTML é sempre estático |
| link rel=stylesheet | Não implementado | Recursos externos não são carregados; use a opção `css` |
| Atributos de apresentação (width, height, align, valign, bgcolor, border, cellpadding, cellspacing) | Suportado | |

## Seletores e cascata

| Recurso | Estado |
|---|---|
| Tipo, universal, classe, ID | Suportado |
| Descendente, filho (`>`), irmão adjacente (`+`), irmão geral (`~`) | Suportado |
| Atributos `[a]` `=` `~=` `\|=` `^=` `$=` `*=` (flag `i`) | Suportado |
| `:first-child` `:last-child` `:only-child` `:nth-child()` `:nth-last-child()` `:first-of-type` `:last-of-type` `:nth-of-type()` `:root` `:empty` `:not()` `:link` | Suportado |
| Pseudo-elementos (`::before`, `::after`, `::first-line`) | Não implementado (regra descartada) |
| Especificidade, ordem, `!important`, estilo inline | Suportado |
| Herança, `inherit`, `initial`, `unset` | Suportado (`revert` = `unset`) |
| `<style>` com atributo `media` | Suportado |
| `@media` | Suportado com limitações (avalia apenas o tipo de mídia: print/all) |
| `@page` (size, margin) | Suportado com limitações (sem `:first`, `:left`, `:right`, sem margin boxes) |
| `@import`, `@font-face`, `@supports` | Não implementado (ignorado com aviso) |
| Variáveis CSS (`--x`, `var()`) | Não implementado |
| `calc()` | Não implementado |

## Propriedades

| Grupo | Propriedade | Estado |
|---|---|---|
| Texto | color, font-size, font-weight, font-style, line-height, text-align, text-indent, text-transform, letter-spacing, word-spacing, white-space | Suportado |
| Texto | font-family | Suportado com limitações (Helvetica e Courier; demais famílias usam Helvetica até a Fase 3) |
| Texto | text-decoration (underline, line-through, overline) | Suportado com limitações (sem estilo/cor/espessura próprios) |
| Texto | overflow-wrap, word-break | Suportado com limitações (break-word/anywhere/break-all quebram palavras longas) |
| Box model | width, height, min/max-width, min/max-height, margin, padding, border, box-sizing | Suportado com limitações (alturas percentuais = auto) |
| Box model | margens auto (centralização) | Suportado |
| Box model | colapso de margens | Suportado com limitações (irmãos e pai/filho; sem colapso através de blocos vazios) |
| Bordas | solid, dashed, dotted, double | Suportado |
| Bordas | groove, ridge, inset, outset | Suportado com limitações (desenhadas como solid) |
| Bordas | border-radius | Não implementado |
| Visual | background-color (inclusive rgba) | Suportado |
| Visual | background-image, gradientes | Não implementado |
| Visual | box-shadow, opacity | Não implementado |
| Visual | visibility | Suportado |
| Layout | display: block, inline, list-item, none, table e partes | Suportado |
| Layout | display: inline-block | Suportado com limitações (tratado como inline) |
| Layout | display: flex | Em desenvolvimento (tratado como bloco, com aviso) |
| Layout | position, float, clear, overflow, vertical-align (inline) | Não implementado |
| Tabelas | border-collapse, border-spacing | Suportado com limitações (collapse aproximado) |
| Tabelas | vertical-align em células (top, middle, bottom) | Suportado |
| Tabelas | table-layout: fixed, caption-side | Não implementado |
| Impressão | break-before/after (page, avoid), page-break-* | Suportado |
| Impressão | break-inside: avoid | Suportado |
| Impressão | orphans, widows | Suportado |
| Unidades | px, pt, pc, in, cm, mm, Q, em, rem, %, vw, vh, vmin, vmax | Suportado |
| Unidades | ex, ch | Suportado com limitações (aproximados como 0,5em) |
| Cores | nomes CSS, #rgb(a), #rrggbb(aa), rgb(a)(), hsl(a)(), transparent, currentColor | Suportado |

## Paginação

| Recurso | Estado |
|---|---|
| Quebras automáticas entre linhas (nunca no meio de uma linha) | Suportado |
| Quebras manuais (antes/depois) com preservação da margem após quebra forçada | Suportado |
| Linhas de tabela indivisíveis | Suportado (linhas maiores que a página são divididas por linha de texto) |
| Repetição do `<thead>` | Suportado |
| Títulos mantidos com o conteúdo seguinte | Suportado (break-after: avoid na folha padrão) |
| Cabeçalho, rodapé, `{{page}}` / `{{pages}}` | Suportado (texto simples) |
| Fundos e bordas fatiados entre páginas | Suportado (box-decoration-break: slice) |
| Repetição de `<tfoot>` | Não implementado |

## Fontes

| Recurso | Estado |
|---|---|
| Fontes padrão do PDF (Helvetica, Courier e variantes) com métricas AFM reais | Suportado |
| Caracteres WinAnsi (Latin-1 + pontuação tipográfica) | Suportado |
| Caracteres fora do WinAnsi (CJK, árabe, emoji…) | Não implementado (exibidos como "?") |
| TrueType (TTF) com subsetting e incorporação | Em desenvolvimento (Fase 3) |
| OpenType/WOFF/WOFF2, kerning, ligaduras, shaping, fontes variáveis | Não implementado |

## PDF

| Recurso | Estado |
|---|---|
| PDF 1.7: objetos, xref, trailer, catálogo, árvore de páginas | Suportado |
| Compressão Flate | Suportado |
| Transparência (ExtGState) | Suportado |
| Metadados (Info) | Suportado |
| Saída determinística | Suportado |
| Links, marcadores, PDF/A, PDF acessível, formulários, criptografia, assinaturas | Não implementado |
