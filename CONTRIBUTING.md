# Contribuindo com a NexaPDF

## Regras do projeto

1. **Zero dependências de execução.** `dependencies` permanece vazio: o pacote
   publicado usa apenas APIs nativas do Node.js. Em `devDependencies` ficam
   somente `typescript` e `@types/node`, necessários para compilar.
2. **TypeScript estrito.** Todo o código fica em `src/**/*.ts` com
   `strict: true`. Evite `any`; use `unknown` com verificação de tipo. Use
   apenas sintaxe "apagável" (`erasableSyntaxOnly`): sem `enum`, `namespace`
   ou propriedades de parâmetro no construtor, para que o Node consiga executar
   os arquivos `.ts` diretamente.
3. **Implementação própria.** Algoritmos conhecidos são bem-vindos, mas a
   implementação deve ser original. Indique no cabeçalho do módulo a
   especificação ou referência que o fundamenta (ex.: "CSS 2.1 §10.3.3").
4. **Uma responsabilidade por módulo.** Evite arquivos que concentrem várias
   etapas e dependências circulares entre módulos.
5. **Nada é "suportado" sem funcionar.** Uma propriedade CSS só entra no
   registro (`src/css/properties/index.ts`) quando o layout ou a renderização
   a consome de fato, com testes. Atualize `docs/compatibilidade.md`.
6. **Testes permanecem.** Toda correção ganha um teste de regressão. Não
   remova nem enfraqueça testes para fazer uma implementação passar.
7. **Determinismo.** A mesma entrada deve produzir os mesmos bytes.

## Fluxo

Requisitos para desenvolver: **Node.js 22.18+** (executa `.ts` nativamente).
O pacote publicado funciona a partir do Node.js 20.

```bash
npm install                 # instala typescript e @types/node
npm run typecheck           # tsc --strict em src, testes, exemplo e benchmark
npm test                    # node:test executando os .ts diretamente
npm run check               # os dois acima
npm run build               # compila para dist/ (JS + .d.ts)
node examples/basic.ts      # conferência visual
```

Imports relativos usam a extensão `.ts` (`import { x } from './y.ts'`); o
compilador as reescreve para `.js` em `dist/`.

Para conferir visualmente um PDF, qualquer leitor serve; `qpdf --check`
valida a estrutura.

## Estilo

- ES Modules, `const`/`let`, funções pequenas, tipos explícitos em funções exportadas.
- Comentários e mensagens de erro em português; identificadores em inglês.
- Medidas internas sempre em pontos PDF.
