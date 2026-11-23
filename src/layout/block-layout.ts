/**
 * Layout de bloco (CSS 2.1 §9.4.1 e §10.3.3 / §10.6.3).
 *
 * - largura: auto preenche o bloco contêiner; valores fixos respeitam
 *   box-sizing, min/max-width e margens auto (centralização);
 * - empilhamento vertical dos filhos com colapso de margens entre irmãos e
 *   entre pai e primeiro/último filho (CSS 2.1 §8.3.1, simplificado);
 * - altura: auto = altura do conteúdo; valores fixos e min/max-height.
 *
 * Todas as coordenadas são absolutas no "espaço contínuo": x a partir da
 * borda esquerda da área útil da página e y a partir do topo da área útil
 * da primeira página, como se o documento fosse uma única faixa infinita.
 * A paginação acontece depois, sobre essa geometria.
 */

import { resolveBoxEdges, resolve, px, isAuto, collapseMargins, clampWidth, clampHeight, ZERO_EDGES } from './box-model.ts';
import { layoutInline, inlineIntrinsicSizes } from './inline-layout.ts';
import { measureText } from '../fonts/text-measurement.ts';
import type { FontManager } from '../fonts/font-manager.ts';
import type { BlockLayoutOptions, Box, BoxEdges, IntrinsicSizes, LayoutContext, LineBox, PlacedMarker } from './types.ts';

function canAbsorbTop(box: Box): boolean {
  return box.kind === 'block' && !box.isRoot && box.children.length > 0 && !box.style['border-top-width'] && px(box.style['padding-top']) === 0;
}

function canAbsorbBottom(box: Box): boolean {
  return (
    box.kind === 'block' &&
    !box.isRoot &&
    box.children.length > 0 &&
    isAuto(box.style.height) &&
    !box.style['border-bottom-width'] &&
    px(box.style['padding-bottom']) === 0
  );
}

/** Margem superior efetiva após colapso com o primeiro filho. */
export function effectiveMarginTop(box: Box, cbWidth: number): number {
  if (box.effTop !== undefined) return box.effTop;
  let m = box.kind === 'cell' || box.kind === 'anonymous' ? 0 : px(box.style['margin-top'], cbWidth);
  const first = box.children[0];
  if (canAbsorbTop(box) && first) {
    first.topAbsorbed = true;
    m = collapseMargins(m, effectiveMarginTop(first, cbWidth));
  }
  box.effTop = m;
  return m;
}

/** Margem inferior efetiva após colapso com o último filho. */
export function effectiveMarginBottom(box: Box, cbWidth: number): number {
  if (box.effBottom !== undefined) return box.effBottom;
  let m = box.kind === 'cell' || box.kind === 'anonymous' ? 0 : px(box.style['margin-bottom'], cbWidth);
  const last = box.children[box.children.length - 1];
  if (canAbsorbBottom(box) && last) {
    last.bottomAbsorbed = true;
    m = collapseMargins(m, effectiveMarginBottom(last, cbWidth));
  }
  box.effBottom = m;
  return m;
}

/** Calcula largura da caixa de borda e margem esquerda usada. */
function resolveWidth(box: Box, edges: BoxEdges, cbWidth: number, forcedWidth: number | undefined): { borderBoxWidth: number; ml: number } {
  const { margin, padding, border } = edges;
  const style = box.style;
  const extra = padding.left + padding.right + border.left + border.right;
  if (forcedWidth !== undefined) return { borderBoxWidth: forcedWidth, ml: 0 };

  const autoML = isAuto(style['margin-left']);
  const autoMR = isAuto(style['margin-right']);
  let ml = margin.left;
  const mr = margin.right;
  let contentWidth: number;
  if (isAuto(style.width) || box.kind === 'anonymous') {
    contentWidth = Math.max(0, cbWidth - ml - mr - extra);
    const clamped = clampWidth(contentWidth, style, cbWidth, extra);
    if (clamped !== contentWidth) {
      contentWidth = clamped;
      const free = cbWidth - contentWidth - extra;
      if (autoML && autoMR) ml = free / 2;
      else if (autoML) ml = free - mr;
    }
  } else {
    let w = resolve(style.width, cbWidth, 0);
    if (style['box-sizing'] === 'border-box') w = Math.max(0, w - extra);
    contentWidth = clampWidth(w, style, cbWidth, extra);
    const free = cbWidth - contentWidth - extra;
    if (autoML && autoMR) ml = Math.max(0, free / 2);
    else if (autoML) ml = free - mr;
  }
  return { borderBoxWidth: contentWidth + extra, ml };
}

/** Primeira linha de texto dentro da caixa (para posicionar marcadores de lista). */
export function firstLine(box: Box): LineBox | null {
  if (box.lines && box.lines.length) return box.lines[0]!;
  for (const c of box.children) {
    if (c.kind === 'table') return null;
    const l = firstLine(c);
    if (l) return l;
  }
  return null;
}

function placeMarker(box: Box, fonts: FontManager): void {
  const spec = box.marker;
  const line = firstLine(box);
  if (!spec || !line) return;
  const st = spec.style;
  const fs = st['font-size'];
  const m: PlacedMarker = { ...spec, baseline: line.baseline, color: st.color };
  if (spec.text) {
    const face = fonts.resolve(st);
    const text = spec.text + ' ';
    m.face = face;
    m.fontSize = fs;
    m.text = text;
    m.x = box.contentX - measureText(text, face, fs);
  } else {
    // Forma geométrica com diâmetro ~0,33em, centralizada na altura-x.
    m.size = fs * 0.33;
    m.cx = box.contentX - fs * 0.72;
    m.cy = line.baseline - fs * 0.27;
  }
  (line.markers ??= []).push(m);
}

/**
 * Layout de uma caixa de bloco.
 * @param cbX      x da área de conteúdo do bloco contêiner
 * @param y        y da borda superior desta caixa (margem já aplicada)
 * @param cbWidth  largura do bloco contêiner
 */
export function layoutBlockBox(box: Box, cbX: number, y: number, cbWidth: number, ctx: LayoutContext, opts: BlockLayoutOptions = {}): Box {
  ctx.checkDeadline?.('layout');
  if (box.kind === 'table') return ctx.layoutTable(box, cbX, y, cbWidth, ctx);

  // Marca filhos cujas margens colapsam com as desta caixa (resultado em cache).
  effectiveMarginTop(box, cbWidth);
  effectiveMarginBottom(box, cbWidth);

  const edges = resolveBoxEdges(box.style, cbWidth);
  if (box.kind === 'anonymous') {
    edges.margin = { ...ZERO_EDGES };
    edges.padding = { ...ZERO_EDGES };
    edges.border = { ...ZERO_EDGES };
  }
  if (opts.borderOverride) Object.assign(edges.border, opts.borderOverride);
  const { borderBoxWidth, ml } = resolveWidth(box, edges, cbWidth, opts.forcedWidth);
  const { padding, border } = edges;

  box.edges = edges;
  box.x = cbX + ml;
  box.y = y;
  box.width = borderBoxWidth;
  box.contentX = box.x + border.left + padding.left;
  box.contentY = y + border.top + padding.top;
  box.contentWidth = Math.max(0, borderBoxWidth - border.left - border.right - padding.left - padding.right);

  let contentHeight = 0;
  if (box.inline) {
    const r = layoutInline(box.inline, { style: box.style, x: box.contentX, y: box.contentY, width: box.contentWidth }, ctx.fonts);
    box.lines = r.lines;
    contentHeight = r.height;
  } else {
    let cursor = box.contentY;
    let prevBottom: number | null = null;
    const cw = box.contentWidth;
    box.children.forEach((child, i) => {
      const mt = child.topAbsorbed && i === 0 ? 0 : effectiveMarginTop(child, cw);
      const gap = prevBottom === null ? mt : collapseMargins(prevBottom, mt);
      layoutBlockBox(child, box.contentX, cursor + gap, cw, ctx);
      cursor = child.y + child.height;
      prevBottom = effectiveMarginBottom(child, cw);
    });
    const last = box.children[box.children.length - 1];
    if (prevBottom !== null && last && !last.bottomAbsorbed) cursor += prevBottom;
    contentHeight = cursor - box.contentY;
  }

  const extraV = padding.top + padding.bottom + border.top + border.bottom;
  if (typeof box.style.height === 'number') {
    let h = box.style.height;
    if (box.style['box-sizing'] === 'border-box') h = Math.max(0, h - extraV);
    contentHeight = h;
  }
  contentHeight = clampHeight(contentHeight, box.style, extraV);
  box.contentHeight = contentHeight;
  box.height = contentHeight + extraV;

  if (box.marker) placeMarker(box, ctx.fonts);
  return box;
}

/** Desloca uma subárvore já posicionada. */
export function translateBox(box: Box, dx: number, dy: number): void {
  box.x += dx;
  box.y += dy;
  box.contentX += dx;
  box.contentY += dy;
  box.frameY += dy;
  if (box.lines) {
    for (const l of box.lines) {
      l.x += dx;
      l.y += dy;
      l.baseline += dy;
      for (const f of l.fragments) f.x += dx;
      for (const m of l.markers ?? []) {
        m.baseline += dy;
        if (m.x !== undefined) m.x += dx;
        if (m.cx !== undefined) m.cx += dx;
        if (m.cy !== undefined) m.cy += dy;
      }
    }
  }
  for (const c of box.children) translateBox(c, dx, dy);
}

/** Larguras intrínsecas (min-content / max-content) da caixa de borda. */
export function intrinsicSizes(box: Box, ctx: LayoutContext): IntrinsicSizes {
  if (box.intrinsic) return box.intrinsic;
  if (box.kind === 'table') return (box.intrinsic = ctx.tableIntrinsic(box, ctx));
  const st = box.style;
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const extra =
    box.kind === 'anonymous'
      ? 0
      : num(st['padding-left']) + num(st['padding-right']) + (st['border-left-width'] || 0) + (st['border-right-width'] || 0);
  let min = 0;
  let max = 0;
  if (box.inline) {
    ({ min, max } = inlineIntrinsicSizes(box.inline, ctx.fonts, num(st['text-indent'])));
  } else {
    for (const c of box.children) {
      const r = intrinsicSizes(c, ctx);
      const cm = c.kind === 'anonymous' ? 0 : num(c.style['margin-left']) + num(c.style['margin-right']);
      min = Math.max(min, r.min + cm);
      max = Math.max(max, r.max + cm);
    }
  }
  if (typeof st.width === 'number' && box.kind !== 'anonymous') {
    const w = st['box-sizing'] === 'border-box' ? Math.max(0, st.width - extra) : st.width;
    min = Math.max(min, w);
    max = Math.max(w, min);
  }
  return (box.intrinsic = { min: min + extra, max: max + extra });
}
