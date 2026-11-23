/**
 * Desenho de bordas (CSS Backgrounds and Borders Level 3, §4), sem raios.
 *
 * Bordas sólidas são desenhadas como trapézios, de modo que os cantos entre
 * lados de cores diferentes fiquem chanfrados como nos navegadores.
 * dashed/dotted são traçadas pela linha central; double usa duas faixas.
 * groove/ridge/inset/outset são aproximadas como sólidas (Fase 1).
 */

import type { Canvas, Point } from './canvas.ts';
import type { ComputedStyle } from '../css/types.ts';
import { SIDES } from '../css/types.ts';
import type { EdgeSizes } from '../layout/types.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * @param {Canvas} canvas
 * @param {{x,y,w,h}} rect  caixa de borda em coordenadas da página
 * @param {object} widths   { top, right, bottom, left }
 * @param {object} style    estilo computado (estilos e cores das bordas)
 */
export function drawBorders(canvas: Canvas, rect: Rect, widths: EdgeSizes, style: ComputedStyle): void {
  const { x, y, w, h } = rect;
  const t = widths.top;
  const r = widths.right;
  const b = widths.bottom;
  const l = widths.left;
  const outer: Record<string, Point[]> = { top: [[x, y], [x + w, y]], right: [[x + w, y], [x + w, y + h]], bottom: [[x + w, y + h], [x, y + h]], left: [[x, y + h], [x, y]] };
  const inner: Record<string, Point[]> = {
    top: [[x + w - r, y + t], [x + l, y + t]],
    right: [[x + w - r, y + h - b], [x + w - r, y + t]],
    bottom: [[x + l, y + h - b], [x + w - r, y + h - b]],
    left: [[x + l, y + t], [x + l, y + h - b]],
  };

  for (const side of SIDES) {
    const width = widths[side];
    if (!width) continue;
    const st = style[`border-${side}-style`];
    const color = style[`border-${side}-color`];
    if (st === 'none' || st === 'hidden') continue;

    if (st === 'dashed' || st === 'dotted') {
      const half = width / 2;
      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      if (side === 'top') [x1, y1, x2, y2] = [x, y + half, x + w, y + half];
      else if (side === 'bottom') [x1, y1, x2, y2] = [x, y + h - half, x + w, y + h - half];
      else if (side === 'left') [x1, y1, x2, y2] = [x + half, y, x + half, y + h];
      else [x1, y1, x2, y2] = [x + w - half, y, x + w - half, y + h];
      const dash: [number, number] = st === 'dotted' ? [0, width * 2] : [width * 3, width * 3];
      canvas.strokeLine(x1, y1, x2, y2, width, color, dash, st === 'dotted' ? 'round' : 'butt');
      continue;
    }

    if (st === 'double' && width >= 3) {
      const third = width / 3;
      const band = (offsetOuter: number, thickness: number): void => {
        if (side === 'top') canvas.fillRect(x, y + offsetOuter, w, thickness, color);
        else if (side === 'bottom') canvas.fillRect(x, y + h - offsetOuter - thickness, w, thickness, color);
        else if (side === 'left') canvas.fillRect(x + offsetOuter, y, thickness, h, color);
        else canvas.fillRect(x + w - offsetOuter - thickness, y, thickness, h, color);
      };
      band(0, third);
      band(2 * third, third);
      continue;
    }

    // Sólida (e aproximações).
    canvas.fillPolygon([...outer[side]!, ...inner[side]!], color);
  }
}
