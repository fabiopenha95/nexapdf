/**
 * Registro de propriedades CSS suportadas.
 *
 * Cada propriedade longhand possui:
 *   inherited: boolean
 *   initial:   valor inicial (já no formato especificado)
 *   parse(tokens) → valor especificado | undefined (inválido)
 *
 * Shorthands possuem expand(tokens) → [[longhand, valor], ...] | undefined.
 *
 * Somente propriedades efetivamente consumidas pelo layout/renderização são
 * registradas aqui. Propriedades desconhecidas são ignoradas silenciosamente,
 * como fazem os navegadores.
 */

import { parseColorTokens, BLACK, TRANSPARENT } from '../../graphics/colors.ts';
import { keyword, length, integer, nonWS, splitBySpace, splitByComma, fourSides } from './values.ts';
import type { Tokens } from './values.ts';
import type { CSSToken, DecorationLine, GlobalValue, LengthValue, NumberValue, PercentValue, SpecifiedValue } from '../types.ts';
import type { Color } from '../../graphics/colors.ts';

export type ValueParser = (tokens: Tokens) => SpecifiedValue | undefined;

export interface PropertyDefinition {
  inherited: boolean;
  initial: SpecifiedValue;
  parse: ValueParser;
}

/** Par longhand → valor especificado. */
export type Declaration = [property: string, value: SpecifiedValue];
export type ShorthandExpander = (tokens: Tokens) => Declaration[] | undefined;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const BORDER_STYLES = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
const BORDER_WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick']);
const DISPLAY = new Set([
  'block', 'inline', 'inline-block', 'list-item', 'none', 'table', 'inline-table', 'table-row', 'table-cell',
  'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group',
  'table-caption', 'flex', 'inline-flex', 'contents', 'flow-root',
]);
const FONT_SIZE_KEYWORDS = new Set(['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger']);
const LIST_STYLE_TYPES = new Set([
  'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha',
  'lower-latin', 'upper-latin', 'lower-roman', 'upper-roman', 'none',
]);
const BREAK_BETWEEN = new Set(['auto', 'avoid', 'page', 'always', 'left', 'right', 'recto', 'verso', 'avoid-page', 'column', 'avoid-column']);
const BREAK_INSIDE = new Set(['auto', 'avoid', 'avoid-page', 'avoid-column']);

const color = (ts: Tokens): Color | 'currentcolor' | undefined => {
  const c = parseColorTokens(ts);
  return c === null ? undefined : c;
};

const borderWidth = (ts: Tokens): LengthValue | PercentValue | string | undefined => length(ts, { negative: false, keywords: BORDER_WIDTH_KEYWORDS });

function fontFamily(ts: Tokens): string[] | undefined {
  const families: string[] = [];
  for (const group of splitByComma(ts)) {
    if (group.length === 0) return undefined;
    if (group.length === 1 && group[0].type === 'string') {
      families.push(group[0].value);
      continue;
    }
    const words: string[] = [];
    for (const t of group) {
      if (t.type === 'ident') words.push(t.value);
      else if (t.type !== 'whitespace') return undefined;
    }
    families.push(words.join(' '));
  }
  return families.length ? families : undefined;
}

function fontWeight(ts: Tokens): number | 'bolder' | 'lighter' | undefined {
  const k = keyword(ts, new Set(['normal', 'bold', 'bolder', 'lighter'] as const));
  if (k) return k === 'normal' ? 400 : k === 'bold' ? 700 : k;
  const t = nonWS(ts);
  if (t.length === 1 && t[0].type === 'number' && t[0].value >= 1 && t[0].value <= 1000) return t[0].value;
  return undefined;
}

function lineHeight(ts: Tokens): NumberValue | LengthValue | PercentValue | string | undefined {
  const t = nonWS(ts);
  if (t.length === 1 && t[0].type === 'number' && t[0].value >= 0) return { type: 'number', value: t[0].value };
  return length(ts, { percent: true, negative: false, keywords: new Set(['normal']) });
}

function spacing(ts: Tokens): LengthValue | PercentValue | string | undefined {
  return length(ts, { keywords: new Set(['normal']) });
}

function textDecorationLine(ts: Tokens): DecorationLine[] | undefined {
  const t = nonWS(ts);
  if (t.length === 1 && t[0].type === 'ident' && t[0].value.toLowerCase() === 'none') return [];
  const out: DecorationLine[] = [];
  for (const tok of t) {
    if (tok.type !== 'ident') return undefined;
    const v = tok.value.toLowerCase() as DecorationLine;
    if (!['underline', 'overline', 'line-through'].includes(v) || out.includes(v)) return undefined;
    out.push(v);
  }
  return out.length ? out : undefined;
}

function borderSpacing(ts: Tokens): [LengthValue, LengthValue] | undefined {
  const parts = splitBySpace(ts).map((g) => length(g, { negative: false }));
  const lengths = parts.filter((p): p is LengthValue => typeof p === 'object' && p.type === 'length');
  if (lengths.length !== parts.length || lengths.length < 1 || lengths.length > 2) return undefined;
  return [lengths[0]!, lengths[1] ?? lengths[0]!];
}

/* -------------------------------------------------------------- longhands */

export const PROPERTIES: Record<string, PropertyDefinition> = {
  display: { inherited: false, initial: 'inline', parse: (ts) => keyword(ts, DISPLAY) },
  color: { inherited: true, initial: BLACK, parse: color },
  'background-color': { inherited: false, initial: TRANSPARENT, parse: color },

  'font-family': { inherited: true, initial: ['Helvetica'], parse: fontFamily },
  'font-size': { inherited: true, initial: { type: 'length', value: 16, unit: 'px' }, parse: (ts) => length(ts, { percent: true, negative: false, keywords: FONT_SIZE_KEYWORDS }) },
  'font-weight': { inherited: true, initial: 400, parse: fontWeight },
  'font-style': { inherited: true, initial: 'normal', parse: (ts) => keyword(ts, new Set(['normal', 'italic', 'oblique'])) },
  'line-height': { inherited: true, initial: 'normal', parse: lineHeight },
  'letter-spacing': { inherited: true, initial: 'normal', parse: spacing },
  'word-spacing': { inherited: true, initial: 'normal', parse: spacing },
  'text-align': { inherited: true, initial: 'start', parse: (ts) => keyword(ts, new Set(['left', 'right', 'center', 'justify', 'start', 'end'])) },
  'text-indent': { inherited: true, initial: { type: 'length', value: 0, unit: 'px' }, parse: (ts) => length(ts, { percent: true }) },
  'text-transform': { inherited: true, initial: 'none', parse: (ts) => keyword(ts, new Set(['none', 'uppercase', 'lowercase', 'capitalize'])) },
  'text-decoration-line': { inherited: false, initial: [], parse: textDecorationLine },
  'white-space': { inherited: true, initial: 'normal', parse: (ts) => keyword(ts, new Set(['normal', 'pre', 'nowrap', 'pre-wrap', 'pre-line', 'break-spaces'])) },
  'overflow-wrap': { inherited: true, initial: 'normal', parse: (ts) => keyword(ts, new Set(['normal', 'break-word', 'anywhere'])) },
  'word-break': { inherited: true, initial: 'normal', parse: (ts) => keyword(ts, new Set(['normal', 'break-all', 'keep-all', 'break-word'])) },
  visibility: { inherited: true, initial: 'visible', parse: (ts) => keyword(ts, new Set(['visible', 'hidden', 'collapse'])) },

  width: { inherited: false, initial: 'auto', parse: (ts) => length(ts, { percent: true, auto: true, negative: false }) },
  height: { inherited: false, initial: 'auto', parse: (ts) => length(ts, { percent: true, auto: true, negative: false }) },
  'min-width': { inherited: false, initial: { type: 'length', value: 0, unit: 'px' }, parse: (ts) => length(ts, { percent: true, auto: true, negative: false }) },
  'min-height': { inherited: false, initial: { type: 'length', value: 0, unit: 'px' }, parse: (ts) => length(ts, { percent: true, auto: true, negative: false }) },
  'max-width': { inherited: false, initial: 'none', parse: (ts) => length(ts, { percent: true, none: true, negative: false }) },
  'max-height': { inherited: false, initial: 'none', parse: (ts) => length(ts, { percent: true, none: true, negative: false }) },
  'box-sizing': { inherited: false, initial: 'content-box', parse: (ts) => keyword(ts, new Set(['content-box', 'border-box'])) },
  'vertical-align': { inherited: false, initial: 'baseline', parse: (ts) => keyword(ts, new Set(['baseline', 'top', 'middle', 'bottom', 'sub', 'super', 'text-top', 'text-bottom'])) },

  'list-style-type': { inherited: true, initial: 'disc', parse: (ts) => keyword(ts, LIST_STYLE_TYPES) },
  'list-style-position': { inherited: true, initial: 'outside', parse: (ts) => keyword(ts, new Set(['inside', 'outside'])) },

  'border-collapse': { inherited: true, initial: 'separate', parse: (ts) => keyword(ts, new Set(['separate', 'collapse'])) },
  'border-spacing': { inherited: true, initial: [{ type: 'length', value: 0, unit: 'px' }, { type: 'length', value: 0, unit: 'px' }], parse: borderSpacing },
  'table-layout': { inherited: false, initial: 'auto', parse: (ts) => keyword(ts, new Set(['auto', 'fixed'])) },

  'break-before': { inherited: false, initial: 'auto', parse: (ts) => keyword(ts, BREAK_BETWEEN) },
  'break-after': { inherited: false, initial: 'auto', parse: (ts) => keyword(ts, BREAK_BETWEEN) },
  'break-inside': { inherited: false, initial: 'auto', parse: (ts) => keyword(ts, BREAK_INSIDE) },
  orphans: { inherited: true, initial: 2, parse: (ts) => integer(ts, 1) },
  widows: { inherited: true, initial: 2, parse: (ts) => integer(ts, 1) },
};

for (const side of SIDES) {
  PROPERTIES[`margin-${side}`] = { inherited: false, initial: { type: 'length', value: 0, unit: 'px' }, parse: (ts) => length(ts, { percent: true, auto: true }) };
  PROPERTIES[`padding-${side}`] = { inherited: false, initial: { type: 'length', value: 0, unit: 'px' }, parse: (ts) => length(ts, { percent: true, negative: false }) };
  PROPERTIES[`border-${side}-width`] = { inherited: false, initial: 'medium', parse: borderWidth };
  PROPERTIES[`border-${side}-style`] = { inherited: false, initial: 'none', parse: (ts) => keyword(ts, BORDER_STYLES) };
  PROPERTIES[`border-${side}-color`] = { inherited: false, initial: 'currentcolor', parse: color };
}

/* ------------------------------------------------------------- shorthands */

function boxShorthand(prefix: (side: string) => string, parser: ValueParser): ShorthandExpander {
  return (ts) => {
    const values: SpecifiedValue[] = [];
    for (const g of splitBySpace(ts)) {
      const v = parser(g);
      if (v === undefined) return undefined;
      values.push(v);
    }
    const four = fourSides(values);
    if (!four) return undefined;
    return SIDES.map((s, i): Declaration => [prefix(s), four[i]!]);
  };
}

/** Interpreta "border: 1px solid red" em { width, style, color }. */
function parseBorderParts(ts: Tokens): { width: SpecifiedValue; style: string; color: SpecifiedValue } | undefined {
  const out: { width?: SpecifiedValue; style?: string; color?: SpecifiedValue } = {};
  for (const g of splitBySpace(ts)) {
    const st = keyword(g, BORDER_STYLES);
    if (st && out.style === undefined) {
      out.style = st;
      continue;
    }
    const w = borderWidth(g);
    if (w !== undefined && out.width === undefined) {
      out.width = w;
      continue;
    }
    const c = color(g);
    if (c !== undefined && out.color === undefined) {
      out.color = c;
      continue;
    }
    return undefined;
  }
  return {
    width: out.width ?? 'medium',
    style: out.style ?? 'none',
    color: out.color ?? 'currentcolor',
  };
}

function borderSide(side: string): ShorthandExpander {
  return (ts) => {
    const p = parseBorderParts(ts);
    if (!p) return undefined;
    return [
      [`border-${side}-width`, p.width],
      [`border-${side}-style`, p.style],
      [`border-${side}-color`, p.color],
    ];
  };
}

function fontShorthand(ts: Tokens): Declaration[] | undefined {
  // [style || weight]? size[/line-height]? family
  const groups = splitBySpace(ts);
  const result: Declaration[] = [['font-style', 'normal'], ['font-weight', 400], ['line-height', 'normal']];
  let i = 0;
  for (; i < groups.length; i++) {
    const g = groups[i];
    const st = keyword(g, new Set(['italic', 'oblique']));
    if (st) {
      result[0][1] = st;
      continue;
    }
    if (keyword(g, new Set(['normal', 'small-caps']))) continue;
    const w = fontWeight(g);
    if (w !== undefined) {
      result[1][1] = w;
      continue;
    }
    break;
  }
  if (i >= groups.length) return undefined;
  // tamanho, possivelmente "12px/1.5"
  const sizeGroup = groups[i];
  const slash = sizeGroup.findIndex((t) => t.type === 'delim' && t.value === '/');
  let sizeTokens = sizeGroup;
  let lhTokens: CSSToken[] | null | undefined = null;
  let rest = groups.slice(i + 1);
  if (slash >= 0) {
    sizeTokens = sizeGroup.slice(0, slash);
    lhTokens = sizeGroup.slice(slash + 1);
    if (lhTokens.length === 0 && rest.length) lhTokens = rest.shift();
  } else if (rest[0] && rest[0][0]?.type === 'delim' && rest[0][0].value === '/') {
    lhTokens = rest[0].length > 1 ? rest[0].slice(1) : rest[1];
    rest = rest[0].length > 1 ? rest.slice(1) : rest.slice(2);
  }
  const size = length(sizeTokens, { percent: true, negative: false, keywords: FONT_SIZE_KEYWORDS });
  if (size === undefined) return undefined;
  result.push(['font-size', size]);
  if (lhTokens) {
    const lh = lineHeight(lhTokens);
    if (lh === undefined) return undefined;
    result[2][1] = lh;
  }
  const familyTokens: CSSToken[] = [];
  rest.forEach((g, k) => {
    if (k) familyTokens.push({ type: 'whitespace' });
    familyTokens.push(...g);
  });
  const fam = fontFamily(familyTokens);
  if (!fam) return undefined;
  result.push(['font-family', fam]);
  return result;
}

function backgroundShorthand(ts: Tokens): Declaration[] {
  // Fase 1: apenas a cor de fundo é extraída; imagens/gradientes são ignorados.
  for (const g of splitBySpace(ts)) {
    const c = color(g);
    if (c !== undefined) return [['background-color', c]];
  }
  if (keyword(nonWS(ts), new Set(['none']))) return [['background-color', TRANSPARENT]];
  return [['background-color', TRANSPARENT]];
}

function listStyleShorthand(ts: Tokens): Declaration[] | undefined {
  const out: Declaration[] = [];
  for (const g of splitBySpace(ts)) {
    const pos = keyword(g, new Set(['inside', 'outside']));
    if (pos) {
      out.push(['list-style-position', pos]);
      continue;
    }
    const type = keyword(g, LIST_STYLE_TYPES);
    if (type) {
      out.push(['list-style-type', type]);
      continue;
    }
    // list-style-image (url) ainda não suportado: ignorado
    if (g[0]?.type === 'url') continue;
    return undefined;
  }
  return out;
}

function legacyBreak(target: string): ShorthandExpander {
  return (ts) => {
    const k = keyword(ts, new Set(['auto', 'always', 'avoid', 'left', 'right']));
    if (!k) return undefined;
    return [[target, k === 'always' ? 'page' : k]];
  };
}

function textDecorationShorthand(ts: Tokens): Declaration[] | undefined {
  const lines: DecorationLine[] = [];
  for (const g of splitBySpace(ts)) {
    const v = textDecorationLine(g);
    if (v !== undefined) {
      lines.push(...v);
      continue;
    }
    // estilo, cor e espessura ainda não são aplicados separadamente
    if (keyword(g, new Set(['solid', 'double', 'dotted', 'dashed', 'wavy'])) || color(g) !== undefined) continue;
    return undefined;
  }
  return [['text-decoration-line', lines]];
}

export const SHORTHANDS: Record<string, ShorthandExpander> = {
  margin: boxShorthand((s) => `margin-${s}`, (g) => length(g, { percent: true, auto: true })),
  padding: boxShorthand((s) => `padding-${s}`, (g) => length(g, { percent: true, negative: false })),
  'border-width': boxShorthand((s) => `border-${s}-width`, borderWidth),
  'border-style': boxShorthand((s) => `border-${s}-style`, (g) => keyword(g, BORDER_STYLES)),
  'border-color': boxShorthand((s) => `border-${s}-color`, color),
  border: (ts) => {
    const parts = SIDES.map((s) => borderSide(s)(ts));
    const out: Declaration[] = [];
    for (const p of parts) {
      if (!p) return undefined;
      out.push(...p);
    }
    return out;
  },
  'border-top': borderSide('top'),
  'border-right': borderSide('right'),
  'border-bottom': borderSide('bottom'),
  'border-left': borderSide('left'),
  font: fontShorthand,
  background: backgroundShorthand,
  'list-style': listStyleShorthand,
  'text-decoration': textDecorationShorthand,
  'page-break-before': legacyBreak('break-before'),
  'page-break-after': legacyBreak('break-after'),
  'page-break-inside': (ts) => {
    const k = keyword(ts, new Set(['auto', 'avoid']));
    return k ? [['break-inside', k]] : undefined;
  },
};

const GLOBAL_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert']);

/**
 * Converte uma declaração em pares [longhand, valor]. Retorna [] quando a
 * declaração é inválida ou a propriedade não é suportada.
 */
export function expandDeclaration(property: string, valueTokens: Tokens): Declaration[] {
  const ts = nonWS(valueTokens);
  if (ts.length === 1 && ts[0].type === 'ident' && GLOBAL_KEYWORDS.has(ts[0].value.toLowerCase())) {
    const word = ts[0].value.toLowerCase();
    const g: GlobalValue = { global: word === 'revert' ? 'unset' : (word as GlobalValue['global']) };
    if (PROPERTIES[property]) return [[property, g]];
    if (SHORTHANDS[property]) {
      // Expande o shorthand para todas as suas longhands com a palavra global.
      const sample = SHORTHAND_LONGHANDS[property] ?? [];
      return sample.map((p): Declaration => [p, g]);
    }
    return [];
  }
  if (PROPERTIES[property]) {
    const v = PROPERTIES[property].parse(valueTokens);
    return v === undefined ? [] : [[property, v]];
  }
  if (SHORTHANDS[property]) {
    return SHORTHANDS[property](valueTokens) ?? [];
  }
  return [];
}

const SHORTHAND_LONGHANDS: Record<string, string[]> = {
  margin: SIDES.map((s) => `margin-${s}`),
  padding: SIDES.map((s) => `padding-${s}`),
  'border-width': SIDES.map((s) => `border-${s}-width`),
  'border-style': SIDES.map((s) => `border-${s}-style`),
  'border-color': SIDES.map((s) => `border-${s}-color`),
  border: SIDES.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`]),
  font: ['font-style', 'font-weight', 'font-size', 'line-height', 'font-family'],
  background: ['background-color'],
  'list-style': ['list-style-type', 'list-style-position'],
  'text-decoration': ['text-decoration-line'],
};
for (const s of SIDES) SHORTHAND_LONGHANDS[`border-${s}`] = [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`];

export function isSupportedProperty(name: string): boolean {
  return !!(PROPERTIES[name] || SHORTHANDS[name]);
}
