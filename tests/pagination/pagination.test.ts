import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../../src/core/pipeline.ts';
import { buildUnits } from '../../src/pagination/fragmentation.ts';
import { pageTexts } from '../helpers.ts';
import { LimitExceededError } from '../../src/core/errors.ts';
import type { ConvertOptions } from '../../src/core/options.ts';
import type { PipelineResult } from '../../src/core/pipeline.ts';
import type { Box } from '../../src/layout/types.ts';
import { must } from '../helpers.ts';

const para = (n: number, words = 60): string => Array.from({ length: n }, (_, i) => `<p>Parágrafo ${i + 1}. ${'texto '.repeat(words)}</p>`).join('');

function run(html: string, options: ConvertOptions = {}): PipelineResult {
  return runPipeline({ html, options: { format: 'A5', margin: 10, ...options } });
}

/** Verifica que nenhuma linha atravessa o limite de página. */
function assertNoLineCrossesPage(r: PipelineResult): void {
  const H = r.debug.pagination.pageContentHeight;
  for (const leaf of r.debug.pagination.leaves) {
    if (leaf.kind !== 'line' || !leaf.line) continue;
    const top = leaf.line.y + leaf.delta;
    const bottom = top + leaf.line.height;
    const page = Math.floor((top + 0.01) / H);
    assert.ok(bottom <= (page + 1) * H + 0.02, `linha atravessa a página ${page + 1}`);
  }
}

test('documento curto ocupa uma página', () => {
  const r = run('<p>oi</p>');
  assert.equal(r.pageCount, 1);
});

test('documento vazio gera uma página', () => {
  assert.equal(run('').pageCount, 1);
});

test('conteúdo extenso é distribuído sem cortar linhas', () => {
  const r = run(para(30));
  assert.ok(r.pageCount > 3, `esperava várias páginas, obteve ${r.pageCount}`);
  assertNoLineCrossesPage(r);
  // Todo o texto está presente, em ordem.
  const texts = pageTexts(r.buffer).flat().map((t) => t.text).join(' ');
  for (let i = 1; i <= 30; i++) assert.ok(texts.includes(`Parágrafo ${i}.`.replace('á', '\xe1')), `parágrafo ${i} ausente`);
});

test('a quantidade de páginas cresce com o conteúdo', () => {
  const a = run(para(10)).pageCount;
  const b = run(para(40)).pageCount;
  assert.ok(b > a);
});

test('break-before: page inicia nova página', () => {
  const r = run('<p>a</p><h2 style="break-before: page">b</h2><p>c</p><div style="page-break-before: always">d</div>');
  assert.equal(r.pageCount, 3);
  const pages = pageTexts(r.buffer);
  assert.deepEqual(pages.map((p) => p.map((t) => t.text).join('')), ['a', 'bc', 'd']);
});

test('break-after: page', () => {
  const r = run('<p style="break-after: page">a</p><p>b</p>');
  assert.equal(r.pageCount, 2);
});

test('quebra forçada no início do documento não gera página vazia', () => {
  const r = run('<h1 style="break-before: page">a</h1>');
  assert.equal(r.pageCount, 1);
});

test('break-inside: avoid mantém o bloco inteiro na mesma página', () => {
  const filler = para(5);
  const box = `<div id="k" style="break-inside: avoid">${'<p>linha de conteúdo</p>'.repeat(8)}</div>`;
  const r = run(filler + box);
  const H = r.debug.pagination.pageContentHeight;
  const kBoxes: Box[] = [];
  const walk = (b: Box): void => {
    if (b.element?.id === 'k') kBoxes.push(b);
    b.children.forEach(walk);
  };
  walk(must(r.debug.layout.root));
  const k = must(kBoxes[0]);
  const first = must(r.debug.pagination.leaves[k.firstLeaf]);
  const last = must(r.debug.pagination.leaves[k.lastLeaf]);
  const p1 = Math.floor((first.top + first.delta + 0.01) / H);
  const p2 = Math.floor((last.bottom + last.delta - 0.01) / H);
  assert.equal(p1, p2);
  assert.ok(k.lastLeaf - k.firstLeaf >= 7);
});

test('títulos não ficam isolados no fim da página (break-after: avoid)', () => {
  // Preenche quase uma página inteira e coloca um título no final.
  for (let n = 1; n < 40; n++) {
    const r = run(`${'<p style="margin:0">linha</p>'.repeat(n)}<h2>Título</h2><p>${'texto '.repeat(40)}</p>`);
    const pages = pageTexts(r.buffer);
    const pageWithTitle = pages.findIndex((p) => p.some((t) => t.text === 'Título'));
    const pageWithNext = pages.findIndex((p) => p.some((t) => t.text.startsWith('texto')));
    assert.equal(pageWithTitle, pageWithNext, `n=${n}: título separado do parágrafo seguinte`);
  }
});

test('órfãs e viúvas: parágrafo dividido mantém ao menos 2 linhas de cada lado', () => {
  for (let n = 1; n < 30; n++) {
    const r = run(`${'<p style="margin:0">linha</p>'.repeat(n)}<p id="alvo" style="margin:0">${'palavra '.repeat(120)}</p>`);
    const H = r.debug.pagination.pageContentHeight;
    const leaves = r.debug.pagination.leaves.filter((l) => l.owner?.element?.id === 'alvo');
    const pages = leaves.map((l) => Math.floor((l.top + l.delta + 0.01) / H));
    const counts: Record<number, number> = {};
    for (const p of pages) counts[p] = (counts[p] ?? 0) + 1;
    for (const c of Object.values(counts)) assert.ok(c >= 2 || leaves.length < 2, `n=${n}: fragmento com ${c} linha`);
  }
});

test('linhas de tabela não são divididas e o thead se repete', () => {
  const rows = Array.from({ length: 80 }, (_, i) => `<tr><td>linha ${i + 1}</td><td>valor</td></tr>`).join('');
  const r = run(`<table><thead><tr><th>Cabeçalho</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>`);
  assert.ok(r.pageCount >= 2);
  assertNoLineCrossesPage(r);
  const pages = pageTexts(r.buffer);
  for (const p of pages) {
    const header = p.find((t) => t.text.startsWith('Cabe'));
    assert.ok(header, 'cabeçalho ausente em uma das páginas');
    const firstRow = p.filter((t) => t.text.startsWith('linha')).sort((a, b) => b.y - a.y)[0];
    assert.ok(header.y > firstRow.y, 'cabeçalho deve estar acima da primeira linha');
  }
  // Todas as 80 linhas aparecem exatamente uma vez.
  const all = pages.flat().filter((t) => t.text.startsWith('linha')).map((t) => t.text);
  assert.equal(all.length, 80);
  assert.equal(new Set(all).size, 80);
});

test('linha de tabela maior que a página é dividida por linhas de texto (regressão)', () => {
  const html = `<table><thead><tr><th>Cab</th></tr></thead><tr><td>${'texto<br>'.repeat(120)}</td></tr></table>`;
  const r = run(html, { format: 'A6' });
  assert.ok(r.pageCount >= 3);
  assertNoLineCrossesPage(r);
  for (const p of pageTexts(r.buffer)) assert.ok(p.some((t) => t.text === 'Cab'), 'cabeçalho deve se repetir');
});

test('conteúdo não se sobrepõe entre unidades consecutivas', () => {
  const r = run(para(20) + '<table>' + '<tr><td>x</td></tr>'.repeat(50) + '</table>' + para(10));
  const leaves = r.debug.pagination.leaves;
  let prevDelta = -Infinity;
  for (const l of leaves) {
    assert.ok(l.delta >= prevDelta - 1e-9, 'deslocamentos devem ser não decrescentes');
    prevDelta = l.delta;
  }
});

test('limite máximo de páginas', () => {
  assert.throws(() => run(para(200), { limits: { maxPages: 3 } }), LimitExceededError);
});

test('buildUnits: faixas sobrepostas são unidas; quebras forçadas dividem', () => {
  const leaves: { top: number; bottom: number; forceBreak?: boolean }[] = Array.from({ length: 6 }, (_, i) => ({ top: i * 10, bottom: i * 10 + 10 }));
  must(leaves[4]).forceBreak = true;
  const units = buildUnits(leaves, [{ start: 0, end: 2 }, { start: 2, end: 5 }]);
  assert.deepEqual(units.map((u) => [u.start, u.end]), [[0, 3], [4, 5]]);
});
