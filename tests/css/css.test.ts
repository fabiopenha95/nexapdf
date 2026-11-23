import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeCSS } from '../../src/css/tokenizer.ts';
import { parseStylesheet, parseDeclarations } from '../../src/css/parser.ts';
import { parseSelectorList, querySelectorAll } from '../../src/css/selector-engine.ts';
import { compareSpecificity } from '../../src/css/specificity.ts';
import { RuleIndex } from '../../src/css/cascade.ts';
import { computeStyles } from '../../src/css/computed-style.ts';
import { USER_AGENT_CSS } from '../../src/css/user-agent.ts';
import { expandDeclaration } from '../../src/css/properties/index.ts';
import { parseColorString } from '../../src/graphics/colors.ts';
import { parseHTML } from '../../src/html/parser.ts';
import type { ComputedStyle, CSSToken } from '../../src/css/types.ts';
import { must } from '../helpers.ts';

const sel = (s: string) => must(parseSelectorList(tokenizeCSS(s)));

function stylesFor(html: string, css = '') {
  const doc = parseHTML(html);
  const idx = new RuleIndex();
  const ua = parseStylesheet(USER_AGENT_CSS);
  idx.addStylesheet(ua, 'ua');
  let order = ua.nextOrder;
  for (const src of [...doc.findAll('style').map((s) => s.textContent), css]) {
    const sheet = parseStylesheet(src, { startOrder: order });
    order = sheet.nextOrder;
    idx.addStylesheet(sheet, 'author');
  }
  const styles = computeStyles(doc, idx, { rootFontSize: 12, viewportWidth: 500, viewportHeight: 700 });
  return { doc, styles, get: (tag: string): ComputedStyle => must(styles.get(must(doc.find(tag)))) };
}

/* ---------------------------------------------------------------- tokenizer */

test('tokenizador: números, dimensões, percentuais, hash, strings, funções', () => {
  const t = tokenizeCSS('a{width:10.5px;x:50%;c:#fff;d:"x\\"y";e:rgb(1,2,3);f:-2em;g:url(a b.png)}');
  const types = t.map((x) => x.type);
  assert.ok(types.includes('dimension'));
  assert.ok(types.includes('percentage'));
  assert.ok(types.includes('hash'));
  assert.ok(types.includes('function'));
  const dims = t.filter((x): x is Extract<CSSToken, { type: 'dimension' }> => x.type === 'dimension');
  assert.equal(dims[0]?.value, 10.5);
  assert.deepEqual(t.find((x) => x.type === 'string'), { type: 'string', value: 'x"y' });
  assert.equal(dims.find((x) => x.value < 0)?.unit, 'em');
});

test('tokenizador ignora comentários', () => {
  const t = tokenizeCSS('/* c */a/* d */{}');
  assert.deepEqual(t.map((x) => x.type), ['ident', '{', '}']);
});

/* ------------------------------------------------------------------- parser */

test('parser: regras, grupos, !important e declarações inválidas', () => {
  const s = parseStylesheet('h1, .a > b { color: red !important; ; margin: 0 } p { : x; color: blue }');
  assert.equal(s.rules.length, 2);
  assert.equal(s.rules[0].selectors.length, 2);
  assert.equal(s.rules[0].declarations[0].important, true);
  assert.equal(s.rules[1].declarations.length, 1);
});

test('parser: @media print incluído, screen descartado; @page coletado', () => {
  const s = parseStylesheet('@media screen { a { color: red } } @media print { b { color: blue } } @media all and (min-width: 1px) { i {} } @page { margin: 1cm }');
  const tags = s.rules.map((r) => {
    const simple = r.selectors[0]?.compounds[0]?.simples[0];
    return simple?.type === 'type' ? simple.name : null;
  });
  assert.deepEqual(tags, ['b', 'i']);
  assert.equal(s.pageRules.length, 1);
});

test('parser: seletor inválido descarta a regra inteira', () => {
  const s = parseStylesheet('a, p::before { color: red } b { color: blue }');
  assert.equal(s.rules.length, 1);
  assert.ok(s.warnings.length > 0);
});

test('parser: @import e @font-face são ignorados com aviso', () => {
  const s = parseStylesheet('@import url(x.css); @font-face { font-family: X } p { color: red }');
  assert.equal(s.rules.length, 1);
  assert.equal(s.warnings.length, 2);
});

/* ---------------------------------------------------------------- seletores */

test('especificidade', () => {
  const spec = (s: string) => must(sel(s)[0]).specificity;
  assert.deepEqual(spec('p'), [0, 0, 1]);
  assert.deepEqual(spec('.a.b'), [0, 2, 0]);
  assert.deepEqual(spec('#x p.a'), [1, 1, 1]);
  assert.deepEqual(spec('ul li:first-child'), [0, 1, 2]);
  assert.deepEqual(spec('a[href]'), [0, 1, 1]);
  assert.deepEqual(spec('*'), [0, 0, 0]);
  assert.ok(compareSpecificity(spec('#a'), spec('.a.b.c')) > 0);
});

test('correspondência de seletores', () => {
  const doc = parseHTML(`
    <div id="r" class="box">
      <p class="a">1</p><p>2</p>
      <section><p lang="pt-BR" class="a b">3</p></section>
      <ul><li>i</li><li>ii</li><li>iii</li><li>iv</li></ul>
    </div>`);
  const q = (s: string) => querySelectorAll(must(doc.documentElement), s, tokenizeCSS).map((e) => e.textContent.trim());
  assert.deepEqual(q('p.a'), ['1', '3']);
  assert.deepEqual(q('#r > p'), ['1', '2']);
  assert.deepEqual(q('div p'), ['1', '2', '3']);
  assert.deepEqual(q('p.a + p'), ['2']);
  assert.deepEqual(q('p.a ~ section p'), ['3']);
  assert.deepEqual(q('[lang|=pt]'), ['3']);
  assert.deepEqual(q('[class~=b]'), ['3']);
  assert.deepEqual(q('li:first-child'), ['i']);
  assert.deepEqual(q('li:last-child'), ['iv']);
  assert.deepEqual(q('li:nth-child(2n)'), ['ii', 'iv']);
  assert.deepEqual(q('li:nth-child(odd)'), ['i', 'iii']);
  assert.deepEqual(q('li:not(:first-child)'), ['ii', 'iii', 'iv']);
  assert.deepEqual(q('h1, li:nth-child(3)'), ['iii']);
});

/* -------------------------------------------------------------- propriedades */

test('shorthands: margin, padding, border, font, background', () => {
  const m = expandDeclaration('margin', tokenizeCSS('1px 2px 3px'));
  assert.deepEqual(m.map(([p]) => p), ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);
  assert.deepEqual(m[3]?.[1], { type: 'length', value: 2, unit: 'px' });
  const b = expandDeclaration('border', tokenizeCSS('2px dashed #f00'));
  assert.equal(b.length, 12);
  assert.equal(b.find(([p]) => p === 'border-left-style')?.[1], 'dashed');
  const f = Object.fromEntries(expandDeclaration('font', tokenizeCSS('italic bold 12px/1.5 "Open Sans", sans-serif')));
  assert.equal(f['font-style'], 'italic');
  assert.equal(f['font-weight'], 700);
  assert.deepEqual(f['font-size'], { type: 'length', value: 12, unit: 'px' });
  assert.deepEqual(f['line-height'], { type: 'number', value: 1.5 });
  assert.deepEqual(f['font-family'], ['Open Sans', 'sans-serif']);
  const bg = Object.fromEntries(expandDeclaration('background', tokenizeCSS('url(x.png) no-repeat #00ff00')));
  assert.deepEqual(bg['background-color'], { r: 0, g: 255, b: 0, a: 1 });
});

test('valores inválidos são descartados', () => {
  assert.deepEqual(expandDeclaration('width', tokenizeCSS('-10px')), []);
  assert.deepEqual(expandDeclaration('color', tokenizeCSS('notacolor')), []);
  assert.deepEqual(expandDeclaration('display', tokenizeCSS('grid-ish')), []);
  assert.deepEqual(expandDeclaration('propriedade-inexistente', tokenizeCSS('1px')), []);
});

test('cores', () => {
  assert.deepEqual(parseColorString('#abc'), { r: 170, g: 187, b: 204, a: 1 });
  assert.deepEqual(parseColorString('rebeccapurple'), { r: 102, g: 51, b: 153, a: 1 });
  assert.deepEqual(parseColorString('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(expandDeclaration('color', tokenizeCSS('rgba(10, 20, 30, .5)'))[0]?.[1], { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(expandDeclaration('color', tokenizeCSS('hsl(120 100% 25%)'))[0]?.[1], { r: 0, g: 128, b: 0, a: 1 });
});

/* ------------------------------------------------------ cascata e herança */

test('cascata: especificidade, ordem, !important e estilo inline', () => {
  const { get } = stylesFor(
    '<p id="x" class="c" style="margin-top: 7px">t</p>',
    '#x { color: red } p.c { color: blue } p { color: green !important; margin-top: 1px } p { color: navy }',
  );
  const s = get('p');
  assert.deepEqual(s.color, { r: 0, g: 128, b: 0, a: 1 }); // !important vence
  assert.equal(s['margin-top'], 7 * 0.75); // inline vence regra normal
});

test('herança e valores padrão', () => {
  const { get } = stylesFor('<div style="color: red; font-size: 20px; border: 1px solid"><span>x</span></div>');
  const span = get('span');
  assert.equal(span.color.r, 255);
  assert.equal(span['font-size'], 15); // 20px = 15pt
  assert.equal(span['border-top-width'], 0); // borda não herda
  const div = get('div');
  assert.equal(div['border-top-color'].r, 255); // currentcolor
});

test('unidades relativas: em, rem e percentual de font-size', () => {
  const { get } = stylesFor('<div style="font-size: 20px"><p style="font-size: 150%; padding-left: 2em; margin-left: 1rem">x</p></div>');
  const p = get('p');
  assert.equal(p['font-size'], 22.5);
  assert.equal(p['padding-left'], 45);
  assert.equal(p['margin-left'], 12);
});

test('inherit, initial e unset', () => {
  const { get } = stylesFor('<div style="color: red; padding: 4px"><p style="padding: inherit; color: initial">x</p></div>');
  const p = get('p');
  assert.equal(p['padding-top'], 3);
  assert.equal(p.color.r, 0);
});

test('folha padrão: títulos, listas, tabelas e elementos ocultos', () => {
  const { get } = stylesFor('<h1>t</h1><ul><li>x</li></ul><table><tr><td>c</td></tr></table><b>b</b>');
  assert.equal(get('h1')['font-size'], 24);
  assert.equal(get('h1')['font-weight'], 700);
  assert.equal(get('li').display, 'list-item');
  assert.equal(get('td').display, 'table-cell');
  assert.equal(get('head').display, 'none');
  assert.equal(get('b')['font-weight'], 700);
});

test('decorações de texto se propagam aos descendentes', () => {
  const { get } = stylesFor('<p style="text-decoration: underline"><span>x</span></p>');
  assert.deepEqual(get('span').textDecorations.map((d) => d.line), ['underline']);
});

test('parseDeclarations para atributo style', () => {
  const d = parseDeclarations('color:red;  font-weight : bold ;broken');
  assert.deepEqual(d.map((x) => x.property), ['color', 'font-weight']);
});
