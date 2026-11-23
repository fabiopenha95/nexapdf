/**
 * Canvas abstrato: lista de exibição (display list) de uma página.
 *
 * Coordenadas em pontos, origem no canto superior esquerdo da página, eixo y
 * para baixo (como no CSS). A conversão para o sistema do PDF (origem no
 * canto inferior esquerdo) ocorre na geração do content stream.
 */

import { isTransparent } from './colors.ts';
import type { Color } from './colors.ts';
import type { FontFace } from '../fonts/font-manager.ts';

export type Point = [x: number, y: number];

export type DrawOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; color: Color }
  | { op: 'polygon'; points: Point[]; color: Color }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; color: Color; dash: [number, number] | null; cap: 'butt' | 'round' }
  | { op: 'circle'; cx: number; cy: number; r: number; color: Color; fill: boolean; lineWidth: number }
  | { op: 'text'; x: number; y: number; text: string; face: FontFace; size: number; color: Color; letterSpacing: number };

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly ops: DrawOp[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  fillRect(x: number, y: number, w: number, h: number, color: Color): void {
    if (isTransparent(color) || w <= 0 || h <= 0) return;
    this.ops.push({ op: 'rect', x, y, w, h, color });
  }

  fillPolygon(points: Point[], color: Color): void {
    if (isTransparent(color)) return;
    this.ops.push({ op: 'polygon', points, color });
  }

  strokeLine(
    x1: number, y1: number, x2: number, y2: number,
    width: number, color: Color, dash: [number, number] | null = null, cap: 'butt' | 'round' = 'butt',
  ): void {
    if (isTransparent(color) || width <= 0) return;
    this.ops.push({ op: 'line', x1, y1, x2, y2, width, color, dash, cap });
  }

  circle(cx: number, cy: number, r: number, color: Color, fill = true, lineWidth = 0.75): void {
    if (isTransparent(color) || r <= 0) return;
    this.ops.push({ op: 'circle', cx, cy, r, color, fill, lineWidth });
  }

  /** @param y linha de base */
  text(x: number, y: number, text: string, face: FontFace, size: number, color: Color, letterSpacing = 0): void {
    if (!text || isTransparent(color)) return;
    this.ops.push({ op: 'text', x, y, text, face, size, color, letterSpacing });
  }
}
