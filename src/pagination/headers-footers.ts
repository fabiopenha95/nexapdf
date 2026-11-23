/**
 * Cabeçalhos, rodapés e numeração de páginas.
 *
 * São desenhados nas áreas de margem superior/inferior de cada página.
 * Marcadores no texto: {{page}} (número da página) e {{pages}} (total).
 */

import { measureText } from '../fonts/text-measurement.ts';
import { parseColorString, BLACK } from '../graphics/colors.ts';
import type { Canvas } from '../graphics/canvas.ts';
import type { FontFace, FontManager } from '../fonts/font-manager.ts';
import type { ResolvedConfig, ResolvedHeaderFooter } from '../core/options.ts';

export function formatTemplate(text: string, page: number, pages: number): string {
  return text.replace(/\{\{\s*page\s*\}\}/g, String(page)).replace(/\{\{\s*pages\s*\}\}/g, String(pages));
}

function draw(canvas: Canvas, spec: ResolvedHeaderFooter, text: string, baselineY: number, config: ResolvedConfig, face: FontFace): void {
  const size = spec.fontSize;
  const width = measureText(text, face, size);
  const left = config.margin.left;
  const right = config.pageWidth - config.margin.right;
  let x = left;
  if (spec.align === 'center') x = (left + right - width) / 2;
  else if (spec.align === 'right') x = right - width;
  const parsed = parseColorString(spec.color);
  const color = parsed && parsed !== 'currentcolor' ? parsed : BLACK;
  canvas.text(x, baselineY, text, face, size, color);
}

export function drawHeadersAndFooters(canvases: readonly Canvas[], config: ResolvedConfig, fonts: FontManager): void {
  const { header, footer } = config;
  if (!header && !footer) return;
  const face = fonts.resolve({ 'font-family': ['Helvetica'], 'font-weight': 400, 'font-style': 'normal' });
  const total = canvases.length;
  canvases.forEach((canvas, i) => {
    if (header) {
      const text = formatTemplate(header.text, i + 1, total);
      const baseline = config.margin.top / 2 + (header.fontSize * face.ascent) / 2;
      draw(canvas, header, text, baseline, config, face);
    }
    if (footer) {
      const text = formatTemplate(footer.text, i + 1, total);
      const baseline = config.pageHeight - config.margin.bottom / 2 + (footer.fontSize * face.ascent) / 2;
      draw(canvas, footer, text, baseline, config, face);
    }
  });
}
