/**
 * Gerenciamento de fontes.
 *
 * Resolve font-family / font-weight / font-style para uma face concreta e
 * registra quais faces foram usadas (para incorporação no PDF).
 *
 * Fase 1: apenas as fontes padrão do PDF (Helvetica e Courier, com variantes).
 * Famílias monoespaçadas mapeiam para Courier; todas as demais para Helvetica.
 * O carregamento de TrueType (TTF) está previsto para a Fase 3 e se conectará
 * aqui.
 */

import { STANDARD_FONTS } from './data/standard-metrics.ts';
import type { StandardFontMetrics } from './data/standard-metrics.ts';
import type { ComputedStyle } from '../css/types.ts';

const MONOSPACE_FAMILIES: ReadonlySet<string> = new Set([
  'monospace', 'courier', 'courier new', 'consolas', 'menlo', 'monaco', 'lucida console',
  'dejavu sans mono', 'liberation mono', 'source code pro', 'ui-monospace', 'sfmono-regular',
]);

/** Subconjunto do estilo necessário para escolher a face. */
export type FontSelector = Pick<ComputedStyle, 'font-family' | 'font-weight' | 'font-style'>;

export class FontFace {
  readonly key: string; // ex.: "Helvetica-Bold"
  readonly metrics: StandardFontMetrics;
  readonly widths: Uint16Array;
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;

  constructor(key: string, metrics: StandardFontMetrics) {
    this.key = key;
    this.metrics = metrics;
    this.widths = metrics.widths;
    this.ascent = metrics.ascent;
    this.descent = metrics.descent;
    this.lineGap = metrics.lineGap;
  }
}

export class FontManager {
  private readonly faces = new Map<string, FontFace>();
  private readonly used = new Set<string>();

  constructor() {
    for (const [key, metrics] of Object.entries(STANDARD_FONTS)) this.faces.set(key, new FontFace(key, metrics));
  }

  /** Resolve uma face a partir do estilo computado. */
  resolve(style: FontSelector): FontFace {
    const families = style['font-family'] ?? ['sans-serif'];
    let base: 'Helvetica' | 'Courier' = 'Helvetica';
    for (const fam of families) {
      const f = fam.toLowerCase().trim();
      if (MONOSPACE_FAMILIES.has(f)) {
        base = 'Courier';
        break;
      }
      // A primeira família não vazia define o resultado; as demais são
      // tratadas como sem serifa até que fontes TTF sejam suportadas.
      if (f) break;
    }
    const bold = (style['font-weight'] ?? 400) >= 600;
    const italic = style['font-style'] === 'italic' || style['font-style'] === 'oblique';
    let key: string = base;
    if (bold && italic) key += '-BoldOblique';
    else if (bold) key += '-Bold';
    else if (italic) key += '-Oblique';
    const face = this.faces.get(key)!;
    this.used.add(key);
    return face;
  }

  usedFaces(): FontFace[] {
    return [...this.used].sort().map((k) => this.faces.get(k)!);
  }
}
