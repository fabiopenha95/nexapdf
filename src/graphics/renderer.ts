/**
 * Renderizador: converte a árvore paginada em listas de exibição por página.
 *
 * Para cada caixa, calcula os fragmentos verticais (uma caixa que atravessa
 * páginas gera um fragmento por página; a borda superior só aparece no
 * primeiro e a inferior só no último — box-decoration-break: slice).
 * Linhas de texto são desenhadas na página da sua folha.
 */

import { Canvas } from './canvas.ts';
import { drawBorders } from './borders.ts';
import type { Rect } from './borders.ts';
import { isTransparent } from './colors.ts';
import { boxDeltas } from '../pagination/pagination-engine.ts';
import type { PaginationResult } from '../pagination/pagination-engine.ts';
import type { Box, EdgeSizes, LineBox } from '../layout/types.ts';
import type { ComputedStyle } from '../css/types.ts';
import type { ResolvedMargins } from '../core/options.ts';

const EPS = 0.01;
const NO_BORDERS: EdgeSizes = { top: 0, right: 0, bottom: 0, left: 0 };

export interface PageGeometry {
  width: number;
  height: number;
  margin: ResolvedMargins;
}

export function renderPages(root: Box | null, pagination: PaginationResult, page: PageGeometry): Canvas[] {
  const { leaves, repeats, pageCount, pageContentHeight: H } = pagination;
  const canvases = Array.from({ length: pageCount }, () => new Canvas(page.width, page.height));
  const ox = page.margin.left;
  const oy = page.margin.top;
  const rowDeltaCache = new Map<Box, [number, number]>();

  const pageOf = (y: number): number => Math.min(pageCount - 1, Math.max(0, Math.floor((y + EPS) / H)));
  const toPage = (y: number, p: number): number => y - p * H + oy;
  const canvasAt = (p: number): Canvas => canvases[p]!;

  /** Desenha uma caixa vertical [top, bottom) fatiada pelas páginas. */
  function paintFragments(x: number, width: number, top: number, bottom: number, widths: EdgeSizes, decorate: (c: Canvas, r: Rect, w: EdgeSizes) => void): void {
    if (bottom - top <= EPS && !widths.top && !widths.bottom) return;
    const p0 = pageOf(top);
    const p1 = Math.max(p0, pageOf(bottom - EPS));
    for (let p = p0; p <= p1; p++) {
      const segTop = Math.max(top, p * H);
      const segBottom = Math.min(bottom, (p + 1) * H);
      const rect: Rect = { x: x + ox, y: toPage(segTop, p), w: width, h: Math.max(0, segBottom - segTop) };
      const w: EdgeSizes = { ...widths, top: p === p0 ? widths.top : 0, bottom: p === p1 ? widths.bottom : 0 };
      decorate(canvasAt(p), rect, w);
    }
  }

  function paintBackgroundAndBorders(x: number, width: number, top: number, bottom: number, style: ComputedStyle, borders: EdgeSizes): void {
    paintFragments(x, width, top, bottom, borders, (canvas, rect, w) => {
      canvas.fillRect(rect.x, rect.y, rect.w, rect.h, style['background-color']);
      drawBorders(canvas, rect, w, style);
    });
  }

  function paintLine(line: LineBox, delta: number, forcedPage: number | null): void {
    const p = forcedPage ?? pageOf(line.y + delta);
    const canvas = canvasAt(p);
    const baseline = toPage(line.baseline + delta, p);
    for (const f of line.fragments) {
      if (f.hidden) continue;
      const st = f.style;
      const fs = st['font-size'];
      const face = f.face;
      if (f.bg && !isTransparent(f.bg)) {
        canvas.fillRect(f.x + ox, baseline - face.ascent * fs, f.width, (face.ascent + face.descent) * fs, f.bg);
      }
      if (f.text) canvas.text(f.x + ox, baseline, f.text, face, fs, st.color, st['letter-spacing'] || 0);
      for (const d of st.textDecorations) {
        const thickness = Math.max(0.5, face.metrics.underlineThickness * fs);
        let yLine: number;
        if (d.line === 'underline') yLine = baseline - face.metrics.underlinePosition * fs;
        else if (d.line === 'line-through') yLine = baseline - face.metrics.xHeight * fs * 0.5;
        else yLine = baseline - face.ascent * fs;
        canvas.strokeLine(f.x + ox, yLine, f.x + ox + f.width, yLine, thickness, d.color);
      }
    }
    for (const m of line.markers ?? []) {
      if (m.text && m.face && m.fontSize !== undefined && m.x !== undefined) {
        canvas.text(m.x + ox, toPage(m.baseline + delta, p), m.text, m.face, m.fontSize, m.color);
      } else if (m.cx !== undefined && m.cy !== undefined && m.size !== undefined) {
        const cx = m.cx + ox;
        const cy = toPage(m.cy + delta, p);
        const r = m.size / 2;
        if (m.shape === 'square') canvas.fillRect(cx - r, cy - r, m.size, m.size, m.color);
        else canvas.circle(cx, cy, m.shape === 'circle' ? r - 0.4 : r, m.color, m.shape !== 'circle', 0.8);
      }
    }
  }

  /** Intervalo de deslocamentos de uma linha de tabela (folhas intercaladas). */
  function rowDeltas(row: Box): [number, number] {
    let cached = rowDeltaCache.get(row);
    if (!cached) {
      let min = Infinity;
      let max = -Infinity;
      for (let k = row.firstLeaf; k <= row.lastLeaf; k++) {
        const d = leaves[k]?.delta ?? 0;
        if (d < min) min = d;
        if (d > max) max = d;
      }
      cached = Number.isFinite(min) ? [min, max] : [0, 0];
      rowDeltaCache.set(row, cached);
    }
    return cached;
  }

  /**
   * Pinta uma caixa e seus descendentes.
   * @param fixedDelta  deslocamento fixo (cabeçalhos repetidos)
   * @param fixedPage   página fixa (cabeçalhos repetidos)
   */
  function paint(box: Box, fixedDelta: number | null = null, fixedPage: number | null = null, parent: Box | null = null): void {
    if (box.style.visibility === 'hidden' && box.kind !== 'anonymous') {
      // Caixas ocultas ainda podem ter descendentes visíveis.
      paintChildren(box, fixedDelta, fixedPage);
      return;
    }
    let [dTop, dBottom] = fixedDelta !== null ? [fixedDelta, fixedDelta] : boxDeltas(box, leaves);
    // Linhas e células usam o intervalo de deslocamentos da linha inteira,
    // pois as folhas das células se intercalam quando a linha é dividida.
    if (fixedDelta === null && box.kind === 'row') [dTop, dBottom] = rowDeltas(box);
    if (fixedDelta === null && box.kind === 'cell' && parent?.kind === 'row') [dTop, dBottom] = rowDeltas(parent);

    if (box.kind === 'table') {
      if (box.edges) {
        paintBackgroundAndBorders(box.x, box.width, box.frameY + dTop, box.frameY + box.frameHeight + dBottom, box.style, box.edges.border);
      }
    } else if (box.kind === 'row') {
      const bg = box.style['background-color'];
      if (!isTransparent(bg)) {
        paintFragments(box.x, box.width, box.y + dTop, box.y + box.height + dBottom, NO_BORDERS, (c, rect) => c.fillRect(rect.x, rect.y, rect.w, rect.h, bg));
      }
    } else if (box.kind !== 'anonymous' && box.kind !== 'row-group' && box.edges) {
      if (fixedPage !== null) {
        const rect: Rect = { x: box.x + ox, y: toPage(box.y + dTop, fixedPage), w: box.width, h: box.height };
        const canvas = canvasAt(fixedPage);
        canvas.fillRect(rect.x, rect.y, rect.w, rect.h, box.style['background-color']);
        drawBorders(canvas, rect, box.edges.border, box.style);
      } else {
        paintBackgroundAndBorders(box.x, box.width, box.y + dTop, box.y + box.height + dBottom, box.style, box.edges.border);
      }
    }

    if (box.lines) {
      box.lines.forEach((line, i) => {
        const leaf = leaves[box.firstLeaf + i];
        const delta = fixedDelta !== null ? fixedDelta : leaf?.line === line ? leaf.delta : dTop;
        paintLine(line, delta, fixedPage);
      });
    }
    paintChildren(box, fixedDelta, fixedPage);
  }

  function paintChildren(box: Box, fixedDelta: number | null, fixedPage: number | null): void {
    for (const child of box.children) paint(child, fixedDelta, fixedPage, box);
  }

  if (root) paint(root);

  // Cabeçalhos de tabela repetidos.
  for (const { table, page: p } of repeats) {
    const group = table.headerGroup;
    if (group) paint(group, p * H - group.y, p);
  }

  return canvases;
}
