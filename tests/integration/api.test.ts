import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NexaPDF,
  NexaPDFError,
  ConfigurationError,
  LimitExceededError,
  ConversionTimeoutError,
} from '../../src/index.ts';
import { inspectPDF, allText, pageTexts } from '../helpers.ts';

const REFERENCE_DOCS = {
  'texto simples': '<p>Olá mundo</p>',
  parágrafos: '<p>Um</p><p>Dois</p><p>Três</p>',
  títulos: '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>',
  listas: '<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>',
  tabelas: '<table border="1"><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
  'diferentes fontes': '<p style="font-family: monospace">mono</p><p style="font-family: serif">serif</p><p><b>bold</b> <i>it</i></p>',
  bordas: '<div style="border: 2px dashed red; padding: 4px">a</div><div style="border: 3px double blue">b</div><div style="border-bottom: 2px dotted">c</div>',
  cores: '<p style="color: #c00; background: lightyellow">cor</p><p style="color: rgb(0 128 0)">verde</p>',
  margens: '<div style="margin: 20px 40px; padding: 1cm">m</div>',
  'conteúdo extenso': '<p>' + 'longo '.repeat(3000) + '</p>',
  'quebras manuais': '<p>1</p><p style="break-before: page">2</p>',
};

for (const [name, html] of Object.entries(REFERENCE_DOCS)) {
  test(`documento de referência: ${name}`, async () => {
    const r = await new NexaPDF().convert({ html });
    const info = inspectPDF(r.buffer);
    assert.equal(info.pageCount, r.pageCount);
    assert.ok(r.pageCount >= 1);
  });
}

test('convert retorna buffer em memória (output omitido ou "buffer")', async () => {
  const pdf = new NexaPDF();
  const a = await pdf.convert({ html: '<h1>Documento</h1>' });
  const b = await pdf.convert({ html: '<h1>Documento</h1>', output: 'buffer' });
  assert.ok(Buffer.isBuffer(a.buffer));
  assert.ok(a.buffer.equals(b.buffer));
  assert.equal(a.path, undefined);
});

test('convert grava arquivo quando output é um caminho', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nexapdf-'));
  try {
    const file = join(dir, 'doc.pdf');
    const r = await new NexaPDF().convert({ html: '<p>arquivo</p>', output: file });
    const disk = await readFile(file);
    assert.ok(disk.equals(r.buffer));
    assert.equal(r.path, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('createStream produz o mesmo PDF', async () => {
  const pdf = new NexaPDF();
  const html = '<p>stream</p>';
  const chunks = [];
  for await (const c of pdf.createStream({ html, options: { format: 'A4' } })) chunks.push(c);
  const streamed = Buffer.concat(chunks);
  const direct = (await pdf.convert({ html, options: { format: 'A4' } })).buffer;
  assert.ok(streamed.equals(direct));
});

test('createStream propaga erros', async () => {
  const s = new NexaPDF().createStream({
    // @ts-expect-error — entrada inválida de propósito
    html: 42,
  });
  await assert.rejects(async () => {
    for await (const _ of s) void _;
  }, ConfigurationError);
});

test('opções padrão do construtor são mescladas', async () => {
  const pdf = new NexaPDF({ format: 'A5', margin: { top: 5 } });
  const { buffer } = await pdf.convert({ html: 'x', options: { margin: { left: 30 } } });
  assert.match(buffer.toString('latin1'), /\/MediaBox \[0 0 419.528 595.276\]/);
});

test('@page define tamanho e margens; opções explícitas têm precedência', async () => {
  const html = '<style>@page { size: A5 landscape; margin: 1in }</style><p>x</p>';
  const a = await new NexaPDF().convert({ html });
  assert.match(a.buffer.toString('latin1'), /\/MediaBox \[0 0 595.276 419.528\]/);
  const [[t]] = pageTexts(a.buffer);
  assert.equal(t.x, 72 + 6); // margem de 1in + margem padrão do body (8px = 6pt)
  const b = await new NexaPDF().convert({ html, options: { format: 'Letter' } });
  assert.match(b.buffer.toString('latin1'), /\/MediaBox \[0 0 792 612\]/);
});

test('todos os formatos de página suportados', async () => {
  for (const format of ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Ledger', 'Tabloid', 'Ofício']) {
    const r = await new NexaPDF().convert({ html: 'x', options: { format } });
    assert.equal(r.pageCount, 1, format);
  }
});

test('cabeçalho, rodapé e numeração de páginas', async () => {
  const html = '<p>a</p><p style="break-before: page">b</p>';
  const r = await new NexaPDF().convert({
    html,
    options: { header: 'Relatório', footer: { text: 'Página {{page}} de {{pages}}', align: 'right' } },
  });
  const texts = allText(r.buffer);
  assert.equal(r.pageCount, 2);
  assert.match(texts[0], /Relat\xf3rio/);
  assert.match(texts[1], /Relat\xf3rio/);
  assert.match(texts[0], /P\xe1gina 1 de 2/);
  assert.match(texts[1], /P\xe1gina 2 de 2/);
});

test('erros de configuração são tipados', async () => {
  const pdf = new NexaPDF();
  await assert.rejects(pdf.convert({ html: 'x', options: { format: 'B99' } }), (e) => e instanceof ConfigurationError && e.code === 'INVALID_CONFIGURATION');
  // @ts-expect-error — entrada inválida de propósito (validação em tempo de execução para quem usa JS)
  await assert.rejects(pdf.convert({ html: 'x', options: { orientation: 'diagonal' } }), ConfigurationError);
  await assert.rejects(pdf.convert({ html: 'x', options: { margin: { top: -1 } } }), ConfigurationError);
  await assert.rejects(pdf.convert({ html: 'x', options: { margin: 200 } }), ConfigurationError);
  // @ts-expect-error — entrada inválida de propósito (validação em tempo de execução para quem usa JS)
  await assert.rejects(pdf.convert({ html: null }), ConfigurationError);
  // @ts-expect-error — entrada inválida de propósito (validação em tempo de execução para quem usa JS)
  await assert.rejects(pdf.convert({ html: 'x', output: 123 }), ConfigurationError);
});

test('limites de segurança: tamanho do HTML e timeout', async () => {
  const pdf = new NexaPDF();
  await assert.rejects(pdf.convert({ html: 'x'.repeat(1000), options: { limits: { maxHtmlSize: 100 } } }), LimitExceededError);
  const big = '<p>' + 'palavra '.repeat(20000) + '</p>';
  await assert.rejects(pdf.convert({ html: big, options: { limits: { timeout: 1 } } }), (e) => e instanceof ConversionTimeoutError && e instanceof NexaPDFError);
});

test('scripts não são executados e recursos externos não são carregados', async () => {
  const r = await new NexaPDF().convert({
    html: '<link rel="stylesheet" href="http://169.254.169.254/x.css"><script>throw new Error("não!")</script><p>ok</p>',
  });
  assert.ok(r.warnings.some((w) => w.includes('link')));
  assert.ok(r.warnings.some((w) => w.includes('Scripts')));
  assert.deepEqual(allText(r.buffer), ['ok']);
});

test('opção css adiciona estilos do usuário', async () => {
  const r = await new NexaPDF().convert({ html: '<p class="x">a</p>', css: '.x { display: none }' });
  assert.deepEqual(allText(r.buffer), ['']);
});

test('métricas por etapa', async () => {
  const r = await new NexaPDF().convert({ html: '<p>x</p>' });
  for (const stage of ['html', 'css', 'style', 'layout', 'pagination', 'render', 'pdf', 'total'] as const) {
    assert.equal(typeof r.metrics.timings[stage], 'number', stage);
  }
  assert.equal(r.metrics.bytes, r.buffer.length);
});
