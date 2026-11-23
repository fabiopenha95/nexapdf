import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_FONTS } from '../../src/fonts/data/standard-metrics.ts';
import { FontManager } from '../../src/fonts/font-manager.ts';
import { measureText, normalLineHeight, resolveLineHeight } from '../../src/fonts/text-measurement.ts';
import { encodeWinAnsi, winAnsiByte } from '../../src/fonts/glyph-mapping.ts';

test('tabelas de larguras cobrem 0x20–0xFF sem lacunas', () => {
  for (const [name, f] of Object.entries(STANDARD_FONTS)) {
    for (let b = 0x20; b <= 0xff; b++) assert.ok(f.widths[b] > 0, `${name} sem largura para 0x${b.toString(16)}`);
  }
});

test('larguras AFM conhecidas (Helvetica)', () => {
  const fm = new FontManager();
  const regular = fm.resolve({ 'font-family': ['Helvetica'], 'font-weight': 400, 'font-style': 'normal' });
  const bold = fm.resolve({ 'font-family': ['Arial'], 'font-weight': 700, 'font-style': 'normal' });
  // H=722 e=556 l=222 l=222 o=556 → 2278/1000 em
  assert.equal(measureText('Hello', regular, 12), 27.336);
  // H=722 e=556 l=278 l=278 o=611 → 2445/1000 em
  assert.equal(measureText('Hello', bold, 10), 24.45);
  // acentuação: ç=500, ã=556, o=556
  assert.equal(measureText('ção', regular, 1000), 1612);
});

test('Courier é monoespaçada (600/1000)', () => {
  const fm = new FontManager();
  const mono = fm.resolve({ 'font-family': ['monospace'], 'font-weight': 400, 'font-style': 'normal' });
  assert.equal(mono.key, 'Courier');
  assert.equal(measureText('iiiiWWWW', mono, 10), 48);
});

test('letter-spacing é somado por caractere', () => {
  const fm = new FontManager();
  const f = fm.resolve({ 'font-family': ['sans-serif'], 'font-weight': 400, 'font-style': 'normal' });
  assert.equal(measureText('abc', f, 10, 2) - measureText('abc', f, 10), 6);
});

test('seleção de variantes: negrito, itálico, negrito-itálico', () => {
  const fm = new FontManager();
  const k = (w: number, s: 'normal' | 'italic' | 'oblique', fam = ['Helvetica']) => fm.resolve({ 'font-family': fam, 'font-weight': w, 'font-style': s }).key;
  assert.equal(k(400, 'normal'), 'Helvetica');
  assert.equal(k(700, 'normal'), 'Helvetica-Bold');
  assert.equal(k(400, 'italic'), 'Helvetica-Oblique');
  assert.equal(k(800, 'oblique'), 'Helvetica-BoldOblique');
  assert.equal(k(700, 'italic', ['Courier New']), 'Courier-BoldOblique');
  assert.equal(fm.usedFaces().length, 5);
});

test('line-height: normal, número e comprimento', () => {
  const fm = new FontManager();
  const f = fm.resolve({ 'font-family': ['Helvetica'], 'font-weight': 400, 'font-style': 'normal' });
  assert.ok(Math.abs(normalLineHeight(f, 10) - 11.5) < 1e-9);
  assert.equal(resolveLineHeight({ 'line-height': { type: 'number', value: 1.5 }, 'font-size': 10 }, f), 15);
  assert.equal(resolveLineHeight({ 'line-height': 20, 'font-size': 10 }, f), 20);
});

test('WinAnsiEncoding: Latin-1, pontuação e substituição', () => {
  assert.deepEqual([...encodeWinAnsi('Aé€“”—•')], [0x41, 0xe9, 0x80, 0x93, 0x94, 0x97, 0x95]);
  assert.deepEqual([...encodeWinAnsi('世')], [0x3f]);
  assert.equal(winAnsiByte(0x2212), 0x2d); // sinal de menos → hífen
});
