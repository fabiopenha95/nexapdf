import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, serializeValue, PdfName, PdfRef, PdfString, textString, pdfDate } from '../../src/pdf/pdf-objects.ts';
import { serializePDF } from '../../src/pdf/pdf-serializer.ts';
import { PdfStream } from '../../src/pdf/pdf-objects.ts';
import { NexaPDF } from '../../src/index.ts';
import { inspectPDF, pageContents, must } from '../helpers.ts';
import type { ConvertOptions } from '../../src/core/options.ts';

test('formatação de números', () => {
  assert.equal(formatNumber(1), '1');
  assert.equal(formatNumber(0.5), '0.5');
  assert.equal(formatNumber(1 / 3), '0.3333');
  assert.equal(formatNumber(-0.00001), '0');
  assert.equal(formatNumber(1e21 / 1e21), '1');
  assert.throws(() => formatNumber(NaN));
});

test('serialização de valores', () => {
  assert.equal(serializeValue(new PdfName('Type')), '/Type');
  assert.equal(serializeValue(new PdfName('A B#')), '/A#20B#23');
  assert.equal(serializeValue(new PdfRef(3)), '3 0 R');
  assert.equal(serializeValue(new PdfString('a(b)\\c')), '(a\\(b\\)\\\\c)');
  assert.equal(serializeValue([1, true, null]), '[1 true null]');
  assert.equal(serializeValue({ A: 1, B: new PdfName('X') }), '<< /A 1 /B /X >>');
});

test('strings de texto: ASCII literal, Unicode em UTF-16BE', () => {
  assert.equal(serializeValue(textString('Hello')), '(Hello)');
  assert.equal(serializeValue(textString('Olá')), '<FEFF004F006C00E1>');
});

test('datas no formato PDF', () => {
  assert.equal(pdfDate(new Date(Date.UTC(2026, 0, 2, 3, 4, 5))), 'D:20260102030405Z');
});

test('serializador: offsets da xref corretos e /Length dos streams', () => {
  const buf = serializePDF(
    [
      { id: 1, value: { Type: new PdfName('Catalog'), Pages: new PdfRef(2) } },
      { id: 2, value: { Type: new PdfName('Pages'), Kids: [], Count: 0 } },
      { id: 3, value: new PdfStream({}, Buffer.from('abc')) },
    ],
    { Root: new PdfRef(1) },
  );
  const info = inspectPDF(buf);
  assert.equal(info.size, 4);
  assert.match(buf.toString('latin1'), /\/Length 3 >>\nstream\nabc\nendstream/);
});

test('serializador exige ids contíguos', () => {
  assert.throws(() => serializePDF([{ id: 2, value: 1 }], {}));
});

test('PDF gerado é estruturalmente válido', async () => {
  const { buffer, pageCount } = await new NexaPDF().convert({ html: '<h1>Título</h1><p>Texto</p>' });
  const info = inspectPDF(buffer);
  assert.equal(info.pageCount, 1);
  assert.equal(pageCount, 1);
  assert.match(info.trailer, /\/Root \d+ 0 R/);
  assert.match(info.trailer, /\/ID \[<[0-9A-F]{32}> <[0-9A-F]{32}>\]/);
});

test('saída determinística: mesmos bytes para a mesma entrada', async () => {
  const pdf = new NexaPDF();
  const html = '<h1>Determinismo</h1><table><tr><td>a</td><td>b</td></tr></table>';
  const a = await pdf.convert({ html });
  const b = await pdf.convert({ html });
  assert.ok(a.buffer.equals(b.buffer));
});

test('recursos de fonte e conteúdo', async () => {
  const { buffer } = await new NexaPDF().convert({
    html: '<p>normal <b>negrito</b> <i>itálico</i> <code>mono</code></p>',
    options: { compress: false },
  });
  const text = buffer.toString('latin1');
  for (const f of ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Courier']) {
    assert.match(text, new RegExp(`/BaseFont /${f} `));
  }
  assert.match(text, /\/Encoding \/WinAnsiEncoding/);
  assert.ok(!text.includes('/FlateDecode'));
  const [content] = pageContents(buffer);
  assert.match(content, /\(it\\341lico\) Tj/); // "á" = 0xE1 = \341 em octal
});

test('compressão Flate reduz o tamanho', async () => {
  const html = '<p>' + 'conteúdo repetido '.repeat(400) + '</p>';
  const a = await new NexaPDF().convert({ html, options: { compress: true } });
  const b = await new NexaPDF().convert({ html, options: { compress: false } });
  assert.ok(a.buffer.length < b.buffer.length);
});

test('transparência usa ExtGState', async () => {
  const { buffer } = await new NexaPDF().convert({ html: '<div style="background: rgba(255,0,0,.5);height:20px"></div>', options: { compress: false } });
  assert.match(buffer.toString('latin1'), /\/Type \/ExtGState \/ca 0.5 \/CA 0.5/);
});

test('metadados', async () => {
  const { buffer } = await new NexaPDF().convert({
    html: '<title>Meu título</title><p>x</p>',
    options: { metadata: { author: 'Ana', creationDate: new Date(Date.UTC(2026, 4, 1)) } },
  });
  const text = buffer.toString('latin1');
  assert.match(text, /\/Title <FEFF/); // "Meu título" tem acento → UTF-16BE
  assert.match(text, /\/Author \(Ana\)/);
  assert.match(text, /\/CreationDate \(D:20260501000000Z\)/);
  assert.match(text, /\/Producer \(NexaPDF/);
});

test('tamanho de página no MediaBox (A4 retrato e paisagem, Letter)', async () => {
  const pdf = new NexaPDF();
  const mb = async (options: ConvertOptions) =>
    must(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec((await pdf.convert({ html: 'x', options })).buffer.toString('latin1'))).slice(1).map(Number);
  assert.deepEqual(await mb({ format: 'A4' }), [595.276, 841.89]);
  assert.deepEqual(await mb({ format: 'A4', orientation: 'landscape' }), [841.89, 595.276]);
  assert.deepEqual(await mb({ format: 'Letter' }), [612, 792]);
  assert.deepEqual(await mb({ width: '100mm', height: '50mm' }), [283.465, 141.732]);
});
