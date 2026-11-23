/**
 * Orquestra o layout: gera a árvore de caixas e posiciona tudo no espaço
 * contínuo cuja largura é a área útil da página.
 */

import { BoxTreeBuilder } from './box-tree.ts';
import { layoutBlockBox, effectiveMarginTop, effectiveMarginBottom } from './block-layout.ts';
import { layoutTable, tableIntrinsic } from './table-layout.ts';
import type { DocumentNode, ElementNode } from '../html/dom-node.ts';
import type { ComputedStyle } from '../css/types.ts';
import type { FontManager } from '../fonts/font-manager.ts';
import type { Box, LayoutContext } from './types.ts';

export interface LayoutEnvironment {
  fonts: FontManager;
  contentWidth: number;
  warn(message: string): void;
  checkDeadline?: (stage: 'layout') => void;
}

export interface LayoutResult {
  root: Box | null;
  height: number;
}

export function layoutDocument(document: DocumentNode, styles: Map<ElementNode, ComputedStyle>, env: LayoutEnvironment): LayoutResult {
  const builder = new BoxTreeBuilder(styles, { warn: env.warn });
  const root = builder.build(document);
  if (!root) return { root: null, height: 0 };
  root.isRoot = true;

  const ctx: LayoutContext = {
    fonts: env.fonts,
    checkDeadline: env.checkDeadline,
    layoutBlock: layoutBlockBox,
    layoutTable,
    tableIntrinsic,
  };

  const top = effectiveMarginTop(root, env.contentWidth);
  layoutBlockBox(root, 0, top, env.contentWidth, ctx);
  const bottom = effectiveMarginBottom(root, env.contentWidth);
  return { root, height: root.y + root.height + bottom };
}
