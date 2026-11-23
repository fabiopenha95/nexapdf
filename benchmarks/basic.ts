/**
 * Benchmark reproduzível da NexaPDF.
 *
 * Mede, para cada cenário: tempo médio/mediano/p95 de conversão, memória
 * (heap) e tamanho do PDF. Também mede conversões concorrentes.
 *
 *   node benchmarks/basic.js [iterações]
 *
 * A comparação com Puppeteer não está incluída para manter o projeto sem
 * dependências; para compará-los, execute cenários equivalentes no mesmo
 * equipamento e publique o script e os resultados de ambos.
 */

import { performance } from 'node:perf_hooks';
import { NexaPDF } from '../src/index.ts';

const iterations = Number(process.argv[2] ?? 30);

const paragraph = '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Donec ullamcorper nulla non metus auctor fringilla.</p>';
const table = (rows: number): string =>
  `<table style="width:100%;border-collapse:collapse"><thead><tr><th>#</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${Array.from(
    { length: rows },
    (_, i) => `<tr><td>${i + 1}</td><td>Item ${i + 1}</td><td>R$ ${(i * 3.7).toFixed(2)}</td></tr>`,
  ).join('')}</tbody></table>`;

const scenarios = {
  'uma página': `<h1>Título</h1>${paragraph.repeat(5)}`,
  '10 páginas (texto)': `<h1>Título</h1>${paragraph.repeat(120)}`,
  'tabela 500 linhas': table(500),
  '50 páginas (misto)': `${paragraph.repeat(300)}${table(800)}`,
};

function stats(samples: number[]): { média: number; mediana: number; p95: number } {
  const s = [...samples].sort((a, b) => a - b);
  const pick = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { média: s.reduce((a, b) => a + b, 0) / s.length, mediana: pick(0.5), p95: pick(0.95) };
}

const fmt = (n: number): string => n.toFixed(2).padStart(8);
const pdf = new NexaPDF();

console.log(`Node ${process.version} · ${iterations} iterações por cenário`);
const t0 = performance.now();
await pdf.convert({ html: scenarios['uma página'] });
console.log(`Primeira conversão (a frio, inclui JIT e folha padrão): ${(performance.now() - t0).toFixed(2)} ms\n`);
console.log('Cenário                  páginas   média ms  mediana     p95   heap MB   PDF KB');

for (const [name, html] of Object.entries(scenarios)) {
  await pdf.convert({ html }); // aquecimento
  const times = [];
  let result = await pdf.convert({ html });
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  let heapPeak = heapBefore;
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    result = await pdf.convert({ html });
    times.push(performance.now() - t);
    heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
  }
  const st = stats(times);
  console.log(
    `${name.padEnd(24)} ${String(result.pageCount).padStart(7)} ${fmt(st.média)} ${fmt(st.mediana)} ${fmt(st.p95)} ${fmt((heapPeak - heapBefore) / 1048576)} ${fmt(result.buffer.length / 1024)}`,
  );
}

// Concorrência: N conversões disparadas ao mesmo tempo (mesma thread).
const N = 20;
const t1 = performance.now();
await Promise.all(Array.from({ length: N }, () => pdf.convert({ html: scenarios['10 páginas (texto)'] })));
console.log(`\n${N} conversões concorrentes (10 páginas): ${(performance.now() - t1).toFixed(1)} ms no total`);
