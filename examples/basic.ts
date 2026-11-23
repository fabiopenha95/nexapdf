/**
 * Exemplo: gera examples/output/relatorio.pdf a partir de HTML/CSS.
 * Execute com: node examples/basic.js
 */

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NexaPDF } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'output');
await mkdir(outDir, { recursive: true });

const linhas = Array.from({ length: 40 }, (_, i) => {
  const qtd = (i * 7) % 13 + 1;
  const preco = 12.5 + ((i * 37) % 90);
  return `<tr><td>${String(i + 1).padStart(3, '0')}</td><td>Item de catálogo nº ${i + 1}</td><td class="num">${qtd}</td><td class="num">R$ ${preco.toFixed(2).replace('.', ',')}</td></tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório de Exemplo — NexaPDF</title>
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #222; line-height: 1.45; margin: 0; }
    h1 { font-size: 22pt; color: #0b3d91; margin: 0 0 4pt; }
    .subtitulo { color: #666; margin: 0 0 14pt; }
    h2 { font-size: 14pt; color: #0b3d91; border-bottom: 1.5pt solid #0b3d91; padding-bottom: 3pt; margin-top: 18pt; }
    .destaque { background: #eef3fb; border-left: 4pt solid #0b3d91; padding: 8pt 12pt; margin: 12pt 0; }
    .aviso { background-color: #fff7e0; border: 1px dashed #c99a00; padding: 6pt 10pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 8pt; }
    th { background: #0b3d91; color: white; text-align: left; padding: 5pt 6pt; }
    td { border-bottom: 0.75pt solid #ccd5e4; padding: 4pt 6pt; }
    tr:nth-child(even) td { background: #f6f8fc; }
    .num { text-align: right; }
    pre { background: #f4f4f4; border: 1px solid #ddd; padding: 8pt; font-size: 9pt; }
    .justificado { text-align: justify; }
    .quebra { break-before: page; }
    mark { background: #fff59d; }
  </style>
</head>
<body>
  <h1>Relatório de Exemplo</h1>
  <p class="subtitulo">Gerado pela <strong>NexaPDF</strong> — engine própria, sem navegador e sem dependências.</p>

  <div class="destaque">
    Este documento demonstra <strong>negrito</strong>, <em>itálico</em>, <u>sublinhado</u>,
    <s>tachado</s>, <mark>marca-texto</mark>, <a href="https://example.com">links</a>,
    acentuação (ação, coração, pão, avô, é, ü) e pontuação tipográfica: “aspas”, — travessão, … reticências, € 10.
  </div>

  <h2>1. Texto justificado</h2>
  <p class="justificado">A NexaPDF interpreta o HTML com um parser próprio, aplica a cascata CSS com
  especificidade e herança, calcula o layout de blocos, linhas e tabelas usando as métricas reais das fontes
  e só então distribui o conteúdo entre as páginas, respeitando quebras forçadas, órfãs, viúvas e linhas de
  tabela indivisíveis. O resultado é um PDF 1.7 válido, compacto e determinístico: a mesma entrada sempre
  produz exatamente os mesmos bytes.</p>

  <h2>2. Listas</h2>
  <ul>
    <li>Parser HTML5 tolerante a erros</li>
    <li>Cascata CSS completa
      <ul><li>Seletores, especificidade, <code>!important</code></li><li>Herança e valores computados</li></ul>
    </li>
    <li>Paginação baseada no fluxo do documento</li>
  </ul>
  <ol type="1">
    <li>Analisar</li><li>Estilizar</li><li>Posicionar</li><li>Paginar</li><li>Serializar</li>
  </ol>

  <p class="aviso">Observação: imagens, flexbox e fontes TrueType chegam nas próximas fases.</p>

  <h2>3. Código</h2>
  <pre>const pdf = new NexaPDF();
await pdf.convert({ html, output: './documento.pdf' });</pre>

  <h2>4. Tabela com cabeçalho repetido</h2>
  <table>
    <thead><tr><th>Código</th><th>Descrição</th><th class="num">Qtd.</th><th class="num">Preço</th></tr></thead>
    <tbody>
${linhas}
    </tbody>
  </table>

  <h2 class="quebra">5. Página iniciada por quebra manual</h2>
  <p>Este título usa <code>break-before: page</code>.</p>
</body>
</html>`;

const pdf = new NexaPDF();
const result = await pdf.convert({
  html,
  options: {
    header: { text: 'NexaPDF — Relatório de Exemplo', align: 'left', fontSize: 8 },
    footer: { text: 'Página {{page}} de {{pages}}', align: 'right', fontSize: 8 },
    metadata: { author: 'NexaPDF', subject: 'Demonstração' },
  },
  output: join(outDir, 'relatorio.pdf'),
});

console.log(`PDF gerado: ${result.path}`);
console.log(`Páginas: ${result.pageCount} · Tamanho: ${result.buffer.length} bytes`);
console.log('Tempos (ms):', result.metrics.timings);
if (result.warnings.length) console.log('Avisos:', result.warnings);
