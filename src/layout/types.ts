/**
 * Estruturas da árvore de layout (render tree).
 */

import type { ElementNode } from '../html/dom-node.ts';
import type { ComputedStyle } from '../css/types.ts';
import type { Color } from '../graphics/colors.ts';
import type { FontFace, FontManager } from '../fonts/font-manager.ts';

/* ------------------------------------------------------------ itens inline */

export type InlineItem =
  | { type: 'text'; text: string; style: ComputedStyle; bg: Color | null; hidden?: boolean }
  | { type: 'br'; style: ComputedStyle };

/** Trecho de texto posicionado dentro de uma linha. */
export interface Fragment {
  x: number;
  width: number;
  text: string;
  style: ComputedStyle;
  face: FontFace;
  bg: Color | null;
  hidden: boolean;
  /** Lacuna de espaço em texto justificado (sem texto, mas com fundo/decoração). */
  gap?: boolean;
}

/** Marcador de lista já posicionado. */
export interface PlacedMarker {
  shape?: 'disc' | 'circle' | 'square';
  text?: string;
  style: ComputedStyle;
  inside: boolean;
  color: Color;
  baseline: number;
  /** Marcadores de texto */
  x?: number;
  face?: FontFace;
  fontSize?: number;
  /** Marcadores geométricos */
  cx?: number;
  cy?: number;
  size?: number;
}

export interface LineBox {
  x: number;
  y: number;
  width: number;
  height: number;
  baseline: number;
  fragments: Fragment[];
  markers?: PlacedMarker[];
}

/* -------------------------------------------------------------- box model */

export interface EdgeSizes {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoxEdges {
  margin: EdgeSizes;
  padding: EdgeSizes;
  border: EdgeSizes;
}

export type BoxKind = 'block' | 'anonymous' | 'table' | 'row-group' | 'row' | 'cell' | 'caption';

export interface MarkerSpec {
  shape?: 'disc' | 'circle' | 'square';
  text?: string;
  style: ComputedStyle;
  inside: boolean;
}

export interface IntrinsicSizes {
  min: number;
  max: number;
}

/**
 * Caixa da árvore de layout. Os campos de geometria são preenchidos pelo
 * layout; os de paginação, pela fragmentação.
 */
export class Box {
  readonly kind: BoxKind;
  readonly element: ElementNode | null;
  readonly style: ComputedStyle;
  children: Box[] = [];
  /** Itens inline (quando a caixa estabelece um contexto inline). */
  inline: InlineItem[] | null = null;
  lines: LineBox[] | null = null;
  marker: MarkerSpec | null = null;

  // Geometria (pontos, espaço contínuo)
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  contentX = 0;
  contentY = 0;
  contentWidth = 0;
  contentHeight = 0;
  edges: BoxEdges | null = null;

  // Raiz e colapso de margens
  isRoot = false;
  topAbsorbed = false;
  bottomAbsorbed = false;
  effTop: number | undefined = undefined;
  effBottom: number | undefined = undefined;
  intrinsic: IntrinsicSizes | undefined = undefined;

  // Tabelas
  colspan = 1;
  group: 'header' | 'body' | 'footer' = 'body';
  caption: Box | null = null;
  headerGroup: Box | null = null;
  /** Topo e altura da moldura da tabela (sem a legenda). */
  frameY = 0;
  frameHeight = 0;

  // Paginação
  firstLeaf = -1;
  lastLeaf = -1;

  constructor(kind: BoxKind, element: ElementNode | null, style: ComputedStyle) {
    this.kind = kind;
    this.element = element;
    this.style = style;
  }
}

/* --------------------------------------------------------- contexto de layout */

export interface BlockLayoutOptions {
  /** Largura da caixa de borda imposta pelo pai (células, legendas). */
  forcedWidth?: number;
  /** Larguras de borda que substituem as do estilo (border-collapse). */
  borderOverride?: Partial<EdgeSizes>;
}

/**
 * Contexto compartilhado pelos algoritmos de layout. O layout de blocos e o
 * de tabelas se chamam por aqui, sem importação circular.
 */
export interface LayoutContext {
  fonts: FontManager;
  checkDeadline?: (stage: 'layout') => void;
  layoutBlock(box: Box, cbX: number, y: number, cbWidth: number, ctx: LayoutContext, opts?: BlockLayoutOptions): Box;
  layoutTable(table: Box, cbX: number, y: number, cbWidth: number, ctx: LayoutContext): Box;
  tableIntrinsic(table: Box, ctx: LayoutContext): IntrinsicSizes;
}
