/**
 * Valores computados.
 *
 * Converte os valores especificados (resultado da cascata + herança) em
 * valores computados, com comprimentos absolutos em pontos PDF:
 *  - font-size é resolvido primeiro (em/%/palavras-chave relativos ao pai);
 *  - demais comprimentos em em/rem/ex/ch são convertidos usando o font-size;
 *  - percentuais permanecem como { percent } para o layout resolver;
 *  - currentcolor é substituído pela cor computada;
 *  - larguras de borda com estilo none/hidden passam a 0.
 */

import { PROPERTIES } from './properties/index.ts';
import { resolveSpecified } from './inheritance.ts';
import { cascadeElement } from './cascade.ts';
import type { RuleIndex, CascadedValues } from './cascade.ts';
import { ABSOLUTE_UNITS, PT_PER_PX, isAbsoluteUnit } from '../layout/measurements.ts';
import { NodeType } from '../html/dom-node.ts';
import type { DocumentNode, ElementNode } from '../html/dom-node.ts';
import type { Color } from '../graphics/colors.ts';
import type { ComputedLength, ComputedStyle, DecorationLine, LengthValue, PercentValue, TextDecoration } from './types.ts';
import { SIDES } from './types.ts';

export const DEFAULT_FONT_SIZE = 16 * PT_PER_PX; // 12pt

/** Contexto para unidades relativas. rootFontSize é atualizado no elemento raiz. */
export interface StyleContext {
  rootFontSize: number;
  viewportWidth: number;
  viewportHeight: number;
}

const FONT_SIZE_KEYWORDS_PX: Readonly<Record<string, number>> = {
  'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48,
};
const BORDER_WIDTH_KEYWORDS_PX: Readonly<Record<string, number>> = { thin: 1, medium: 3, thick: 5 };

function isLengthValue(v: unknown): v is LengthValue {
  return typeof v === 'object' && v !== null && (v as LengthValue).type === 'length';
}

function isPercentValue(v: unknown): v is PercentValue {
  return typeof v === 'object' && v !== null && (v as PercentValue).type === 'percent';
}

function isColor(v: unknown): v is Color {
  return typeof v === 'object' && v !== null && 'r' in v && 'a' in v;
}

/** Converte um comprimento especificado em pontos (ou mantém percentuais/palavras-chave). */
export function resolveLength(v: unknown, fontSize: number, ctx: StyleContext): ComputedLength | string | unknown {
  if (isPercentValue(v)) return { percent: v.value };
  if (!isLengthValue(v)) return v;
  const { value, unit } = v;
  if (isAbsoluteUnit(unit)) return value * ABSOLUTE_UNITS[unit];
  switch (unit) {
    case 'em': return value * fontSize;
    case 'rem': return value * ctx.rootFontSize;
    case 'ex':
    case 'ch': return value * fontSize * 0.5;
    case 'vw': return (value * ctx.viewportWidth) / 100;
    case 'vh': return (value * ctx.viewportHeight) / 100;
    case 'vmin': return (value * Math.min(ctx.viewportWidth, ctx.viewportHeight)) / 100;
    case 'vmax': return (value * Math.max(ctx.viewportWidth, ctx.viewportHeight)) / 100;
    default: return 0;
  }
}

/** Versão estrita para comprimentos absolutos conhecidos (usada por @page). */
export function lengthToPoints(v: LengthValue, fontSize: number, ctx: StyleContext): number {
  const r = resolveLength(v, fontSize, ctx);
  return typeof r === 'number' ? r : 0;
}

function computeFontSize(spec: unknown, fromParent: boolean, parentSize: number, ctx: StyleContext): number {
  if (fromParent && typeof spec === 'number') return spec;
  if (typeof spec === 'string') {
    if (spec === 'smaller') return parentSize / 1.2;
    if (spec === 'larger') return parentSize * 1.2;
    return (FONT_SIZE_KEYWORDS_PX[spec] ?? 16) * PT_PER_PX;
  }
  if (isPercentValue(spec)) return (spec.value / 100) * parentSize;
  if (isLengthValue(spec)) {
    if (spec.unit === 'em') return spec.value * parentSize;
    if (spec.unit === 'ex' || spec.unit === 'ch') return spec.value * parentSize * 0.5;
    const r = resolveLength(spec, parentSize, ctx);
    return typeof r === 'number' ? r : parentSize;
  }
  return parentSize;
}

function computeFontWeight(spec: unknown, parentWeight: number): number {
  if (spec === 'bolder') return parentWeight < 350 ? 400 : parentWeight < 550 ? 700 : 900;
  if (spec === 'lighter') return parentWeight < 550 ? 100 : parentWeight < 750 ? 400 : 700;
  return typeof spec === 'number' ? spec : 400;
}

/**
 * Calcula o estilo computado de um elemento.
 * @param cascaded  valores da cascata
 * @param parent    estilo computado do pai (null na raiz)
 */
export function computeStyle(cascaded: CascadedValues, parent: ComputedStyle | null, ctx: StyleContext, isRoot = false): ComputedStyle {
  const style: Record<string, unknown> = {};
  const spec = (prop: string) => resolveSpecified(prop, cascaded.get(prop), parent);

  // 1. font-size
  const parentFontSize = parent ? parent['font-size'] : DEFAULT_FONT_SIZE;
  const fs = spec('font-size');
  const fontSize = computeFontSize(fs.value, fs.fromParent, parentFontSize, ctx);
  style['font-size'] = fontSize;
  if (isRoot) ctx.rootFontSize = fontSize;

  // 2. color (necessário para currentcolor)
  const c = spec('color').value;
  const color: Color = isColor(c) ? c : (parent?.color ?? (PROPERTIES.color!.initial as Color));
  style.color = color;

  // 3. demais propriedades
  for (const prop of Object.keys(PROPERTIES)) {
    if (prop === 'font-size' || prop === 'color') continue;
    const { value, fromParent } = spec(prop);
    if (fromParent) {
      style[prop] = value;
      continue;
    }
    switch (prop) {
      case 'font-weight':
        style[prop] = computeFontWeight(value, parent ? parent['font-weight'] : 400);
        break;
      case 'line-height':
        if (isPercentValue(value)) style[prop] = (value.value / 100) * fontSize;
        else style[prop] = resolveLength(value, fontSize, ctx);
        break;
      case 'letter-spacing':
      case 'word-spacing':
        style[prop] = value === 'normal' ? 0 : resolveLength(value, fontSize, ctx);
        break;
      case 'border-spacing':
        style[prop] = Array.isArray(value) ? value.map((v) => resolveLength(v, fontSize, ctx)) : [0, 0];
        break;
      default:
        style[prop] = resolveLength(value, fontSize, ctx);
    }
  }

  // Bordas: palavras-chave de largura, estilo none → 0, currentcolor.
  for (const side of SIDES) {
    const wKey = `border-${side}-width`;
    let w = style[wKey];
    if (typeof w === 'string') w = (BORDER_WIDTH_KEYWORDS_PX[w] ?? 3) * PT_PER_PX;
    const st = style[`border-${side}-style`];
    style[wKey] = st === 'none' || st === 'hidden' ? 0 : typeof w === 'number' ? w : 0;
    if (!isColor(style[`border-${side}-color`])) style[`border-${side}-color`] = color;
  }
  if (!isColor(style['background-color'])) style['background-color'] = color;

  // Decorações de texto se propagam para os descendentes (CSS Text Decoration §2).
  const inherited: TextDecoration[] = parent?.textDecorations ?? [];
  const lines = (style['text-decoration-line'] as DecorationLine[] | undefined) ?? [];
  const own = lines.map((line): TextDecoration => ({ line, color }));
  style.textDecorations = own.length ? [...inherited.filter((d) => !own.some((o) => o.line === d.line)), ...own] : inherited;

  // Ajustes de display.
  if (isRoot && style.display !== 'none') style.display = 'block';
  if (style.display === 'flow-root') style.display = 'block';
  if (style.display === 'inline-table') style.display = 'table';

  return style as unknown as ComputedStyle;
}

/** Calcula os estilos de toda a árvore. */
export function computeStyles(document: DocumentNode, ruleIndex: RuleIndex, ctx: StyleContext): Map<ElementNode, ComputedStyle> {
  const styles = new Map<ElementNode, ComputedStyle>();
  const walk = (el: ElementNode, parentStyle: ComputedStyle | null, isRoot: boolean): void => {
    const style = computeStyle(cascadeElement(el, ruleIndex), parentStyle, ctx, isRoot);
    styles.set(el, style);
    for (const child of el.children) {
      if (child.type === NodeType.ELEMENT) walk(child, style, false);
    }
  };
  const root = document.documentElement;
  if (root) walk(root, null, true);
  return styles;
}
