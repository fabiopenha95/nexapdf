/**
 * Geração de content streams (ISO 32000-1, seções 8 e 9) a partir da lista
 * de exibição do Canvas.
 *
 * Converte coordenadas do sistema "topo-esquerda, y para baixo" para o
 * sistema do PDF ("base-esquerda, y para cima").
 */

import { formatNumber as n, escapeLiteralBytes } from './pdf-objects.ts';
import { encodeWinAnsi } from '../fonts/glyph-mapping.ts';
import { toUnitRGB } from '../graphics/colors.ts';
import type { Color } from '../graphics/colors.ts';
import type { DrawOp } from '../graphics/canvas.ts';
import type { FontFace } from '../fonts/font-manager.ts';

/** Resolve nomes de recursos da página (fontes e estados gráficos). */
export interface ContentResources {
  fontName(face: FontFace): string;
  alphaName(alpha: number): string;
}

/** Constante de Bézier para aproximar quartos de círculo. */
const KAPPA = 0.5522847498;

export class ContentBuilder {
  private readonly h: number;
  private readonly res: ContentResources;
  private readonly parts: string[] = [];

  constructor(pageHeight: number, resources: ContentResources) {
    this.h = pageHeight;
    this.res = resources;
  }

  private y(v: number): number {
    return this.h - v;
  }

  private fillColor(c: Color): string {
    const [r, g, b] = toUnitRGB(c);
    return `${n(r)} ${n(g)} ${n(b)} rg`;
  }

  private strokeColor(c: Color): string {
    const [r, g, b] = toUnitRGB(c);
    return `${n(r)} ${n(g)} ${n(b)} RG`;
  }

  /** Envolve operadores em q/Q, aplicando transparência quando necessário. */
  private push(color: Color, body: string): void {
    const gs = color.a < 1 ? `${this.res.alphaName(color.a)} gs\n` : '';
    this.parts.push(`q\n${gs}${body}\nQ`);
  }

  add(op: DrawOp): void {
    switch (op.op) {
      case 'rect':
        this.push(op.color, `${this.fillColor(op.color)}\n${n(op.x)} ${n(this.y(op.y + op.h))} ${n(op.w)} ${n(op.h)} re\nf`);
        break;
      case 'polygon': {
        const [first, ...rest] = op.points;
        if (!first) break;
        let path = `${n(first[0])} ${n(this.y(first[1]))} m\n`;
        for (const [px, py] of rest) path += `${n(px)} ${n(this.y(py))} l\n`;
        this.push(op.color, `${this.fillColor(op.color)}\n${path}h\nf`);
        break;
      }
      case 'line': {
        const cap = op.cap === 'round' ? 1 : 0;
        const dash = op.dash ? `[${op.dash.map(n).join(' ')}] 0 d\n` : '';
        this.push(
          op.color,
          `${this.strokeColor(op.color)}\n${n(op.width)} w\n${cap} J\n${dash}${n(op.x1)} ${n(this.y(op.y1))} m\n${n(op.x2)} ${n(this.y(op.y2))} l\nS`,
        );
        break;
      }
      case 'circle': {
        const { cx, r } = op;
        const cy = this.y(op.cy);
        const k = KAPPA * r;
        const path =
          `${n(cx + r)} ${n(cy)} m\n` +
          `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c\n` +
          `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c\n` +
          `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c\n` +
          `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c\n`;
        const paint = op.fill ? `${this.fillColor(op.color)}\n${path}f` : `${this.strokeColor(op.color)}\n${n(op.lineWidth)} w\n${path}S`;
        this.push(op.color, paint);
        break;
      }
      case 'text': {
        const font = this.res.fontName(op.face);
        const str = escapeLiteralBytes(encodeWinAnsi(op.text));
        const tc = op.letterSpacing ? `${n(op.letterSpacing)} Tc\n` : '';
        this.push(
          op.color,
          `${this.fillColor(op.color)}\nBT\n${font} ${n(op.size)} Tf\n${tc}1 0 0 1 ${n(op.x)} ${n(this.y(op.y))} Tm\n(${str}) Tj\nET`,
        );
        break;
      }
      default: {
        const never: never = op;
        throw new TypeError(`Operação de desenho desconhecida: ${JSON.stringify(never)}`);
      }
    }
  }

  build(ops: readonly DrawOp[]): Buffer {
    for (const op of ops) this.add(op);
    return Buffer.from(this.parts.join('\n') + '\n', 'latin1');
  }
}
