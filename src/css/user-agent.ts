/**
 * Folha de estilo padrão do agente (user agent stylesheet).
 * Baseada nos valores recomendados pela especificação HTML (seção 15,
 * "Rendering"), ajustados para o meio de impressão.
 */

export const USER_AGENT_CSS = `
html, address, blockquote, body, center, div, dl, dt, dd, fieldset, figure, figcaption,
footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, legend, main, menu, nav, ol, p,
pre, section, article, aside, ul, details, summary { display: block; }

head, script, style, title, meta, link, base, template, noscript, area, datalist, param,
[hidden] { display: none; }

body { margin: 8px; }

p, dl, figure, blockquote { margin-top: 1em; margin-bottom: 1em; }
blockquote, figure { margin-left: 40px; margin-right: 40px; }
dd { margin-left: 40px; }

h1, h2, h3, h4, h5, h6 { font-weight: bold; break-after: avoid; break-inside: avoid; }
h1 { font-size: 2em; margin-top: 0.67em; margin-bottom: 0.67em; }
h2 { font-size: 1.5em; margin-top: 0.83em; margin-bottom: 0.83em; }
h3 { font-size: 1.17em; margin-top: 1em; margin-bottom: 1em; }
h4 { font-size: 1em; margin-top: 1.33em; margin-bottom: 1.33em; }
h5 { font-size: 0.83em; margin-top: 1.67em; margin-bottom: 1.67em; }
h6 { font-size: 0.67em; margin-top: 2.33em; margin-bottom: 2.33em; }

strong, b, th { font-weight: bolder; }
em, i, cite, var, dfn, address { font-style: italic; }
u, ins { text-decoration: underline; }
s, strike, del { text-decoration: line-through; }
small, sub, sup { font-size: smaller; }
big { font-size: larger; }
center { text-align: center; }
mark { background-color: yellow; color: black; }

pre, code, kbd, samp, tt { font-family: monospace; font-size: 0.8125em; }
pre code, pre kbd, pre samp, pre tt { font-size: 1em; }
pre { white-space: pre; margin-top: 1em; margin-bottom: 1em; }

ul, ol, menu { padding-left: 40px; margin-top: 1em; margin-bottom: 1em; }
ol { list-style-type: decimal; }
ul ul, ol ul, menu ul { list-style-type: circle; }
ul ul ul, ul ol ul, ol ul ul, ol ol ul { list-style-type: square; }
ul ul, ul ol, ol ul, ol ol { margin-top: 0; margin-bottom: 0; }
li { display: list-item; }

hr { margin: 0.5em auto; border-style: solid; border-width: 1px; border-color: #9a9a9a; }

table { display: table; border-collapse: separate; border-spacing: 2px; }
caption { display: table-caption; text-align: center; }
thead { display: table-header-group; }
tbody { display: table-row-group; }
tfoot { display: table-footer-group; }
tr { display: table-row; break-inside: avoid; }
td, th { display: table-cell; padding: 1px; vertical-align: middle; }
th { text-align: center; }
col { display: table-column; }
colgroup { display: table-column-group; }

a:any-link { color: #0000ee; text-decoration: underline; }
img { display: inline-block; }
`;
