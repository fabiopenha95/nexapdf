/**
 * Parser e motor de correspondência de seletores CSS.
 *
 * Suportado:
 *   tipo (div), universal (*), classe (.a), ID (#a),
 *   atributos [a] [a=v] [a~=v] [a|=v] [a^=v] [a$=v] [a*=v] (com flag "i"),
 *   combinadores descendente (espaço), filho (>), irmão adjacente (+), irmão geral (~),
 *   pseudo-classes estruturais :first-child :last-child :only-child :root :empty
 *   :nth-child(an+b | odd | even) :nth-last-child(...) :first-of-type :last-of-type :not(lista simples)
 *
 * Pseudo-elementos (::before etc.) e pseudo-classes dinâmicas (:hover) tornam o
 * seletor inválido; segundo a especificação, a regra inteira é descartada.
 */

import { computeSpecificity } from './specificity.ts';
import { NodeType } from '../html/dom-node.ts';
import type { ElementNode, ParentNode } from '../html/dom-node.ts';
import type { Combinator, ComplexSelector, CompoundSelector, CSSToken, NthExpression, SimpleSelector } from './types.ts';

/* ------------------------------------------------------------------ parse */

function parseNth(tokens: CSSToken[]): NthExpression | null {
  const text = tokens
    .filter((t) => t.type !== 'whitespace')
    .map((t) => {
      if (t.type === 'ident') return t.value;
      if (t.type === 'number') return (t.value >= 0 && tokens.length > 1 ? '+' : '') + t.value;
      if (t.type === 'dimension') return t.value + t.unit;
      if (t.type === 'delim') return t.value;
      return '';
    })
    .join('')
    .toLowerCase()
    .replace(/^\+/, '');
  if (text === 'odd') return { a: 2, b: 1 };
  if (text === 'even') return { a: 2, b: 0 };
  const m = /^([+-]?\d*)?n([+-]\d+)?$/.exec(text);
  if (m) {
    const aStr = m[1] ?? '';
    const a = aStr === '' || aStr === '+' ? 1 : aStr === '-' ? -1 : parseInt(aStr, 10);
    return { a, b: m[2] ? parseInt(m[2], 10) : 0 };
  }
  if (/^[+-]?\d+$/.test(text)) return { a: 0, b: parseInt(text, 10) };
  return null;
}

const SIMPLE_PSEUDOS = new Set(['first-child', 'last-child', 'only-child', 'root', 'empty', 'first-of-type', 'last-of-type', 'link', 'any-link']);

function parseCompound(tokens: CSSToken[], pos: number): { compound: CompoundSelector; next: number } | null {
  const simples: SimpleSelector[] = [];
  let i = pos;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'ident') {
      if (simples.length) return null; // tipo só pode aparecer no início
      simples.push({ type: 'type', name: t.value.toLowerCase() });
      i++;
    } else if (t.type === 'delim' && t.value === '*') {
      if (simples.length) return null;
      simples.push({ type: 'universal' });
      i++;
    } else if (t.type === 'hash') {
      if (!t.isId) return null;
      simples.push({ type: 'id', name: t.value });
      i++;
    } else if (t.type === 'delim' && t.value === '.') {
      const nx = tokens[i + 1];
      if (!nx || nx.type !== 'ident') return null;
      simples.push({ type: 'class', name: nx.value });
      i += 2;
    } else if (t.type === '[') {
      let j = i + 1;
      const inner: CSSToken[] = [];
      while (j < tokens.length && tokens[j].type !== ']') {
        if (tokens[j].type !== 'whitespace') inner.push(tokens[j]);
        j++;
      }
      const first = inner[0];
      if (j >= tokens.length || !first || first.type !== 'ident') return null;
      const attr: Extract<SimpleSelector, { type: 'attribute' }> = { type: 'attribute', name: first.value.toLowerCase(), op: null, value: null, caseInsensitive: false };
      let k = 1;
      const isDelim = (t: CSSToken | undefined, chars: string): t is CSSToken & { type: 'delim'; value: string } =>
        !!t && t.type === 'delim' && chars.includes(t.value);
      const identValue = (t: CSSToken | undefined): string | null => (t && t.type === 'ident' ? t.value.toLowerCase() : null);
      if (k < inner.length) {
        let op = '';
        const opTok = inner[k];
        if (isDelim(opTok, '~|^$*')) {
          op = opTok.value;
          k++;
        }
        const eq = inner[k];
        if (!(isDelim(eq, '=') && eq.value === '=')) return null;
        op += '=';
        k++;
        const v = inner[k];
        if (!v || (v.type !== 'ident' && v.type !== 'string' && v.type !== 'number')) return null;
        attr.op = op;
        attr.value = String(v.value);
        k++;
        if (inner[k]) {
          const flag = identValue(inner[k]);
          if (flag === 'i') attr.caseInsensitive = true;
          else if (flag !== 's') return null;
          k++;
        }
        if (k !== inner.length) return null;
      }
      simples.push(attr);
      i = j + 1;
    } else if (t.type === 'colon') {
      const nx = tokens[i + 1];
      if (!nx) return null;
      if (nx.type === 'colon') return null; // pseudo-elemento: não suportado
      if (nx.type === 'ident') {
        const name = nx.value.toLowerCase();
        if (!SIMPLE_PSEUDOS.has(name)) return null;
        simples.push({ type: 'pseudo-class', name });
        i += 2;
      } else if (nx.type === 'function') {
        const name = nx.value.toLowerCase();
        let j = i + 2;
        let depth = 1;
        const arg: CSSToken[] = [];
        while (j < tokens.length) {
          const tj = tokens[j];
          if (tj.type === 'function' || tj.type === '(') depth++;
          if (tj.type === ')') {
            depth--;
            if (depth === 0) break;
          }
          arg.push(tj);
          j++;
        }
        if (j >= tokens.length) return null;
        if (name === 'nth-child' || name === 'nth-last-child' || name === 'nth-of-type' || name === 'nth-last-of-type') {
          const nth = parseNth(arg);
          if (!nth) return null;
          simples.push({ type: 'pseudo-class', name, nth });
        } else if (name === 'not') {
          const list = parseSelectorList(arg);
          if (!list || list.some((s) => s.compounds.length !== 1)) return null;
          simples.push({ type: 'pseudo-class', name, argument: list });
        } else {
          return null;
        }
        i = j + 1;
      } else return null;
    } else {
      break;
    }
  }
  if (simples.length === 0) return null;
  return { compound: { simples, combinator: null }, next: i };
}

function parseComplex(tokens: CSSToken[]): ComplexSelector | null {
  const compounds: CompoundSelector[] = [];
  let i = 0;
  let pendingCombinator: Combinator | null = null;
  while (i < tokens.length) {
    let sawWS = false;
    while (i < tokens.length && tokens[i].type === 'whitespace') {
      sawWS = true;
      i++;
    }
    if (i >= tokens.length) break;
    const t = tokens[i];
    if (t.type === 'delim' && (t.value === '>' || t.value === '+' || t.value === '~')) {
      if (compounds.length === 0 || pendingCombinator) return null;
      pendingCombinator = t.value;
      i++;
      continue;
    }
    if (compounds.length > 0 && !pendingCombinator) {
      if (!sawWS) return null;
      pendingCombinator = ' ';
    }
    const r = parseCompound(tokens, i);
    if (!r) return null;
    r.compound.combinator = compounds.length ? pendingCombinator : null;
    compounds.push(r.compound);
    pendingCombinator = null;
    i = r.next;
  }
  if (compounds.length === 0 || pendingCombinator) return null;
  return { compounds, specificity: computeSpecificity({ compounds }) };
}

/** Interpreta uma lista de seletores. Retorna null se qualquer seletor for inválido. */
export function parseSelectorList(tokens: readonly CSSToken[]): ComplexSelector[] | null {
  const groups: CSSToken[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'function' || t.type === '(') depth++;
    if (t.type === ')') depth--;
    if (t.type === 'comma' && depth === 0) groups.push([]);
    else groups[groups.length - 1]!.push(t);
  }
  const out: ComplexSelector[] = [];
  for (const g of groups) {
    const sel = parseComplex(g);
    if (!sel) return null;
    out.push(sel);
  }
  return out;
}

/* --------------------------------------------------------------- matching */

function parentElement(el: ElementNode): ElementNode | null {
  const p = el.parent;
  return p && p.type === NodeType.ELEMENT ? p : null;
}

function prevElementSibling(el: ElementNode): ElementNode | null {
  const sibs = el.parent ? el.parent.children : [];
  for (let i = sibs.indexOf(el) - 1; i >= 0; i--) {
    const s = sibs[i]!;
    if (s.type === NodeType.ELEMENT) return s;
  }
  return null;
}

function elementIndex(el: ElementNode, fromEnd: boolean, sameType: boolean): number {
  const sibs = el.parent
    ? el.parent.children.filter((c): c is ElementNode => c.type === NodeType.ELEMENT && (!sameType || c.tagName === el.tagName))
    : [el];
  const idx = sibs.indexOf(el);
  return fromEnd ? sibs.length - idx : idx + 1;
}

function matchesNth({ a, b }: NthExpression, index: number): boolean {
  if (a === 0) return index === b;
  const n = (index - b) / a;
  return Number.isInteger(n) && n >= 0;
}

function matchAttribute(el: ElementNode, s: Extract<SimpleSelector, { type: 'attribute' }>): boolean {
  if (!el.hasAttribute(s.name)) return false;
  if (!s.op) return true;
  let actual = el.getAttribute(s.name) ?? '';
  let expected = s.value ?? '';
  if (s.caseInsensitive) {
    actual = actual.toLowerCase();
    expected = expected.toLowerCase();
  }
  switch (s.op) {
    case '=': return actual === expected;
    case '~=': return expected !== '' && actual.split(/\s+/).includes(expected);
    case '|=': return actual === expected || actual.startsWith(expected + '-');
    case '^=': return expected !== '' && actual.startsWith(expected);
    case '$=': return expected !== '' && actual.endsWith(expected);
    case '*=': return expected !== '' && actual.includes(expected);
    default: return false;
  }
}

function matchSimple(el: ElementNode, s: SimpleSelector): boolean {
  switch (s.type) {
    case 'universal': return true;
    case 'type': return el.tagName === s.name;
    case 'id': return el.id === s.name;
    case 'class': return el.classList.includes(s.name);
    case 'attribute': return matchAttribute(el, s);
    case 'pseudo-class':
      switch (s.name) {
        case 'root': return !parentElement(el);
        case 'first-child': return elementIndex(el, false, false) === 1;
        case 'last-child': return elementIndex(el, true, false) === 1;
        case 'only-child': return elementIndex(el, false, false) === 1 && elementIndex(el, true, false) === 1;
        case 'first-of-type': return elementIndex(el, false, true) === 1;
        case 'last-of-type': return elementIndex(el, true, true) === 1;
        case 'empty': return el.children.every((c) => c.type === NodeType.COMMENT);
        case 'link':
        case 'any-link': return (el.tagName === 'a' || el.tagName === 'area') && el.hasAttribute('href');
        case 'nth-child': return !!s.nth && matchesNth(s.nth, elementIndex(el, false, false));
        case 'nth-last-child': return !!s.nth && matchesNth(s.nth, elementIndex(el, true, false));
        case 'nth-of-type': return !!s.nth && matchesNth(s.nth, elementIndex(el, false, true));
        case 'nth-last-of-type': return !!s.nth && matchesNth(s.nth, elementIndex(el, true, true));
        case 'not': return !(s.argument ?? []).some((sel) => matchCompound(el, sel.compounds[0]!));
        default: return false;
      }
    default:
      return false;
  }
}

function matchCompound(el: ElementNode, compound: CompoundSelector): boolean {
  for (const s of compound.simples) if (!matchSimple(el, s)) return false;
  return true;
}

function matchFrom(el: ElementNode, compounds: readonly CompoundSelector[], index: number): boolean {
  const compound = compounds[index]!;
  if (!matchCompound(el, compound)) return false;
  if (index === 0) return true;
  const comb = compound.combinator;
  switch (comb) {
    case '>': {
      const p = parentElement(el);
      return !!p && matchFrom(p, compounds, index - 1);
    }
    case ' ': {
      for (let p = parentElement(el); p; p = parentElement(p)) {
        if (matchFrom(p, compounds, index - 1)) return true;
      }
      return false;
    }
    case '+': {
      const s = prevElementSibling(el);
      return !!s && matchFrom(s, compounds, index - 1);
    }
    case '~': {
      for (let s = prevElementSibling(el); s; s = prevElementSibling(s)) {
        if (matchFrom(s, compounds, index - 1)) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** Verifica se o elemento corresponde ao seletor complexo. */
export function matches(el: ElementNode, selector: ComplexSelector): boolean {
  return matchFrom(el, selector.compounds, selector.compounds.length - 1);
}

/** Atalho: interpreta e testa um seletor em texto (útil em testes). */
export function querySelectorAll(root: ParentNode, selectorText: string, tokenize: (css: string) => CSSToken[]): ElementNode[] {
  const list = parseSelectorList(tokenize(selectorText));
  if (!list) return [];
  const out: ElementNode[] = [];
  const walk = (node: ParentNode): void => {
    for (const c of node.children) {
      if (c.type !== NodeType.ELEMENT) continue;
      if (list.some((s) => matches(c, s))) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}
