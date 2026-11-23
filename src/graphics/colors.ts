/**
 * Cores CSS → { r, g, b, a } com r/g/b em 0–255 e a em 0–1.
 * Suporta: nomes (lista completa do CSS Color Level 4), transparent,
 * currentColor (resolvido no estilo computado), #rgb, #rgba, #rrggbb,
 * #rrggbbaa, rgb()/rgba() e hsl()/hsla() (sintaxes com vírgula e com espaço).
 */

import type { CSSToken } from '../css/types.ts';

/** Cor RGBA: r/g/b em 0–255, a em 0–1. */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_HEX: Readonly<Record<string, string>> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff',
  beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff',
  blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9',
  darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b',
  darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000',
  darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b', darkslategray: '2f4f4f',
  darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493',
  deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff', firebrick: 'b22222',
  floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff',
  gold: 'ffd700', goldenrod: 'daa520', gray: '808080', green: '008000', greenyellow: 'adff2f', grey: '808080',
  honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c',
  lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6',
  lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3',
  lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a', lightseagreen: '20b2aa',
  lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000',
  mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db',
  mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc',
  mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5',
  navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23', orange: 'ffa500',
  orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee',
  palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd',
  powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f',
  royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57',
  seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c',
  teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3',
  white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
};

export const TRANSPARENT: Readonly<Color> = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
export const BLACK: Readonly<Color> = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });

function fromHex(hex: string): Color | null {
  let h = hex;
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * Interpreta uma cor a partir de tokens CSS (sem espaços nas extremidades).
 * Retorna { r,g,b,a }, a string 'currentcolor' ou null.
 */
export function parseColorTokens(tokens: readonly CSSToken[]): Color | 'currentcolor' | null {
  const ts = tokens.filter((t) => t.type !== 'whitespace');
  if (ts.length === 0) return null;
  const t = ts[0];
  if (ts.length === 1 && t.type === 'ident') return parseColorString(t.value);
  if (ts.length === 1 && t.type === 'hash') return fromHex(t.value);
  if (t.type === 'function') {
    const name = t.value.toLowerCase();
    const args: { type: 'number' | 'percentage' | 'dimension'; value: number; unit?: string }[] = [];
    for (let i = 1; i < ts.length; i++) {
      const a = ts[i];
      if (a.type === ')') break;
      if (a.type === 'comma' || (a.type === 'delim' && a.value === '/')) continue;
      if (a.type === 'number' || a.type === 'percentage' || a.type === 'dimension') args.push(a);
      else if (a.type === 'ident' && a.value.toLowerCase() === 'none') args.push({ type: 'number', value: 0 });
      else return null;
    }
    if (name === 'rgb' || name === 'rgba') {
      if (args.length < 3) return null;
      const ch = args.slice(0, 3).map((a) => (a.type === 'percentage' ? (a.value * 255) / 100 : a.value));
      const alpha = args[3] ? (args[3].type === 'percentage' ? args[3].value / 100 : args[3].value) : 1;
      return { r: clamp(Math.round(ch[0]), 0, 255), g: clamp(Math.round(ch[1]), 0, 255), b: clamp(Math.round(ch[2]), 0, 255), a: clamp(alpha, 0, 1) };
    }
    if (name === 'hsl' || name === 'hsla') {
      if (args.length < 3) return null;
      const h = args[0].type === 'dimension' && args[0].unit === 'turn' ? args[0].value * 360 : args[0].value;
      const s = clamp(args[1].value / 100, 0, 1);
      const l = clamp(args[2].value / 100, 0, 1);
      const [r, g, b] = hslToRgb(h, s, l);
      const alpha = args[3] ? (args[3].type === 'percentage' ? args[3].value / 100 : args[3].value) : 1;
      return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: clamp(alpha, 0, 1) };
    }
  }
  return null;
}

export function parseColorString(str: string): Color | 'currentcolor' | null {
  const s = String(str).trim().toLowerCase();
  if (s === 'transparent') return { ...TRANSPARENT };
  if (s === 'currentcolor') return 'currentcolor';
  if (s.startsWith('#')) return fromHex(s.slice(1));
  if (NAMED_HEX[s]) return fromHex(NAMED_HEX[s]);
  return null;
}

export function isTransparent(c: Color | null | undefined): boolean {
  return !c || c.a === 0;
}

/** Converte para componentes 0–1 (operadores de cor do PDF). */
export function toUnitRGB(c: Color): [number, number, number] {
  return [c.r / 255, c.g / 255, c.b / 255];
}
