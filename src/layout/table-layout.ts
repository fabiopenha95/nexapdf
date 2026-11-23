/**
 * Layout de tabelas (CSS 2.1 §17), algoritmo automático simplificado:
 *
 *  1. larguras intrínsecas (mín./máx.) por coluna a partir das células;
 *     células com colspan distribuem o déficit igualmente entre as colunas;
 *  2. largura da tabela: especificada (caixa de borda) ou "shrink-to-fit";
 *  3. colunas com largura percentual são atendidas primeiro; o restante é
 *     interpolado entre mín. e máx. (como nos navegadores);
 *  4. linhas têm a altura da maior célula; células são esticadas e o
 *     conteúdo alinhado por vertical-align (top | middle | bottom).
 *
 * border-collapse: collapse é aproximado removendo a borda esquerda das
 * células que não estão na primeira coluna e a superior das que não estão
 * na primeira linha, o que evita bordas duplicadas entre células.
 *
 * Limitações (Fase 1): rowspan, table-layout: fixed (tratado como auto),
 * <col>/<colgroup> e caption-side: bottom ainda não são suportados.
 */

import { resolveBoxEdges, resolve, px, isAuto } from './box-model.ts';
import { intrinsicSizes, translateBox } from './block-layout.ts';
import type { ComputedStyle } from '../css/types.ts';
import type { Box, EdgeSizes, IntrinsicSizes, LayoutContext } from './types.ts';

interface ColumnSizes {
  ncols: number;
  min: number[];
  max: number[];
  pct: (number | null)[];
}

function rowsOf(table: Box): Box[] {
  const rows: Box[] = [];
  for (const g of table.children) if (g.kind === 'row-group') rows.push(...g.children);
  return rows;
}

function spacingOf(style: ComputedStyle): [number, number] {
  if (style['border-collapse'] === 'collapse') return [0, 0];
  const [h, v] = style['border-spacing'];
  return [typeof h === 'number' ? h : 0, typeof v === 'number' ? v : 0];
}

function columnSizes(table: Box, ctx: LayoutContext): ColumnSizes {
  const rows = rowsOf(table);
  let ncols = 0;
  for (const r of rows) ncols = Math.max(ncols, r.children.reduce((a, c) => a + c.colspan, 0));
  const min = new Array<number>(ncols).fill(0);
  const max = new Array<number>(ncols).fill(0);
  const pct = new Array<number | null>(ncols).fill(null);
  const spanned: { col: number; span: number; sz: IntrinsicSizes }[] = [];
  for (const r of rows) {
    let col = 0;
    for (const cell of r.children) {
      const sz = intrinsicSizes(cell, ctx);
      if (cell.colspan === 1) {
        min[col] = Math.max(min[col]!, sz.min);
        max[col] = Math.max(max[col]!, sz.max);
        const w = cell.style.width;
        if (typeof w === 'object') pct[col] = Math.max(pct[col] ?? 0, w.percent);
      } else {
        spanned.push({ col, span: cell.colspan, sz });
      }
      col += cell.colspan;
    }
  }
  const [h] = spacingOf(table.style);
  for (const { col, span, sz } of spanned) {
    const cols = Array.from({ length: span }, (_, k) => col + k).filter((k) => k < ncols);
    const inner = h * (cols.length - 1);
    const sMin = cols.reduce((a, k) => a + min[k]!, 0) + inner;
    const sMax = cols.reduce((a, k) => a + max[k]!, 0) + inner;
    if (sz.min > sMin) for (const k of cols) min[k]! += (sz.min - sMin) / cols.length;
    if (sz.max > sMax) for (const k of cols) max[k]! += (sz.max - sMax) / cols.length;
  }
  for (let k = 0; k < ncols; k++) max[k] = Math.max(max[k]!, min[k]!);
  return { ncols, min, max, pct };
}

function horizontalExtra(style: ComputedStyle): number {
  return px(style['padding-left']) + px(style['padding-right']) + (style['border-left-width'] || 0) + (style['border-right-width'] || 0);
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export function tableIntrinsic(table: Box, ctx: LayoutContext): IntrinsicSizes {
  const { ncols, min, max } = columnSizes(table, ctx);
  const [h] = spacingOf(table.style);
  const extra = horizontalExtra(table.style) + h * (ncols + 1);
  let mn = sum(min) + extra;
  let mx = sum(max) + extra;
  if (typeof table.style.width === 'number') {
    mn = Math.max(mn, table.style.width);
    mx = mn;
  }
  return { min: mn, max: mx };
}

function distribute(contentCols: number, sizes: ColumnSizes): number[] {
  const { ncols, min, max, pct } = sizes;
  const widths = new Array<number>(ncols).fill(0);
  let assigned = 0;
  for (let k = 0; k < ncols; k++) {
    const p = pct[k];
    if (p !== null && p !== undefined) {
      widths[k] = Math.max(min[k]!, (p / 100) * contentCols);
      assigned += widths[k]!;
    }
  }
  const free = Array.from({ length: ncols }, (_, k) => k).filter((k) => pct[k] === null);
  const rest = contentCols - assigned;
  const rMin = free.reduce((a, k) => a + min[k]!, 0);
  const rMax = free.reduce((a, k) => a + max[k]!, 0);
  for (const k of free) {
    const mn = min[k]!;
    const mx = max[k]!;
    if (rest <= rMin) widths[k] = mn;
    else if (rest <= rMax) widths[k] = mn + (mx - mn) * ((rest - rMin) / (rMax - rMin || 1));
    else widths[k] = rMax > 0 ? mx + (rest - rMax) * (mx / rMax) : rest / free.length;
  }
  if (free.length === 0 && assigned > 0 && assigned < contentCols) {
    const f = contentCols / assigned;
    for (let k = 0; k < ncols; k++) widths[k]! *= f;
  }
  return widths;
}

/** Desloca apenas o conteúdo (linhas e filhos) de uma célula. */
function shiftContent(cell: Box, dy: number): void {
  for (const l of cell.lines ?? []) {
    l.y += dy;
    l.baseline += dy;
    for (const m of l.markers ?? []) {
      m.baseline += dy;
      if (m.cy !== undefined) m.cy += dy;
    }
  }
  for (const c of cell.children) translateBox(c, 0, dy);
}

export function layoutTable(table: Box, cbX: number, y: number, cbWidth: number, ctx: LayoutContext): Box {
  const style = table.style;
  const edges = resolveBoxEdges(style, cbWidth);
  table.edges = edges;
  const { margin, padding, border } = edges;
  const [h, v] = spacingOf(style);
  const collapse = style['border-collapse'] === 'collapse';
  const sizes = columnSizes(table, ctx);
  const { ncols } = sizes;
  const extraT = padding.left + padding.right + border.left + border.right;
  const spacingTotal = h * (ncols + 1);
  const sumMin = sum(sizes.min) + spacingTotal;
  const sumMax = sum(sizes.max) + spacingTotal;

  let contentW: number;
  if (!isAuto(style.width)) {
    contentW = Math.max(resolve(style.width, cbWidth, 0) - extraT, sumMin);
  } else {
    const avail = cbWidth - margin.left - margin.right - extraT;
    contentW = Math.max(sumMin, Math.min(avail, sumMax));
  }
  const widths = distribute(Math.max(0, contentW - spacingTotal), sizes);

  const borderBoxW = contentW + extraT;
  let ml = margin.left;
  if (isAuto(style['margin-left']) && isAuto(style['margin-right'])) ml = Math.max(0, (cbWidth - borderBoxW) / 2);
  else if (isAuto(style['margin-left'])) ml = cbWidth - borderBoxW - margin.right;

  table.x = cbX + ml;
  table.y = y;
  table.width = borderBoxW;

  // Legenda acima da tabela.
  let cursorTop = y;
  if (table.caption) {
    ctx.layoutBlock(table.caption, table.x, y, borderBoxW, ctx, { forcedWidth: borderBoxW });
    cursorTop = table.caption.y + table.caption.height;
  }
  table.frameY = cursorTop;
  table.contentX = table.x + border.left + padding.left;
  table.contentY = cursorTop + border.top + padding.top;
  table.contentWidth = contentW;

  let cursor = table.contentY + v;
  let rowIndex = 0;
  for (const group of table.children) {
    if (group.kind !== 'row-group') continue;
    group.x = table.contentX;
    group.y = cursor;
    group.width = contentW;
    for (const row of group.children) {
      ctx.checkDeadline?.('layout');
      let x = table.contentX + h;
      let col = 0;
      let rowH = typeof row.style.height === 'number' ? row.style.height : 0;
      for (const cell of row.children) {
        const span = Math.min(cell.colspan, ncols - col);
        const w = sum(widths.slice(col, col + span)) + h * (span - 1);
        const override: Partial<EdgeSizes> = {};
        if (collapse) {
          if (col > 0) override.left = 0;
          if (rowIndex > 0) override.top = 0;
        }
        ctx.layoutBlock(cell, x, cursor, w, ctx, { forcedWidth: w, borderOverride: override });
        rowH = Math.max(rowH, cell.height);
        x += w + h;
        col += span;
      }
      for (const cell of row.children) {
        const diff = rowH - cell.height;
        if (diff > 0) {
          const va = cell.style['vertical-align'];
          const dy = va === 'middle' ? diff / 2 : va === 'bottom' ? diff : 0;
          if (dy) shiftContent(cell, dy);
          cell.height = rowH;
          cell.contentHeight += diff;
        }
      }
      row.x = table.contentX + h;
      row.y = cursor;
      row.width = contentW - 2 * h;
      row.height = rowH;
      cursor += rowH + v;
      rowIndex++;
    }
    group.height = cursor - group.y;
  }
  let contentH = rowIndex === 0 ? 0 : cursor - table.contentY;
  const extraV = padding.top + padding.bottom + border.top + border.bottom;
  if (typeof style.height === 'number') contentH = Math.max(contentH, style.height - extraV);
  table.contentHeight = contentH;
  table.frameHeight = contentH + extraV;
  table.height = table.frameY - y + table.frameHeight;
  return table;
}
