/**
 * Fragmentação: identifica, na árvore já posicionada, as unidades que a
 * paginação pode mover entre páginas.
 *
 * Folhas (leaves) são os menores itens indivisíveis no fluxo:
 *   - cada linha de texto ('line');
 *   - caixas sem nenhuma linha dentro ('box'), como divs vazias com altura, <hr>.
 *
 * Restrições de quebra viram "faixas" (ranges) de folhas que devem ficar
 * juntas, e quebras forçadas viram marcações nas folhas:
 *   break-inside: avoid      → faixa com todas as folhas da caixa
 *   break-after: avoid       → última folha da caixa + próxima folha
 *   break-before: avoid      → folha anterior + primeira folha da caixa
 *   orphans / widows         → primeiras N / últimas N linhas do parágrafo
 *   linhas de tabela         → indivisíveis (salvo se maiores que a página)
 *   thead                    → mantido junto com a primeira linha do corpo
 *   break-before/after: page → quebra forçada
 */

import type { Box, LineBox } from '../layout/types.ts';

const FORCED: ReadonlySet<string> = new Set(['page', 'left', 'right', 'recto', 'verso', 'always']);
const AVOID: ReadonlySet<string> = new Set(['avoid', 'avoid-page']);

export interface Leaf {
  kind: 'line' | 'box';
  line?: LineBox;
  owner: Box;
  top: number;
  bottom: number;
  /** Deslocamento vertical atribuído pela paginação. */
  delta: number;
  forceBreak?: boolean;
  /** Margem preservada após quebra forçada (CSS Fragmentation §5.2). */
  forceMargin?: number;
  table?: Box;
  tableHeader?: boolean;
}

export interface KeepRange {
  start: number;
  end: number;
  atomic?: boolean;
}

export interface FragmentationUnit {
  start: number;
  end: number;
  top: number;
  bottom: number;
  atomic: boolean;
  forceBreak: boolean;
  forceMargin: number;
  table: Box | null;
  hasHeader: boolean;
}

export function collectLeaves(root: Box | null): { leaves: Leaf[]; ranges: KeepRange[]; boxes: Box[] } {
  const leaves: Leaf[] = [];
  const ranges: KeepRange[] = [];
  let pendingForce = false;
  let pendingForceMargin = 0;
  const boxes: Box[] = [];

  const pushLeaf = (leaf: Leaf): void => {
    if (pendingForce) {
      leaf.forceBreak = true;
      leaf.forceMargin = pendingForceMargin;
      pendingForce = false;
      pendingForceMargin = 0;
    }
    leaves.push(leaf);
  };

  function visitTable(box: Box): void {
    const header = box.children.find((g) => g.kind === 'row-group' && g.group === 'header');
    box.headerGroup = header && header.children.length ? header : null;
    let headerRange: { start: number; end?: number } | null = null;
    for (const child of box.children) {
      if (child.kind !== 'row-group') {
        visit(child);
        continue;
      }
      const gStart = leaves.length;
      for (const row of child.children) {
        const rStart = leaves.length;
        for (const cell of row.children) visit(cell);
        if (leaves.length === rStart) visit(row);
        row.firstLeaf = rStart;
        row.lastLeaf = leaves.length - 1;
        ranges.push({ start: rStart, end: leaves.length - 1, atomic: true });
        for (let k = rStart; k < leaves.length; k++) {
          const leaf = leaves[k]!;
          leaf.table = box;
          leaf.tableHeader = child === box.headerGroup;
        }
        boxes.push(row);
        if (headerRange && headerRange.end === undefined && child !== box.headerGroup) headerRange.end = leaves.length - 1;
      }
      child.firstLeaf = gStart;
      child.lastLeaf = leaves.length - 1;
      if (child === box.headerGroup && leaves.length > gStart) headerRange = { start: gStart };
      if (leaves.length > gStart) boxes.push(child);
    }
    if (headerRange && headerRange.end !== undefined) ranges.push({ start: headerRange.start, end: headerRange.end });
  }

  function visit(box: Box): void {
    const start = leaves.length;
    const st = box.style;
    const breakBefore = st['break-before'];
    const breakAfter = st['break-after'];
    if (FORCED.has(breakBefore) && box.kind !== 'anonymous' && leaves.length > 0) {
      pendingForce = true;
      pendingForceMargin = Math.max(pendingForceMargin, box.effTop ?? 0);
    }

    if (box.kind === 'table') {
      visitTable(box);
    } else if (box.lines && box.lines.length) {
      const n = box.lines.length;
      for (const line of box.lines) {
        pushLeaf({ kind: 'line', line, top: line.y, bottom: line.y + line.height, owner: box, delta: 0 });
      }
      const orphans = Math.min(st.orphans ?? 2, n);
      const widows = Math.min(st.widows ?? 2, n);
      if (orphans > 1) ranges.push({ start, end: start + orphans - 1 });
      if (widows > 1) ranges.push({ start: start + n - widows, end: start + n - 1 });
    } else {
      for (const child of box.children) visit(child);
    }

    if (leaves.length === start) {
      pushLeaf({ kind: 'box', top: box.y, bottom: box.y + box.height, owner: box, delta: 0 });
    }
    box.firstLeaf = start;
    box.lastLeaf = leaves.length - 1;
    boxes.push(box);

    if (box.kind !== 'anonymous') {
      if (AVOID.has(st['break-inside']) && leaves.length - start > 1) ranges.push({ start, end: leaves.length - 1 });
      if (AVOID.has(breakBefore) && start > 0) ranges.push({ start: start - 1, end: start });
      if (AVOID.has(breakAfter)) ranges.push({ start: leaves.length - 1, end: leaves.length });
      if (FORCED.has(breakAfter)) pendingForce = true;
    }
  }

  if (root) visit(root);

  // Faixas que apontam além da última folha são descartadas.
  const valid = ranges.filter((r) => r.end < leaves.length && r.start >= 0 && r.end > r.start);

  // Bordas/preenchimentos de abertura e fechamento acompanham a primeira e a
  // última folha, para que não fiquem isolados em outra página.
  for (const box of boxes) {
    if (box.firstLeaf < 0 || box.firstLeaf > box.lastLeaf || !box.edges) continue;
    const e = box.edges;
    const first = leaves[box.firstLeaf]!;
    const last = leaves[box.lastLeaf]!;
    // Tabelas: a moldura (incluindo border-spacing e legenda) sempre acompanha.
    const isTable = box.kind === 'table';
    const top = box.y;
    if ((isTable || first.top - top <= e.border.top + e.padding.top + 0.5) && top < first.top) first.top = top;
    const bottom = box.y + box.height;
    if ((isTable || bottom - last.bottom <= e.border.bottom + e.padding.bottom + 0.5) && bottom > last.bottom) last.bottom = bottom;
  }

  return { leaves, ranges: valid, boxes };
}

function makeUnit(leaves: readonly Pick<Leaf, 'top' | 'bottom' | 'forceBreak' | 'forceMargin' | 'table' | 'tableHeader'>[], start: number, end: number, atomic: boolean): FragmentationUnit {
  let top = Infinity;
  let bottom = -Infinity;
  let hasHeader = false;
  for (let k = start; k <= end; k++) {
    const l = leaves[k]!;
    top = Math.min(top, l.top);
    bottom = Math.max(bottom, l.bottom);
    if (l.tableHeader) hasHeader = true;
  }
  const first = leaves[start]!;
  return {
    start,
    end,
    top,
    bottom,
    atomic,
    forceBreak: !!first.forceBreak,
    forceMargin: first.forceMargin ?? 0,
    table: first.table ?? null,
    hasHeader,
  };
}

/** Agrupa folhas em unidades de paginação a partir das faixas. */
export function buildUnits(
  leaves: readonly Pick<Leaf, 'top' | 'bottom' | 'forceBreak' | 'forceMargin' | 'table' | 'tableHeader'>[],
  ranges: readonly KeepRange[],
): FragmentationUnit[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: KeepRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      last.atomic = last.atomic || r.atomic;
    } else {
      merged.push({ ...r });
    }
  }
  const units: FragmentationUnit[] = [];
  let i = 0;
  let m = 0;
  while (i < leaves.length) {
    while (m < merged.length && merged[m]!.end < i) m++;
    let end = i;
    let atomic = false;
    const range = merged[m];
    if (range && range.start <= i) {
      end = range.end;
      atomic = !!range.atomic;
    }
    // Quebras forçadas dividem a unidade.
    let cut = end;
    for (let k = i + 1; k <= end; k++) {
      if (leaves[k]!.forceBreak) {
        cut = k - 1;
        break;
      }
    }
    units.push(makeUnit(leaves, i, cut, atomic));
    i = cut + 1;
  }
  return units;
}
