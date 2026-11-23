# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] — 2026-11-22

### Alterado
- Código-fonte convertido para **TypeScript** em modo `strict`, sem `any`
  implícito. O pacote publica JavaScript compilado (ES2022, ESM) e
  declarações `.d.ts` em `dist/`; os tipos públicos (`ConvertOptions`,
  `ConversionResult`, erros etc.) são exportados por `nexapdf`.
- O pacote pode ser carregado com `import` e com `require()` (Node.js 20.19+ / 22.12+).
- `dependencies` continua vazio; `typescript` e `@types/node` são apenas
  dependências de desenvolvimento.
- Testes, exemplo e benchmark também em TypeScript, verificados pelo `tsc`.

### Adicionado — Fase 1 (Fundação)
- Estrutura modular em ES Modules, sem dependências.
- Pipeline com medição de tempo por etapa e timeout.
- Erros tipados (`NexaPDFError` e subclasses) com `code`, `stage`, `details`.
- Configuração: formatos A0–A6, Letter, Legal, Ledger, Tabloid, Ofício,
  personalizado; orientação; margens com unidades; cabeçalho/rodapé com
  numeração; metadados; limites de segurança.
- Parser HTML próprio com recuperação de erros, entidades e limites.
- Engine CSS: tokenizer, parser, seletores, especificidade, cascata,
  herança, valores computados, `@media print`, `@page`.
- Layout de bloco (colapso de margens), inline (quebra de linhas com métricas
  AFM reais, alinhamentos, justificação) e tabelas (colspan, thead/tfoot).
- Paginação por fluxo: quebras forçadas, `break-inside`, órfãs/viúvas,
  títulos presos ao conteúdo seguinte, thead repetido.
- Gerador PDF 1.7 próprio: xref, Flate, ExtGState, saída determinística.
- 138 testes com `node:test`; exemplo e benchmark.
