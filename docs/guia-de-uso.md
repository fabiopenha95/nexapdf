# Guia de uso da NexaPDF

Passo a passo para gerar PDFs a partir de HTML em uma aplicação Node.js.

## 1. Onde a NexaPDF roda

A NexaPDF roda **no back-end** (Node.js 20+), em Linux, macOS e Windows, sem
Chrome, sem binários e sem variáveis de ambiente.

Ela **não roda no navegador** nesta versão (usa `Buffer`, `zlib` e `fs` do
Node). O fluxo típico é:

```
Front-end ──(dados ou HTML)──▶ API Node.js ──NexaPDF──▶ PDF (Buffer) ──▶ download
```

## 2. Instalação

```bash
npm install nexapdf
```

A biblioteca é escrita em TypeScript e já traz os tipos. Os exemplos abaixo
funcionam em TypeScript e em JavaScript (basta remover as anotações de tipo).

## 3. Primeiro PDF

```ts
import { NexaPDF } from 'nexapdf';

const pdf = new NexaPDF();
const { buffer, pageCount } = await pdf.convert({
  html: '<h1>Olá</h1><p>Meu primeiro PDF.</p>',
});
// buffer é o arquivo PDF completo, em memória
```

Você passa **HTML (string)** e recebe **o PDF (Buffer)**. O que fazer com o
Buffer depende do caso:

| Quero… | Como |
|---|---|
| Salvar em disco | `convert({ html, output: './relatorio.pdf' })` |
| Enviar como download numa API | Devolver o `buffer` com os cabeçalhos HTTP (seção 4) |
| Enviar por e-mail, S3, banco… | Usar o `buffer` diretamente |
| Transmitir sem guardar tudo | `pdf.createStream({ html }).pipe(res)` |

## 4. Download pelo navegador

### Express

```js
import express from 'express';
import { NexaPDF } from 'nexapdf';

const app = express();
const pdf = new NexaPDF({ format: 'A4' });

app.get('/relatorios/vendas', async (req, res) => {
  const html = montarRelatorioDeVendas(await buscarVendas()); // sua função
  const { buffer } = await pdf.convert({ html });

  res.setHeader('Content-Type', 'application/pdf');
  // "attachment" força o download; "inline" abre no visualizador do navegador
  res.setHeader('Content-Disposition', 'attachment; filename="vendas.pdf"');
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});
```

### Fastify

```js
fastify.get('/relatorio', async (req, reply) => {
  const { buffer } = await pdf.convert({ html });
  reply.header('Content-Type', 'application/pdf')
       .header('Content-Disposition', 'attachment; filename="relatorio.pdf"')
       .send(buffer);
});
```

### No front-end

Com um link simples:

```html
<a href="/relatorios/vendas">Baixar PDF</a>
```

Ou via `fetch` (quando precisa enviar filtros ou token):

```js
const resp = await fetch('/relatorios/vendas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ mes: '2026-11' }),
});
const blob = await resp.blob();
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement('a'), { href: url, download: 'vendas.pdf' });
a.click();
URL.revokeObjectURL(url);
```

> **Segurança:** prefira que o front-end envie **dados** e o back-end monte o
> HTML a partir de um template seu. Se precisar aceitar HTML do usuário, a
> NexaPDF não executa scripts nem acessa rede ou disco, mas mantenha os
> limites (`options.limits`) configurados.

## 5. Tamanho da página e margens

Há duas formas. Use a que preferir.

**Pelas opções (no código):**

```js
await pdf.convert({
  html,
  options: {
    format: 'A4',              // A0–A6, Letter, Legal, Ledger, Tabloid, Ofício
    orientation: 'landscape',  // ou 'portrait'
    margin: { top: 20, right: 15, bottom: 20, left: 15 }, // números = mm
  },
});
```

Tamanho personalizado: `{ width: '80mm', height: '200mm' }` (útil para
cupons/etiquetas). Unidades aceitas: `mm`, `cm`, `in`, `pt`, `px`.

**Pelo CSS (no próprio HTML):**

```css
@page { size: A4 landscape; margin: 2cm; }
```

Se usar os dois, **as opções do código prevalecem** sobre o `@page`.

> O `body` tem margem padrão de 8px, como nos navegadores. Para usar só as
> margens da página, inclua `body { margin: 0 }`.

## 6. Quebras de página

### Automáticas: você não precisa fazer nada

A NexaPDF calcula o espaço de cada página e, quando o conteúdo não cabe, passa
para a próxima. Ela já cuida sozinha de:

- nunca cortar uma linha de texto ao meio;
- não separar um título do parágrafo que vem depois;
- não deixar uma linha isolada de parágrafo no topo ou no fim da página
  (órfãs/viúvas, mínimo de 2 linhas);
- não dividir uma linha de tabela;
- repetir o `<thead>` da tabela no topo de cada página.

### Manuais: quando você quer controlar

Use CSS. Exemplos práticos para relatórios:

```css
/* Cada seção do relatório começa em uma página nova */
.secao { break-before: page; }

/* Termina a capa e força o resto para a próxima página */
.capa { break-after: page; }

/* Um card, bloco de assinatura ou resumo nunca é dividido */
.card, .assinatura, .resumo { break-inside: avoid; }
```

Ou diretamente no HTML:

```html
<div style="break-before: page"></div>
```

As formas antigas também funcionam: `page-break-before: always`,
`page-break-after: always`, `page-break-inside: avoid`.

> `break-inside: avoid` em um bloco **maior que uma página** é ignorado (não
> há como cumprir), e o bloco é dividido normalmente.

## 7. Cabeçalho, rodapé e numeração

```js
await pdf.convert({
  html,
  options: {
    header: { text: 'Empresa X — Relatório de Vendas', align: 'left', fontSize: 8 },
    footer: { text: 'Página {{page}} de {{pages}}', align: 'right', fontSize: 8 },
  },
});
```

São desenhados dentro das margens superior e inferior: deixe margens de
pelo menos ~12 mm para que caibam. Nesta versão são texto simples (sem HTML).

## 8. Montando o HTML do relatório

Um modelo completo para começar:

```ts
interface Linha {
  cliente: string;
  produto: string;
  valor: number;
}

function montarRelatorio({ titulo, periodo, linhas, total }: { titulo: string; periodo: string; linhas: Linha[]; total: number }): string {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s: unknown) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <title>${esc(titulo)}</title>
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { margin: 0; font-family: Helvetica, sans-serif; font-size: 10pt; color: #222; }
    h1 { font-size: 18pt; margin: 0 0 4pt; }
    .periodo { color: #666; margin: 0 0 12pt; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1f3b73; color: #fff; text-align: left; padding: 5pt; }
    td { padding: 4pt 5pt; border-bottom: 0.5pt solid #ddd; }
    tr:nth-child(even) td { background: #f7f8fb; }
    .num { text-align: right; }
    .total { break-inside: avoid; margin-top: 12pt; text-align: right; font-size: 12pt; font-weight: bold; }
  </style>
</head>
<body>
  <h1>${esc(titulo)}</h1>
  <p class="periodo">${esc(periodo)}</p>
  <table>
    <thead><tr><th>Cliente</th><th>Produto</th><th class="num">Valor</th></tr></thead>
    <tbody>
      ${linhas.map((l) => `<tr><td>${esc(l.cliente)}</td><td>${esc(l.produto)}</td><td class="num">${fmt(l.valor)}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="total">Total: ${fmt(total)}</p>
</body>
</html>`;
}
```

**Sempre escape os dados** (`esc` acima) antes de colocá-los no HTML: um nome
de cliente com `<` quebraria o layout.

## 9. O que observar (checklist)

O que funciona bem hoje:

- Texto, títulos, parágrafos, listas, tabelas, bordas, cores, fundos, margens.
- Fontes **Helvetica** (qualquer família sem serifa) e **Courier** (monoespaçada).
- Acentuação do português e símbolos comuns (€, “aspas”, —, •, ©).
- Unidades `pt`, `mm`, `cm`, `px`, `em`, `rem`, `%`.

Ainda **não** funciona (planejado). Evite nos templates por enquanto:

| Recurso | Alternativa até lá |
|---|---|
| `<img>` (logos, gráficos) | Texto ou blocos coloridos; virá na Fase 2 |
| `display: flex` / `grid` | Tabelas sem borda para colunas lado a lado |
| `position`, `float` | Tabelas ou blocos com `margin: auto` |
| `border-radius`, `box-shadow`, gradientes | Bordas retas e cores sólidas |
| Fontes próprias (Roboto, Inter…) e `@font-face` | Helvetica; TTF virá na Fase 3 |
| `<link rel="stylesheet">` externo | Coloque o CSS em `<style>` ou na opção `css` |
| `calc()`, variáveis CSS | Valores fixos |
| Caracteres fora do Latin-1 (chinês, emoji…) | Aparecem como `?` até a Fase 3 |

Sempre confira `result.warnings`: a biblioteca avisa quando ignora algo
(por exemplo, `<img>` ou `display: flex`).

```js
const r = await pdf.convert({ html });
if (r.warnings.length) console.warn('NexaPDF:', r.warnings);
```

A lista completa está em [compatibilidade.md](compatibilidade.md).

## 10. Desempenho e produção

- Reutilize uma instância de `NexaPDF`; ela não guarda estado entre conversões.
- A conversão é síncrona por dentro (CPU). Para muitos relatórios grandes
  simultâneos, rode-os em `worker_threads` ou numa fila para não bloquear o
  servidor.
- Ajuste os limites conforme seu caso:

```js
new NexaPDF({ limits: { timeout: 10_000, maxPages: 500 } });
```

## 11. Tratamento de erros

```ts
import { NexaPDF, ConfigurationError, LimitExceededError, ConversionTimeoutError } from 'nexapdf';

try {
  await pdf.convert({ html, options });
} catch (err) {
  if (err instanceof ConfigurationError) { /* opção inválida: err.details */ }
  else if (err instanceof LimitExceededError) { /* err.details.limit, actual, max */ }
  else if (err instanceof ConversionTimeoutError) { /* documento grande demais para o timeout */ }
  else throw err;
}
```
