/**
 * Medição de texto a partir das métricas reais da fonte (larguras AFM).
 *
 * Limitações documentadas (Fase 1):
 *  - kerning e ligaduras não são aplicados;
 *  - sem shaping para escritas complexas;
 *  - caracteres fora do WinAnsi são medidos e desenhados como "?".
 */

import { winAnsiByte, REPLACEMENT_BYTE } from './glyph-mapping.ts';
import type { FontFace } from './font-manager.ts';
import type { ComputedStyle } from '../css/types.ts';

/** Largura de uma string em pontos. */
export function measureText(text: string, face: FontFace, fontSize: number, letterSpacing = 0): number {
  let units = 0;
  let count = 0;
  const widths = face.widths;
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      cp = text.codePointAt(i)!;
      i++;
    }
    const b = winAnsiByte(cp);
    units += widths[b === -1 ? REPLACEMENT_BYTE : b] ?? 0;
    count++;
  }
  return (units * fontSize) / 1000 + letterSpacing * count;
}

/** Altura de linha para line-height: normal. */
export function normalLineHeight(face: FontFace, fontSize: number): number {
  return (face.ascent + face.descent + face.lineGap) * fontSize;
}

/** Calcula a altura de linha computada (em pontos). */
export function resolveLineHeight(style: Pick<ComputedStyle, 'line-height' | 'font-size'>, face: FontFace): number {
  const lh = style['line-height'];
  const fs = style['font-size'];
  if (lh === 'normal' || lh === undefined) return normalLineHeight(face, fs);
  if (typeof lh === 'object') return lh.value * fs;
  return lh;
}
