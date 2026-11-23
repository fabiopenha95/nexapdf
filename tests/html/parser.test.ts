import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from '../../src/html/parser.ts';
import { tokenize } from '../../src/html/tokenizer.ts';
import { decodeEntities } from '../../src/html/entities.ts';
import { NodeType } from '../../src/html/dom-node.ts';
import { LimitExceededError } from '../../src/core/errors.ts';
import type { ChildNode } from '../../src/html/dom-node.ts';
import { must } from '../helpers.ts';

const parentTag = (node: ChildNode): string | null => (node.parent?.type === 'element' ? node.parent.tagName : null);

const INITIAL_ELEMENTS = [
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'a',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'section', 'article', 'header', 'footer', 'main', 'nav',
];

test('garante a estrutura html/head/body', () => {
  const doc = parseHTML('<p>oi</p>');
  assert.equal(must(doc.documentElement).tagName, 'html');
  assert.ok(doc.head);
  assert.ok(must(doc.body));
  assert.equal(must(doc.body).elementChildren[0].tagName, 'p');
});

for (const tag of INITIAL_ELEMENTS) {
  test(`reconhece o elemento <${tag}>`, () => {
    const doc = parseHTML(`<div id="w"><${tag} class="x">conteúdo</${tag}></div>`);
    const el = must(doc.find(tag === 'div' ? 'div' : tag));
    assert.ok(el, `elemento ${tag} não encontrado`);
    const target = tag === 'div' ? el.elementChildren[0] : el;
    assert.equal(target.tagName, tag);
    assert.equal(target.textContent, 'conteúdo');
  });
}

test('elementos vazios (br, hr, img) não recebem filhos', () => {
  const doc = parseHTML('<p>a<br>b<hr><img src="x.png" alt="y">c</p>');
  const body = must(doc.body);
  const br = must(doc.find('br'));
  assert.equal(br.children.length, 0);
  assert.equal(must(doc.find('img')).getAttribute('alt'), 'y');
  // <hr> fecha o <p> implicitamente
  assert.deepEqual(body.elementChildren.map((e) => e.tagName), ['p', 'hr', 'img']);
  assert.equal(must(doc.find('p')).textContent, 'ab');
  assert.equal(must(doc.find('hr')).children.length, 0);
});

test('fechamentos implícitos de p e li', () => {
  const doc = parseHTML('<p>um<p>dois<ul><li>a<li>b</ul>');
  const ps = doc.findAll('p');
  assert.equal(ps.length, 2);
  assert.equal(ps[0].textContent, 'um');
  const lis = doc.findAll('li');
  assert.deepEqual(lis.map((l) => l.textContent), ['a', 'b']);
  assert.equal(parentTag(must(lis[0])), 'ul');
});

test('tabelas: tbody e tr implícitos, td fecha td', () => {
  const doc = parseHTML('<table><tr><td>1<td>2</table>');
  const table = must(doc.find('table'));
  assert.equal(table.elementChildren[0].tagName, 'tbody');
  const tds = doc.findAll('td');
  assert.equal(tds.length, 2);
  assert.equal(parentTag(must(tds[1])), 'tr');
});

test('thead/tbody/tfoot fecham-se mutuamente', () => {
  const doc = parseHTML('<table><thead><tr><th>h<tbody><tr><td>b<tfoot><tr><td>f</table>');
  const table = must(doc.find('table'));
  assert.deepEqual(table.elementChildren.map((e) => e.tagName), ['thead', 'tbody', 'tfoot']);
});

test('atributos: aspas, sem aspas, booleanos, duplicados e entidades', () => {
  const doc = parseHTML(`<div id=a class='x y' data-v="1 &amp; 2" hidden id="b"></div>`);
  const div = must(doc.find('div'));
  assert.equal(div.id, 'a');
  assert.deepEqual(div.classList, ['x', 'y']);
  assert.equal(div.getAttribute('data-v'), '1 & 2');
  assert.equal(div.getAttribute('hidden'), '');
});

test('entidades nomeadas, decimais e hexadecimais', () => {
  assert.equal(decodeEntities('&lt;a&gt; &amp; &quot;'), '<a> & "');
  assert.equal(decodeEntities('a&ccedil;&atilde;o &eacute;'), 'ação é');
  assert.equal(decodeEntities('&#233;&#xE9;&#x1F600;'), 'éé😀');
  assert.equal(decodeEntities('&#150;'), '–'); // faixa C1 → Windows-1252
  assert.equal(decodeEntities('&naoexiste;'), '&naoexiste;');
  assert.equal(decodeEntities('AT&T'), 'AT&T');
});

test('Unicode preservado', () => {
  const doc = parseHTML('<p>Olá, 世界 — ✓</p>');
  assert.equal(must(doc.find('p')).textContent, 'Olá, 世界 — ✓');
});

test('comentários e doctype', () => {
  const doc = parseHTML('<!DOCTYPE html><!-- topo --><p>a<!-- meio -->b</p>');
  assert.equal(doc.doctype, 'html');
  const p = must(doc.find('p'));
  assert.equal(p.children.filter((c) => c.type === NodeType.COMMENT).length, 1);
  assert.equal(p.textContent, 'ab');
});

test('conteúdo de style e script é texto bruto', () => {
  const doc = parseHTML('<style>p > b { color: red }</style><script>if (a < b) { x("</div>") }</script><p>x</p>');
  assert.equal(must(doc.find('style')).textContent, 'p > b { color: red }');
  assert.match(must(doc.find('script')).textContent, /a < b/);
  assert.equal(parentTag(must(doc.find('style'))), 'head');
});

test('tags de fechamento sem abertura são ignoradas', () => {
  const doc = parseHTML('<div>a</span>b</div></p>c');
  assert.equal(must(doc.find('div')).textContent, 'ab');
});

test('ordem dos elementos é preservada', () => {
  const doc = parseHTML('<h1>1</h1><p>2</p><h2>3</h2><div>4</div>');
  assert.deepEqual(must(doc.body).elementChildren.map((e) => e.textContent), ['1', '2', '3', '4']);
});

test('quebra de linha inicial de <pre> é ignorada', () => {
  const doc = parseHTML('<pre>\nlinha 1\nlinha 2</pre>');
  assert.equal(must(doc.find('pre')).textContent, 'linha 1\nlinha 2');
});

test('"<" sem marcação é texto', () => {
  const doc = parseHTML('<p>1 < 2 e 3 <= 4</p>');
  assert.equal(must(doc.find('p')).textContent, '1 < 2 e 3 <= 4');
});

test('limite de profundidade protege contra aninhamento excessivo', () => {
  const html = '<div>'.repeat(100);
  assert.throws(() => parseHTML(html, { maxDepth: 50 }), LimitExceededError);
  assert.doesNotThrow(() => parseHTML(html, { maxDepth: 200 }));
});

test('limite de quantidade de nós', () => {
  const html = '<span>x</span>'.repeat(200);
  assert.throws(() => parseHTML(html, { maxNodes: 100 }), (e: unknown) => e instanceof LimitExceededError && e.code === 'LIMIT_EXCEEDED');
});

test('tokenizador emite tokens esperados', () => {
  const tokens = [...tokenize('<a href="x">t</a><br/>')];
  assert.deepEqual(tokens.map((t) => t.type), ['startTag', 'text', 'endTag', 'startTag']);
  const br = tokens[3];
  assert.ok(br?.type === 'startTag' && br.selfClosing);
});
