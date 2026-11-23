/**
 * Parser de folhas de estilo.
 *
 * Consome os tokens de tokenizer.js e produz:
 *   {
 *     rules:     [{ selectors, declarations, order }],   // regras de estilo
 *     pageRules: [{ declarations, order }],              // regras @page
 *     warnings:  [string]
 *   }
 *
 * Cada declaração: { property, value: Token[], important }.
 * Shorthands são expandidos depois, por properties/index.js.
 *
 * Regras @media são aplicadas para o meio "print": blocos com "print" ou "all"
 * (ou sem tipo de mídia) são incluídos; "screen" e demais são descartados.
 */

import { tokenizeCSS } from './tokenizer.ts';
import { parseSelectorList } from './selector-engine.ts';
import type { ComplexSelector, CSSToken, CSSTokenType } from './types.ts';

/** Declaração antes da expansão de shorthands. */
export interface RawDeclaration {
  property: string;
  value: CSSToken[];
  important: boolean;
}

export interface StyleRule {
  selectors: ComplexSelector[];
  declarations: RawDeclaration[];
  order: number;
}

export interface PageRule {
  declarations: RawDeclaration[];
  order: number;
}

export interface Stylesheet {
  rules: StyleRule[];
  pageRules: PageRule[];
  warnings: string[];
  /** Próximo número de ordem disponível (para encadear folhas). */
  nextOrder: number;
}

const OPEN: Partial<Record<CSSTokenType, CSSTokenType>> = { function: ')', '(': ')', '[': ']', '{': '}' };

/** Lê tokens a partir de `start` até encontrar um token de `stopTypes` em profundidade 0. */
function readUntil(tokens: readonly CSSToken[], start: number, stopTypes: readonly CSSTokenType[]): number {
  const stack: CSSTokenType[] = [];
  let i = start;
  for (; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (stack.length === 0 && stopTypes.includes(t.type)) break;
    const close = OPEN[t.type];
    if (close) stack.push(close);
    else if (stack.length && t.type === stack[stack.length - 1]) stack.pop();
  }
  return i;
}

/** Retorna o índice do "}" que fecha o bloco iniciado em tokens[openIndex] === "{". */
function findBlockEnd(tokens: readonly CSSToken[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (OPEN[t.type]) depth++;
    else if (t.type === ')' || t.type === ']' || t.type === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return tokens.length;
}

function trimWS(tokens: readonly CSSToken[]): CSSToken[] {
  let a = 0;
  let b = tokens.length;
  while (a < b && tokens[a]!.type === 'whitespace') a++;
  while (b > a && tokens[b - 1]!.type === 'whitespace') b--;
  return tokens.slice(a, b);
}

/** Interpreta uma lista de declarações (conteúdo de um bloco ou atributo style). */
export function parseDeclarationTokens(tokens: readonly CSSToken[]): RawDeclaration[] {
  const out: RawDeclaration[] = [];
  let i = 0;
  while (i < tokens.length) {
    const end = readUntil(tokens, i, ['semicolon']);
    const decl = trimWS(tokens.slice(i, end));
    i = end + 1;
    const head = decl[0];
    if (decl.length < 2 || !head || head.type !== 'ident') continue;
    let j = 1;
    while (decl[j]?.type === 'whitespace') j++;
    if (decl[j]?.type !== 'colon') continue;
    let value = trimWS(decl.slice(j + 1));
    let important = false;
    // "! important" no final
    const nonWs = value.map((t, k) => ({ t, k })).filter(({ t }) => t.type !== 'whitespace');
    if (nonWs.length >= 2) {
      const last = nonWs[nonWs.length - 1]!.t;
      const bang = nonWs[nonWs.length - 2]!;
      if (last.type === 'ident' && last.value.toLowerCase() === 'important' && bang.t.type === 'delim' && bang.t.value === '!') {
        important = true;
        value = trimWS(value.slice(0, bang.k));
      }
    }
    if (value.length === 0) continue;
    const name = head.value;
    out.push({ property: name.startsWith('--') ? name : name.toLowerCase(), value, important });
  }
  return out;
}

export function parseDeclarations(text: string): RawDeclaration[] {
  return parseDeclarationTokens(tokenizeCSS(text));
}

/** Avalia uma lista de media queries para o meio "print" (simplificado). */
export function mediaMatchesPrint(preludeTokens: readonly CSSToken[]): boolean {
  const parts: CSSToken[][] = [];
  let cur: CSSToken[] = [];
  for (const t of preludeTokens) {
    if (t.type === 'comma') {
      parts.push(cur);
      cur = [];
    } else if (t.type !== 'whitespace') cur.push(t);
  }
  parts.push(cur);
  return parts.some((q) => {
    if (q.length === 0) return true;
    const idents = q.flatMap((t) => (t.type === 'ident' ? [t.value.toLowerCase()] : []));
    const negated = idents[0] === 'not';
    const types = idents.filter((v) => !['not', 'only', 'and'].includes(v));
    // Sem tipo de mídia explícito (apenas features): consideramos compatível.
    const type = types.length ? types[0] : 'all';
    const matches = type === 'print' || type === 'all';
    return negated ? !matches : matches;
  });
}

export function parseStylesheet(text: string, { startOrder = 0 }: { startOrder?: number } = {}): Stylesheet {
  const tokens = tokenizeCSS(text);
  const result: Stylesheet = { rules: [], pageRules: [], warnings: [], nextOrder: startOrder };
  let order = startOrder;

  function parseBlockList(list: readonly CSSToken[]): void {
    let i = 0;
    while (i < list.length) {
      const t = list[i]!;
      if (t.type === 'whitespace' || t.type === 'cdo' || t.type === 'cdc' || t.type === 'semicolon') {
        i++;
        continue;
      }
      if (t.type === '}') {
        i++;
        continue;
      }

      if (t.type === 'at-keyword') {
        const name = t.value.toLowerCase();
        const end = readUntil(list, i + 1, ['{', 'semicolon']);
        const prelude = trimWS(list.slice(i + 1, end));
        if (list[end]?.type !== '{') {
          if (name !== 'charset') result.warnings.push(`@${name} ignorado (não suportado).`);
          i = end + 1;
          continue;
        }
        const close = findBlockEnd(list, end);
        const body = list.slice(end + 1, close);
        if (name === 'media') {
          if (mediaMatchesPrint(prelude)) parseBlockList(body);
        } else if (name === 'page') {
          // Seletores de página (:first, :left, :right) ainda não são suportados.
          if (prelude.length === 0) result.pageRules.push({ declarations: parseDeclarationTokens(body), order: order++ });
          else result.warnings.push('Seletores em @page ainda não são suportados; regra ignorada.');
        } else if (name === 'supports') {
          result.warnings.push('@supports ignorado (não suportado).');
        } else {
          result.warnings.push(`@${name} ignorado (não suportado).`);
        }
        i = close + 1;
        continue;
      }

      // Regra qualificada
      const open = readUntil(list, i, ['{']);
      if (open >= list.length) break;
      const prelude = trimWS(list.slice(i, open));
      const close = findBlockEnd(list, open);
      const body = list.slice(open + 1, close);
      i = close + 1;
      const selectors = parseSelectorList(prelude);
      if (!selectors) {
        result.warnings.push('Seletor não suportado ou inválido; regra ignorada.');
        continue;
      }
      result.rules.push({ selectors, declarations: parseDeclarationTokens(body), order: order++ });
    }
  }

  parseBlockList(tokens);
  result.nextOrder = order;
  return result;
}
