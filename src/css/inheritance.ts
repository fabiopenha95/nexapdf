/**
 * Regras de herança: quais propriedades herdam e como os valores globais
 * (inherit, initial, unset) são resolvidos.
 */

import { PROPERTIES } from './properties/index.ts';
import type { ComputedStyle, SpecifiedValue } from './types.ts';

export function isInherited(property: string): boolean {
  return !!PROPERTIES[property]?.inherited;
}

export function initialValue(property: string): SpecifiedValue | undefined {
  return PROPERTIES[property]?.initial;
}

function isGlobal(v: unknown): v is { global: 'inherit' | 'initial' | 'unset' } {
  return typeof v === 'object' && v !== null && 'global' in v;
}

/**
 * Resolve o valor especificado de uma propriedade para um elemento.
 * fromParent=true indica que o valor já está computado (herdado do pai).
 */
export function resolveSpecified(
  property: string,
  cascaded: SpecifiedValue | undefined,
  parentComputed: ComputedStyle | null,
): { value: unknown; fromParent: boolean } {
  const parentValue = (): unknown => (parentComputed as unknown as Record<string, unknown>)[property];
  if (isGlobal(cascaded)) {
    if (cascaded.global === 'inherit' || (cascaded.global === 'unset' && isInherited(property))) {
      if (parentComputed) return { value: parentValue(), fromParent: true };
    }
    return { value: initialValue(property), fromParent: false };
  }
  if (cascaded === undefined) {
    if (isInherited(property) && parentComputed) return { value: parentValue(), fromParent: true };
    return { value: initialValue(property), fromParent: false };
  }
  return { value: cascaded, fromParent: false };
}
