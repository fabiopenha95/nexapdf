/**
 * Cascata CSS (CSS Cascading Level 4, seção 6), simplificada:
 *
 * Ordem de precedência (maior vence):
 *   1. origem + importância   (UA normal < autor normal < inline normal
 *                              < autor !important < inline !important < UA !important)
 *   2. especificidade
 *   3. ordem de aparecimento
 *
 * As regras são indexadas pelo seletor composto mais à direita (ID, classe ou
 * tipo) para reduzir o número de testes de correspondência por elemento.
 */

import { matches } from './selector-engine.ts';
import { specificityKey } from './specificity.ts';
import { expandDeclaration } from './properties/index.ts';
import { parseDeclarations } from './parser.ts';
import type { RawDeclaration, Stylesheet } from './parser.ts';
import type { Declaration } from './properties/index.ts';
import type { ComplexSelector, SpecifiedValue } from './types.ts';
import type { ElementNode } from '../html/dom-node.ts';

export type Origin = 'ua' | 'author';

interface RuleEntry {
  selector: ComplexSelector;
  normal: Declaration[];
  important: Declaration[];
  origin: Origin;
  specificity: number;
  order: number;
}

/** Valores vencedores da cascata para um elemento: longhand → valor especificado. */
export type CascadedValues = Map<string, SpecifiedValue>;

const LEVEL = Object.freeze({
  uaNormal: 0,
  authorNormal: 1,
  inlineNormal: 2,
  authorImportant: 3,
  inlineImportant: 4,
  uaImportant: 5,
});

export class RuleIndex {
  private readonly byId = new Map<string, RuleEntry[]>();
  private readonly byClass = new Map<string, RuleEntry[]>();
  private readonly byTag = new Map<string, RuleEntry[]>();
  private readonly universal: RuleEntry[] = [];

  private static push(map: Map<string, RuleEntry[]>, key: string, entry: RuleEntry): void {
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }

  /** Adiciona as regras de uma folha já interpretada. origin: 'ua' | 'author'. */
  addStylesheet(sheet: Stylesheet, origin: Origin): void {
    for (const rule of sheet.rules) {
      const normal: Declaration[] = [];
      const important: Declaration[] = [];
      for (const d of rule.declarations) {
        for (const pair of expandDeclaration(d.property, d.value)) {
          (d.important ? important : normal).push(pair);
        }
      }
      if (!normal.length && !important.length) continue;
      for (const selector of rule.selectors) {
        const entry: RuleEntry = {
          selector,
          normal,
          important,
          origin,
          specificity: specificityKey(selector.specificity),
          order: rule.order,
        };
        const right = selector.compounds[selector.compounds.length - 1]!.simples;
        let id: string | undefined;
        let cls: string | undefined;
        let tag: string | undefined;
        for (const simple of right) {
          if (simple.type === 'id') id ??= simple.name;
          else if (simple.type === 'class') cls ??= simple.name;
          else if (simple.type === 'type') tag ??= simple.name;
        }
        if (id !== undefined) RuleIndex.push(this.byId, id, entry);
        else if (cls !== undefined) RuleIndex.push(this.byClass, cls, entry);
        else if (tag !== undefined) RuleIndex.push(this.byTag, tag, entry);
        else this.universal.push(entry);
      }
    }
  }

  candidates(el: ElementNode): RuleEntry[] {
    const out: RuleEntry[] = [];
    const byId = el.id ? this.byId.get(el.id) : undefined;
    if (byId) out.push(...byId);
    for (const c of el.classList) {
      const list = this.byClass.get(c);
      if (list) out.push(...list);
    }
    const tagList = this.byTag.get(el.tagName);
    if (tagList) out.push(...tagList);
    out.push(...this.universal);
    return out;
  }
}

/** Atributos de apresentação HTML convertidos em declarações (especificidade 0). */
function presentationalHints(el: ElementNode): RawDeclaration[] {
  const decls: string[] = [];
  const attr = (n: string): string | null => el.getAttribute(n);
  const tag = el.tagName;
  const lengthAttr = (v: string): string | null => (/^\d+(\.\d+)?%$/.test(v) ? v : /^\d+(\.\d+)?$/.test(v) ? `${v}px` : null);
  if (['table', 'td', 'th', 'img', 'col', 'hr'].includes(tag)) {
    const wa = attr('width');
    const w = wa && lengthAttr(wa.trim());
    if (w) decls.push(`width: ${w}`);
    const ha = attr('height');
    const h = ha && lengthAttr(ha.trim());
    if (h) decls.push(`height: ${h}`);
  }
  const align = attr('align');
  if (align && ['p', 'div', 'td', 'th', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'thead', 'tbody', 'tfoot'].includes(tag)) {
    const a = align.toLowerCase();
    if (['left', 'right', 'center', 'justify'].includes(a)) decls.push(`text-align: ${a}`);
  }
  const valign = attr('valign');
  if (valign && ['td', 'th'].includes(tag)) decls.push(`vertical-align: ${valign}`);
  const bg = attr('bgcolor');
  if (bg) decls.push(`background-color: ${bg}`);
  if (tag === 'font' && attr('color')) decls.push(`color: ${attr('color')}`);
  const border = attr('border');
  if (tag === 'table' && border && border !== '0') {
    decls.push(`border: ${parseInt(border, 10) || 1}px outset gray`);
  }
  const spacing = attr('cellspacing');
  if (tag === 'table' && spacing !== null && /^\d+$/.test(spacing)) {
    decls.push(`border-spacing: ${spacing}px`);
  }
  return decls.length ? parseDeclarations(decls.join(';')) : [];
}

/** Atributos que afetam células a partir do elemento <table>. */
function tableCellHints(el: ElementNode): RawDeclaration[] {
  if (el.tagName !== 'td' && el.tagName !== 'th') return [];
  let table = el.parent;
  while (table && !(table.type === 'element' && table.tagName === 'table')) table = table.parent;
  if (!table || table.type !== 'element') return [];
  const decls: string[] = [];
  const pad = table.getAttribute('cellpadding');
  if (pad !== null && /^\d+$/.test(pad)) decls.push(`padding: ${pad}px`);
  const border = table.getAttribute('border');
  if (border && border !== '0') decls.push('border: 1px inset gray');
  return decls.length ? parseDeclarations(decls.join(';')) : [];
}

/**
 * Calcula os valores em cascata de um elemento.
 * @returns {Map<string, any>} longhand → valor especificado vencedor
 */
export function cascadeElement(el: ElementNode, index: RuleIndex): CascadedValues {
  const winners = new Map<string, { value: SpecifiedValue; level: number; specificity: number; order: number }>();

  function offer(prop: string, value: SpecifiedValue, level: number, specificity: number, order: number): void {
    const prev = winners.get(prop);
    if (
      !prev ||
      level > prev.level ||
      (level === prev.level && (specificity > prev.specificity || (specificity === prev.specificity && order >= prev.order)))
    ) {
      winners.set(prop, { value, level, specificity, order });
    }
  }

  for (const entry of index.candidates(el)) {
    if (!matches(el, entry.selector)) continue;
    const isUA = entry.origin === 'ua';
    for (const [p, v] of entry.normal) offer(p, v, isUA ? LEVEL.uaNormal : LEVEL.authorNormal, entry.specificity, entry.order);
    for (const [p, v] of entry.important) offer(p, v, isUA ? LEVEL.uaImportant : LEVEL.authorImportant, entry.specificity, entry.order);
  }

  for (const d of [...tableCellHints(el), ...presentationalHints(el)]) {
    for (const [p, v] of expandDeclaration(d.property, d.value)) offer(p, v, LEVEL.authorNormal, 0, -1);
  }

  const inline = el.getAttribute('style');
  if (inline) {
    let order = 0;
    for (const d of parseDeclarations(inline)) {
      for (const [p, v] of expandDeclaration(d.property, d.value)) {
        offer(p, v, d.important ? LEVEL.inlineImportant : LEVEL.inlineNormal, 0, order++);
      }
    }
  }

  const out: CascadedValues = new Map();
  for (const [p, w] of winners) out.set(p, w.value);
  return out;
}
