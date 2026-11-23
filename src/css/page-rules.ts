/**
 * Interpretação de regras @page (CSS Paged Media Level 3):
 *   size: <comprimento>{1,2} | <tamanho-nomeado> [portrait|landscape] | auto
 *   margin, margin-top/right/bottom/left
 */

import { resolvePageSize } from '../core/configuration.ts';
import { length, splitBySpace, fourSides } from './properties/values.ts';
import type { Tokens } from './properties/values.ts';
import { lengthToPoints } from './computed-style.ts';
import type { StyleContext } from './computed-style.ts';
import { PT_PER_PX } from '../layout/measurements.ts';
import type { PageRule } from './parser.ts';
import type { CssPageRule, Orientation, ResolvedMargins } from '../core/options.ts';
import type { LengthValue } from './types.ts';

const BASE_FONT = 16 * PT_PER_PX;
const ctx: StyleContext = { rootFontSize: BASE_FONT, viewportWidth: 0, viewportHeight: 0 };

function toPt(v: unknown): number | null {
  if (typeof v === 'object' && v !== null && (v as LengthValue).type === 'length') {
    return lengthToPoints(v as LengthValue, BASE_FONT, ctx);
  }
  return null;
}

function parseSize(tokens: Tokens): { size: [number, number] | null; orientation: Orientation | null } {
  let size: [number, number] | null = null;
  let orientation: Orientation | null = null;
  const lengths: number[] = [];
  for (const g of splitBySpace(tokens)) {
    const t = g[0];
    if (g.length === 1 && t && t.type === 'ident') {
      const v = t.value.toLowerCase();
      if (v === 'portrait' || v === 'landscape') orientation = v;
      else if (v !== 'auto') size = resolvePageSize(v);
      continue;
    }
    const l = toPt(length(g, { negative: false }));
    if (l !== null) lengths.push(l);
  }
  const [w, h] = lengths;
  if (lengths.length === 1 && w !== undefined) size = [w, w];
  if (lengths.length === 2 && w !== undefined && h !== undefined) size = [w, h];
  if (size && orientation === 'landscape' && size[0] < size[1]) size = [size[1], size[0]];
  if (size && orientation === 'portrait' && size[0] > size[1]) size = [size[1], size[0]];
  return { size, orientation };
}

const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** Consolida as regras @page (a última declaração vence). */
export function extractPageRule(pageRules: readonly PageRule[]): CssPageRule | null {
  const out: CssPageRule = { size: null, orientation: null, margin: null };
  for (const rule of [...pageRules].sort((a, b) => a.order - b.order)) {
    for (const d of rule.declarations) {
      if (d.property === 'size') {
        const r = parseSize(d.value);
        if (r.size) out.size = r.size;
        if (r.orientation) out.orientation = r.orientation;
      } else if (d.property === 'margin') {
        const four = fourSides(splitBySpace(d.value).map((g) => toPt(length(g))));
        if (four && four.every((v): v is number => v !== null)) {
          const [top, right, bottom, left] = four as [number, number, number, number];
          out.margin = { ...(out.margin ?? {}), top, right, bottom, left };
        }
      } else {
        const side = MARGIN_SIDES.find((s) => d.property === `margin-${s}`);
        if (side) {
          const v = toPt(length(d.value));
          if (v !== null) out.margin = { ...(out.margin ?? {}), [side]: v } as Partial<ResolvedMargins>;
        }
      }
    }
  }
  return out.size || out.margin || out.orientation ? out : null;
}
