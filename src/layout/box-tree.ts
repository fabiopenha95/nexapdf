/**
 * Geração da árvore de caixas (box tree) a partir do DOM + estilos computados.
 *
 * Tipos de caixa (kind):
 *   'block'      contêiner de bloco (div, p, li, body...)
 *   'anonymous'  bloco anônimo que embrulha conteúdo inline entre blocos
 *   'table'      tabela; filhos: [caption?] + grupos de linhas
 *   'row-group'  thead/tbody/tfoot (group: 'header' | 'body' | 'footer')
 *   'row'        tr; filhos: células
 *   'cell'       td/th (contêiner de bloco)
 *   'caption'    legenda da tabela (contêiner de bloco)
 *
 * Um contêiner de bloco tem `children` (caixas de bloco) OU `inline`
 * (itens inline que formam um contexto de formatação inline), nunca ambos:
 * conteúdo misto é separado em blocos anônimos (CSS 2.1 §9.2.1.1).
 *
 * Elementos inline não geram caixas próprias nesta fase: seu estilo é levado
 * pelos itens de texto (cor, fonte, decoração e fundo do inline mais próximo).
 */

import { NodeType } from '../html/dom-node.ts';
import type { DocumentNode, ElementNode } from '../html/dom-node.ts';
import { isTransparent } from '../graphics/colors.ts';
import type { Color } from '../graphics/colors.ts';
import type { ComputedStyle } from '../css/types.ts';
import { Box } from './types.ts';
import type { BoxKind, InlineItem, MarkerSpec } from './types.ts';

export { Box } from './types.ts';

const BLOCK_LEVEL: ReadonlySet<string> = new Set(['block', 'list-item', 'table', 'flex', 'table-caption']);
const UNSUPPORTED_AS_BLOCK: ReadonlySet<string> = new Set(['flex', 'table-column', 'table-column-group']);
const ROW_GROUPS: Readonly<Record<string, 'header' | 'body' | 'footer'>> = {
  'table-header-group': 'header',
  'table-row-group': 'body',
  'table-footer-group': 'footer',
};

function toRoman(n: number, upper: boolean): string {
  if (n <= 0 || n >= 4000) return String(n);
  const map: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return upper ? out.toUpperCase() : out;
}

function toAlpha(n: number, upper: boolean): string {
  if (n <= 0) return String(n);
  let out = '';
  while (n > 0) {
    n--;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return upper ? out.toUpperCase() : out;
}

/** Texto (ou forma) do marcador de lista. */
export function markerFor(type: string, index: number): Pick<MarkerSpec, 'shape' | 'text'> | null {
  switch (type) {
    case 'none': return null;
    case 'disc': return { shape: 'disc' };
    case 'circle': return { shape: 'circle' };
    case 'square': return { shape: 'square' };
    case 'decimal': return { text: `${index}.` };
    case 'decimal-leading-zero': return { text: `${index < 10 && index >= 0 ? '0' : ''}${index}.` };
    case 'lower-alpha':
    case 'lower-latin': return { text: `${toAlpha(index, false)}.` };
    case 'upper-alpha':
    case 'upper-latin': return { text: `${toAlpha(index, true)}.` };
    case 'lower-roman': return { text: `${toRoman(index, false)}.` };
    case 'upper-roman': return { text: `${toRoman(index, true)}.` };
    default: return { shape: 'disc' };
  }
}

export interface BoxTreeContext {
  warn(message: string): void;
}

interface ListCounter {
  next: number;
  step: number;
}

type PendingBlock = { inline: InlineItem[] } | { element: ElementNode; style: ComputedStyle };

export class BoxTreeBuilder {
  private readonly styles: Map<ElementNode, ComputedStyle>;
  private readonly ctx: BoxTreeContext;
  private readonly listCounters: ListCounter[] = [];

  constructor(styles: Map<ElementNode, ComputedStyle>, ctx: BoxTreeContext) {
    this.styles = styles;
    this.ctx = ctx;
  }

  build(document: DocumentNode): Box | null {
    const root = document.documentElement;
    if (!root) return null;
    return this.buildBlock(root, 'block');
  }

  private styleOf(el: ElementNode): ComputedStyle {
    const s = this.styles.get(el);
    if (!s) throw new Error(`Estilo computado ausente para <${el.tagName}>`);
    return s;
  }

  isBlockLevel(style: ComputedStyle): boolean {
    return BLOCK_LEVEL.has(style.display) || style.display.startsWith('table-') || UNSUPPORTED_AS_BLOCK.has(style.display);
  }

  /** Cria uma caixa de bloco para o elemento e processa seus filhos. */
  buildBlock(el: ElementNode, kind: BoxKind): Box {
    const style = this.styleOf(el);
    if (style.display === 'flex') this.ctx.warn('display: flex ainda não é suportado; tratado como bloco.');
    if (style.display === 'table') return this.buildTable(el, style);
    const box = new Box(kind, el, style);

    let pushedCounter = false;
    if (el.tagName === 'ol' || el.tagName === 'ul' || el.tagName === 'menu') {
      const start = parseInt(el.getAttribute('start') ?? '', 10);
      const reversed = el.hasAttribute('reversed');
      const count = el.elementChildren.filter((c) => c.tagName === 'li').length;
      this.listCounters.push({ next: Number.isFinite(start) ? start : reversed ? count : 1, step: reversed ? -1 : 1 });
      pushedCounter = true;
    }
    if (style.display === 'list-item') {
      const counter = this.listCounters[this.listCounters.length - 1] ?? { next: 1, step: 1 };
      const value = parseInt(el.getAttribute('value') ?? '', 10);
      if (Number.isFinite(value)) counter.next = value;
      const marker = markerFor(style['list-style-type'], counter.next);
      counter.next += counter.step;
      if (marker) box.marker = { ...marker, style, inside: style['list-style-position'] === 'inside' };
    }

    this.fillContainer(box, el);
    if (pushedCounter) this.listCounters.pop();
    return box;
  }

  /** Preenche um contêiner de bloco com filhos de bloco ou conteúdo inline. */
  fillContainer(box: Box, el: ElementNode): void {
    const blocks: PendingBlock[] = [];
    let run: InlineItem[] = [];
    const flush = (): void => {
      const meaningful = run.some(
        (item) => item.type !== 'text' || !/^[\t\n\f\r ]*$/.test(item.text) || /pre|break-spaces/.test(item.style['white-space']),
      );
      if (run.length && meaningful) blocks.push({ inline: run });
      run = [];
    };

    const visit = (node: ElementNode, bg: Color | null): void => {
      for (const child of node.children) {
        if (child.type === NodeType.TEXT) {
          const style = this.styleOf(node);
          if (style.visibility === 'hidden') run.push({ type: 'text', text: child.data, style, bg: null, hidden: true });
          else run.push({ type: 'text', text: child.data, style, bg });
          continue;
        }
        if (child.type !== NodeType.ELEMENT) continue;
        const cs = this.styles.get(child);
        if (!cs || cs.display === 'none') continue;
        if (child.tagName === 'br') {
          run.push({ type: 'br', style: cs });
          continue;
        }
        if (child.tagName === 'img') {
          this.ctx.warn('Imagens ainda não são suportadas na Fase 1; <img> ignorada.');
          const alt = child.getAttribute('alt');
          if (alt) run.push({ type: 'text', text: alt, style: cs, bg });
          continue;
        }
        if (this.isBlockLevel(cs)) {
          flush();
          blocks.push({ element: child, style: cs });
          continue;
        }
        // Inline (inclui inline-block, tratado como inline nesta fase).
        const childBg = !isTransparent(cs['background-color']) ? cs['background-color'] : bg;
        visit(child, childBg);
      }
    };
    visit(el, null);
    flush();

    const hasBlocks = blocks.some((b) => 'element' in b);
    if (!hasBlocks) {
      const first = blocks[0];
      box.inline = first && 'inline' in first ? first.inline : [];
      return;
    }
    for (const b of blocks) {
      if ('element' in b) {
        box.children.push(this.buildChild(b.element, b.style));
      } else {
        const anon = new Box('anonymous', null, box.style);
        anon.inline = b.inline;
        box.children.push(anon);
      }
    }
  }

  private buildChild(el: ElementNode, style: ComputedStyle): Box {
    if (style.display === 'table') return this.buildTable(el, style);
    // Legendas e partes de tabela fora de uma tabela são tratadas como blocos.
    return this.buildBlock(el, 'block');
  }

  private buildTable(el: ElementNode, style: ComputedStyle): Box {
    const table = new Box('table', el, style);
    const groups: Record<'header' | 'body' | 'footer', Box[]> = { header: [], body: [], footer: [] };
    let looseRows: Box | null = null;

    const addRow = (rowEl: ElementNode, target: Box): void => {
      const row = new Box('row', rowEl, this.styleOf(rowEl));
      for (const c of rowEl.elementChildren) {
        const cs = this.styles.get(c);
        if (!cs || cs.display !== 'table-cell') continue;
        const cell = new Box('cell', c, cs);
        cell.colspan = Math.max(1, Math.min(1000, parseInt(c.getAttribute('colspan') ?? '1', 10) || 1));
        const rowspan = c.getAttribute('rowspan');
        if (rowspan !== null && rowspan !== '1') {
          this.ctx.warn('rowspan ainda não é suportado; a célula ocupa uma única linha.');
        }
        this.fillContainer(cell, c);
        row.children.push(cell);
      }
      target.children.push(row);
    };

    for (const child of el.elementChildren) {
      const cs = this.styles.get(child);
      if (!cs || cs.display === 'none') continue;
      if (cs.display === 'table-caption') {
        table.caption = this.buildBlock(child, 'caption');
        continue;
      }
      const kind = ROW_GROUPS[cs.display];
      if (kind) {
        const group = new Box('row-group', child, cs);
        group.group = kind;
        for (const r of child.elementChildren) {
          if (this.styles.get(r)?.display === 'table-row') addRow(r, group);
        }
        // Apenas o primeiro thead/tfoot tem papel especial (CSS 2.1 §17.2).
        if (kind !== 'body' && groups[kind].length) group.group = 'body';
        groups[group.group].push(group);
        looseRows = null;
        continue;
      }
      if (cs.display === 'table-row') {
        if (!looseRows) {
          looseRows = new Box('row-group', null, style);
          looseRows.group = 'body';
          groups.body.push(looseRows);
        }
        addRow(child, looseRows);
      }
    }
    table.children = [...(table.caption ? [table.caption] : []), ...groups.header, ...groups.body, ...groups.footer];
    return table;
  }
}
