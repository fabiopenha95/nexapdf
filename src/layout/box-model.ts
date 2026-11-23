/**
 * Modelo de caixa (CSS 2.1 §8 e §10).
 * Resolve margens, bordas, preenchimentos e larguras em pontos.
 */

import type { ComputedLength, ComputedStyle } from '../css/types.ts';
import { SIDES } from '../css/types.ts';
import type { BoxEdges, EdgeSizes } from './types.ts';

/** Resolve um comprimento computado contra uma base (percentuais). */
export function resolve<T extends number | null>(value: ComputedLength | undefined, base: number, autoValue: T): number | T {
  if (value === 'auto' || value === 'none' || value === undefined) return autoValue;
  if (typeof value === 'number') return value;
  return (value.percent / 100) * base;
}

/** Atalho: valor numérico (percentual resolvido) ou 0. */
export function px(value: ComputedLength | undefined, base = 0): number {
  return resolve(value, base, 0);
}

export function isAuto(value: ComputedLength | undefined): boolean {
  return value === 'auto';
}

/** Margens, bordas e preenchimento em pontos. Percentuais usam a largura do bloco contêiner. */
export function resolveBoxEdges(style: ComputedStyle, cbWidth: number): BoxEdges {
  const margin: EdgeSizes = { top: 0, right: 0, bottom: 0, left: 0 };
  const padding: EdgeSizes = { top: 0, right: 0, bottom: 0, left: 0 };
  const border: EdgeSizes = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const s of SIDES) {
    margin[s] = px(style[`margin-${s}`], cbWidth);
    padding[s] = px(style[`padding-${s}`], cbWidth);
    border[s] = style[`border-${s}-width`] || 0;
  }
  return { margin, padding, border };
}

export const ZERO_EDGES: Readonly<EdgeSizes> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** Combina margens adjacentes (colapso, CSS 2.1 §8.3.1). */
export function collapseMargins(...values: number[]): number {
  let pos = 0;
  let neg = 0;
  for (const v of values) {
    if (v > pos) pos = v;
    if (v < neg) neg = v;
  }
  return pos + neg;
}

/** Aplica min-width / max-width a uma largura de conteúdo. */
export function clampWidth(width: number, style: ComputedStyle, cbWidth: number, extra: number): number {
  const borderBox = style['box-sizing'] === 'border-box';
  const conv = (v: ComputedLength): number | null => {
    const r = resolve(v, cbWidth, null);
    if (r === null) return null;
    return borderBox ? Math.max(0, r - extra) : r;
  };
  const max = conv(style['max-width']);
  const min = conv(style['min-width']);
  if (max !== null && width > max) width = max;
  if (min !== null && width < min) width = min;
  return width;
}

/** Aplica min-height / max-height. Percentuais de altura são tratados como auto. */
export function clampHeight(height: number, style: ComputedStyle, extra: number): number {
  const borderBox = style['box-sizing'] === 'border-box';
  const conv = (v: ComputedLength): number | null => {
    if (typeof v !== 'number') return null;
    return borderBox ? Math.max(0, v - extra) : v;
  };
  const max = conv(style['max-height']);
  const min = conv(style['min-height']);
  if (max !== null && height > max) height = max;
  if (min !== null && height < min) height = min;
  return height;
}
