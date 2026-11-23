/**
 * Motor de paginação.
 *
 * Não corta o documento em pixels: percorre as unidades de fragmentação em
 * ordem e, quando uma unidade não cabe no espaço restante da página, empurra
 * essa unidade (e, por consequência, todo o conteúdo seguinte) para o topo da
 * próxima página, acumulando um deslocamento vertical ("delta").
 *
 * Como os deslocamentos só crescem, o conteúdo nunca se sobrepõe, e cada
 * folha termina inteiramente dentro de uma página, salvo quando ela própria é
 * maior que a página (nesse caso ela é posicionada sem quebra e o excedente
 * transborda, comportamento documentado).
 *
 * Também implementa:
 *  - quebras forçadas (break-before/after: page);
 *  - repetição do <thead> no topo de cada página em que a tabela continua;
 *  - limite máximo de páginas.
 */

import { collectLeaves, buildUnits } from './fragmentation.ts';
import type { FragmentationUnit, Leaf } from './fragmentation.ts';
import { LimitExceededError } from '../core/errors.ts';
import type { Box } from '../layout/types.ts';

const EPS = 0.01;

export interface PaginateOptions {
  /** Altura da área útil de cada página, em pontos. */
  pageContentHeight: number;
  maxPages?: number;
  checkDeadline?: (stage: 'pagination') => void;
}

/** Cabeçalho de tabela que deve ser redesenhado no topo de uma página. */
export interface HeaderRepeat {
  table: Box;
  page: number;
}

export interface PaginationResult {
  leaves: Leaf[];
  units: FragmentationUnit[];
  repeats: HeaderRepeat[];
  pageCount: number;
  pageContentHeight: number;
}

export function paginate(root: Box | null, { pageContentHeight, maxPages = Infinity, checkDeadline }: PaginateOptions): PaginationResult {
  const H = pageContentHeight;
  const { leaves, ranges } = collectLeaves(root);
  const units = buildUnits(leaves, ranges);
  const repeats: HeaderRepeat[] = [];
  const tableLastPage = new Map<Box, number>();
  let delta = 0;
  let lastPage = -1;
  let maxBottom = 0;

  const pageOf = (y: number): number => Math.floor((y + EPS) / H);
  const ensureLimit = (page: number): void => {
    if (page + 1 > maxPages) throw new LimitExceededError('maxPages', page + 1, maxPages, 'pagination');
  };

  const place = (unit: FragmentationUnit): void => {
    checkDeadline?.('pagination');
    let top = unit.top + delta;
    let bottom = unit.bottom + delta;
    let page = pageOf(top);
    const height = unit.bottom - unit.top;

    if (unit.forceBreak && lastPage >= page && lastPage >= 0) {
      delta += (page + 1) * H - top + Math.min(unit.forceMargin, H / 4);
    } else if (bottom > (page + 1) * H + EPS && height <= H + EPS && top > page * H + EPS) {
      delta += (page + 1) * H - top;
    }
    top = unit.top + delta;
    bottom = unit.bottom + delta;
    page = pageOf(top);

    // Repetição do cabeçalho da tabela em páginas seguintes.
    const t = unit.table;
    const prevTablePage = t ? tableLastPage.get(t) : undefined;
    if (t && t.headerGroup && !unit.hasHeader && prevTablePage !== undefined && page > prevTablePage) {
      const need = page * H + t.headerGroup.height - top;
      if (need > 0) delta += need;
      repeats.push({ table: t, page });
      top = unit.top + delta;
      bottom = unit.bottom + delta;
      page = pageOf(top);
    }
    if (t) tableLastPage.set(t, pageOf(bottom - EPS));

    for (let k = unit.start; k <= unit.end; k++) leaves[k]!.delta = delta;
    lastPage = Math.max(lastPage, pageOf(bottom - EPS));
    maxBottom = Math.max(maxBottom, bottom);
    ensureLimit(lastPage);
  };

  for (const unit of units) {
    const height = unit.bottom - unit.top;
    if (height > H + EPS && unit.end > unit.start) {
      // Unidade maior que a página: as restrições são relaxadas e as folhas
      // são posicionadas individualmente, em ordem vertical (em linhas de
      // tabela, as folhas de células diferentes se intercalam).
      const order: number[] = [];
      for (let k = unit.start; k <= unit.end; k++) order.push(k);
      order.sort((a, b) => leaves[a]!.top - leaves[b]!.top || a - b);
      order.forEach((k, i) => {
        const leaf = leaves[k]!;
        place({ ...unit, start: k, end: k, top: leaf.top, bottom: leaf.bottom, forceBreak: i === 0 && unit.forceBreak, hasHeader: !!leaf.tableHeader });
      });
    } else {
      place(unit);
    }
  }

  const pageCount = Math.max(1, pageOf(Math.max(maxBottom, 0) - EPS) + 1);
  ensureLimit(pageCount - 1);
  return { leaves, units, repeats, pageCount, pageContentHeight: H };
}

/** Deslocamentos (topo, base) de uma caixa já paginada. */
export function boxDeltas(box: Box, leaves: readonly Leaf[]): [number, number] {
  const first = leaves[box.firstLeaf];
  const last = leaves[box.lastLeaf];
  if (box.firstLeaf < 0 || box.firstLeaf > box.lastLeaf || !first || !last) return [0, 0];
  return [first.delta, last.delta];
}
