import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../../src/core/pipeline.ts';
import { toPoints, parseMeasure, PT_PER_MM } from '../../src/layout/measurements.ts';
import { collapseMargins } from '../../src/layout/box-model.ts';
import type { Box } from '../../src/layout/types.ts';
import type { ConvertOptions } from '../../src/core/options.ts';
import { must } from '../helpers.ts';

/** Executa o pipeline e devolve a árvore de caixas para inspeção. */
function layout(html: string, css = '', options: ConvertOptions = {}) {
  const r = runPipeline({ html, css, options: { margin: 0, format: 'A4', ...options } });
  const boxes: Box[] = [];
  const walk = (b: Box): void => {
    boxes.push(b);
    b.children.forEach(walk);
  };
  walk(must(r.debug.layout.root));
  const byId = (id: string): Box => must(boxes.find((b) => b.element?.id === id), `#${id} não encontrado`);
  const maybeById = (id: string): Box | undefined => boxes.find((b) => b.element?.id === id);
  return { r, boxes, byId, maybeById, contentWidth: r.debug.config.contentWidth };
}

const linesOf = (b: Box) => must(b.lines, 'caixa sem linhas');
const close = (a: number, b: number, eps = 0.01): void => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('conversões de unidades', () => {
  assert.equal(toPoints(1, 'in'), 72);
  assert.equal(toPoints(96, 'px'), 72);
  close(toPoints(1, 'mm'), 2.8346457);
  close(PT_PER_MM * 25.4, 72, 1e-12);
  assert.equal(parseMeasure('2.5cm'), toPoints(25, 'mm'));
  assert.equal(parseMeasure(10), toPoints(10, 'mm'));
  assert.equal(parseMeasure('abc'), null);
});

test('colapso de margens', () => {
  assert.equal(collapseMargins(10, 20), 20);
  assert.equal(collapseMargins(10, -5), 5);
  assert.equal(collapseMargins(-10, -5), -10);
});

test('largura auto preenche o bloco contêiner; padding e borda', () => {
  const { byId, contentWidth } = layout('<div id="a" style="padding: 10pt; border: 2pt solid">x</div>', 'body{margin:0}');
  const a = byId('a');
  close(a.width, contentWidth);
  close(a.contentWidth, contentWidth - 24);
});

test('box-sizing e largura fixa', () => {
  const { byId } = layout(
    '<div id="c" style="width:100pt;padding:10pt;border:5pt solid"></div><div id="b" style="box-sizing:border-box;width:100pt;padding:10pt;border:5pt solid"></div>',
    'body{margin:0}',
  );
  close(byId('c').width, 130);
  close(byId('b').width, 100);
  close(byId('b').contentWidth, 70);
});

test('margens auto centralizam; max-width limita', () => {
  const { byId, contentWidth } = layout('<div id="a" style="width:200pt;margin:0 auto">x</div><div id="m" style="max-width:100pt">y</div>', 'body{margin:0}');
  close(byId('a').x, (contentWidth - 200) / 2);
  close(byId('m').width, 100);
});

test('colapso de margens entre irmãos e com o pai', () => {
  const { byId } = layout(
    '<div id="p"><div id="a" style="margin-bottom:20pt;height:10pt"></div><div id="b" style="margin-top:30pt;height:10pt"></div></div>',
    'body{margin:0} #p{margin-top:5pt}',
  );
  // irmãos: max(20, 30) = 30
  close(byId('b').y - (byId('a').y + byId('a').height), 30);
  // pai sem borda/padding: margens do pai e do primeiro filho colapsam (0 vs 5)
  close(byId('a').y, byId('p').y);
});

test('quebra de linhas usa as métricas reais da fonte', () => {
  // "Hello " em Helvetica 10pt = 27.36pt (Hello=22.78 + espaço 2.78)
  const { byId } = layout('<p id="p" style="width:60pt;font:10pt Helvetica;margin:0">Hello Hello Hello Hello</p>', 'body{margin:0}');
  const p = byId('p');
  assert.equal(linesOf(p).length, 2); // 2 palavras por linha (22.78 + 2.78 + 22.78 = 48.34 ≤ 60)
  assert.equal(linesOf(p)[0].fragments.map((f) => f.text).join(''), 'Hello Hello');
});

test('altura de linha e altura do bloco', () => {
  const { byId } = layout('<p id="p" style="font-size:10pt;line-height:20pt;margin:0;width:60pt">Hello Hello Hello Hello</p>', 'body{margin:0}');
  const p = byId('p');
  close(linesOf(p)[0].height, 20);
  close(p.height, 40);
});

test('text-align: center, right e justify', () => {
  const { byId } = layout(
    '<p id="c" style="text-align:center;width:100pt">ab</p><p id="r" style="text-align:right;width:100pt">ab</p><p id="j" style="text-align:justify;width:100pt">aa bb cc dd ee ff gg hh ii jj kk</p>',
    'body{margin:0} p{margin:0;font:10pt Helvetica}',
  );
  const lc = linesOf(byId('c'))[0];
  close(lc.fragments[0].x + lc.fragments[0].width / 2, 50);
  const lr = linesOf(byId('r'))[0];
  close(lr.fragments[0].x + lr.fragments[0].width, 100);
  const lj = linesOf(byId('j'))[0];
  const last = lj.fragments[lj.fragments.length - 1];
  close(last.x + last.width, 100); // linha justificada vai até a borda
});

test('espaços colapsados; white-space: pre preserva', () => {
  const { byId } = layout('<p id="n">  a    b  </p><pre id="p">a    b\nc</pre>', 'body{margin:0}');
  assert.equal(linesOf(byId('n'))[0].fragments.map((f) => f.text).join(''), 'a b');
  const pre = byId('p');
  assert.equal(linesOf(pre).length, 2);
  assert.equal(linesOf(pre)[0].fragments[0].text, 'a    b');
});

test('<br> força quebra de linha', () => {
  const { byId } = layout('<p id="p">um<br>dois<br>três</p>', 'body{margin:0}');
  assert.equal(linesOf(byId('p')).length, 3);
});

test('overflow-wrap: break-word quebra palavras longas', () => {
  const long = 'x'.repeat(80);
  const { byId } = layout(`<p id="a" style="width:50pt">${long}</p><p id="b" style="width:50pt;overflow-wrap:break-word">${long}</p>`, 'body{margin:0}');
  assert.equal(linesOf(byId('a')).length, 1);
  assert.ok(linesOf(byId('b')).length > 1);
});

test('marcadores de lista', () => {
  const { byId } = layout('<ol><li id="a">um</li><li>dois</li></ol><ul><li id="u">x</li></ul>', 'body{margin:0}');
  const m = must(linesOf(byId('a'))[0]?.markers?.[0]);
  assert.equal(m.text?.trim(), '1.');
  assert.ok(must(m.x) < byId('a').contentX);
  assert.equal(linesOf(byId('u'))[0]?.markers?.[0]?.shape, 'disc');
});

test('tabela: largura 100%, colunas proporcionais ao conteúdo', () => {
  const { boxes, contentWidth } = layout(
    '<table style="width:100%;border-collapse:collapse"><tr><td>a</td><td>texto bem mais longo nesta célula</td></tr></table>',
    'body{margin:0}',
  );
  const table = must(boxes.find((b) => b.kind === 'table'));
  close(table.width, contentWidth);
  const cells = boxes.filter((b) => b.kind === 'cell');
  assert.ok(cells[1].width > cells[0].width);
  close(cells[0].width + cells[1].width, contentWidth);
});

test('tabela: linhas com a altura da maior célula, colspan', () => {
  const { boxes } = layout(
    '<table><tr><td>a<br>b<br>c</td><td>x</td></tr><tr><td colspan="2">largo</td></tr></table>',
    'body{margin:0}',
  );
  const cells = boxes.filter((b) => b.kind === 'cell');
  assert.equal(cells[0].height, cells[1].height);
  const sp = 1.5; // border-spacing padrão 2px
  close(cells[2].width, cells[0].width + cells[1].width + sp);
});

test('display: none remove o elemento do layout', () => {
  const { maybeById } = layout('<div id="a">x</div><div id="b" style="display:none">y</div>');
  assert.ok(maybeById('a'));
  assert.equal(maybeById('b'), undefined);
});
