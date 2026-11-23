/**
 * Parsers de valores CSS reutilizáveis pelas definições de propriedades.
 * Todos recebem tokens sem espaços nas extremidades e retornam o valor
 * especificado, ou `undefined` se a sintaxe for inválida.
 */

import type { CSSToken, LengthValue, PercentValue } from '../types.ts';

export const LENGTH_UNITS: ReadonlySet<string> = new Set([
  'px', 'pt', 'pc', 'in', 'cm', 'mm', 'q', 'em', 'rem', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax',
]);

export type Tokens = readonly CSSToken[];

export function nonWS(tokens: Tokens): CSSToken[] {
  return tokens.filter((t) => t.type !== 'whitespace');
}

function trim(g: CSSToken[]): CSSToken[] {
  let a = 0;
  let b = g.length;
  while (a < b && g[a]!.type === 'whitespace') a++;
  while (b > a && g[b - 1]!.type === 'whitespace') b--;
  return g.slice(a, b);
}

/** Separa tokens em grupos por espaço em branco, respeitando funções. */
export function splitBySpace(tokens: Tokens): CSSToken[][] {
  const groups: CSSToken[][] = [];
  let cur: CSSToken[] = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'function' || t.type === '(') depth++;
    if (t.type === ')') depth--;
    if (t.type === 'whitespace' && depth === 0) {
      if (cur.length) groups.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function splitByComma(tokens: Tokens): CSSToken[][] {
  const groups: CSSToken[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'function' || t.type === '(') depth++;
    if (t.type === ')') depth--;
    if (t.type === 'comma' && depth === 0) groups.push([]);
    else groups[groups.length - 1]!.push(t);
  }
  return groups.map(trim);
}

/** Palavra-chave isolada pertencente ao conjunto permitido. */
export function keyword<K extends string>(tokens: Tokens, allowed: ReadonlySet<K>): K | undefined {
  const ts = nonWS(tokens);
  const t = ts[0];
  if (ts.length !== 1 || !t || t.type !== 'ident') return undefined;
  const v = t.value.toLowerCase() as K;
  return allowed.has(v) ? v : undefined;
}

export interface LengthOptions {
  percent?: boolean;
  auto?: boolean;
  none?: boolean;
  negative?: boolean;
  keywords?: ReadonlySet<string>;
}

/** Comprimento: LengthValue | PercentValue | 'auto' | 'none' | palavra-chave permitida. */
export function length(tokens: Tokens, o: LengthOptions = {}): LengthValue | PercentValue | string | undefined {
  const ts = nonWS(tokens);
  const t = ts[0];
  if (ts.length !== 1 || !t) return undefined;
  const neg = o.negative !== false;
  if (t.type === 'ident') {
    const v = t.value.toLowerCase();
    if (o.auto && v === 'auto') return 'auto';
    if (o.none && v === 'none') return 'none';
    if (o.keywords && o.keywords.has(v)) return v;
    return undefined;
  }
  if (t.type === 'dimension' && LENGTH_UNITS.has(t.unit)) {
    if (!neg && t.value < 0) return undefined;
    return { type: 'length', value: t.value, unit: t.unit };
  }
  if (t.type === 'number' && t.value === 0) return { type: 'length', value: 0, unit: 'px' };
  if (t.type === 'percentage' && o.percent) {
    if (!neg && t.value < 0) return undefined;
    return { type: 'percent', value: t.value };
  }
  // calc() e demais funções: fase futura.
  return undefined;
}

export function integer(tokens: Tokens, min = -Infinity): number | undefined {
  const ts = nonWS(tokens);
  const t = ts[0];
  if (ts.length !== 1 || !t || t.type !== 'number' || !t.isInteger || t.value < min) return undefined;
  return t.value;
}

/** Expande 1–4 valores em [top, right, bottom, left]. */
export function fourSides<T>(values: readonly T[]): [T, T, T, T] | undefined {
  const [a, b, c, d] = values;
  switch (values.length) {
    case 1: return [a!, a!, a!, a!];
    case 2: return [a!, b!, a!, b!];
    case 3: return [a!, b!, c!, b!];
    case 4: return [a!, b!, c!, d!];
    default: return undefined;
  }
}
