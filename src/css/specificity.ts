/**
 * Especificidade de seletores (Selectors Level 4, seção 17).
 * Representada como [a, b, c]: IDs, classes/atributos/pseudo-classes, tipos.
 */

import type { ComplexSelector, SimpleSelector, Specificity } from './types.ts';

export function computeSpecificity(complexSelector: Pick<ComplexSelector, 'compounds'>): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const compound of complexSelector.compounds) {
    for (const simple of compound.simples) {
      const [sa, sb, sc] = simpleSpecificity(simple);
      a += sa;
      b += sb;
      c += sc;
    }
  }
  return [a, b, c];
}

function simpleSpecificity(simple: SimpleSelector): Specificity {
  switch (simple.type) {
    case 'id':
      return [1, 0, 0];
    case 'class':
    case 'attribute':
      return [0, 1, 0];
    case 'pseudo-class':
      if (simple.name === 'not' && simple.argument) {
        // :not() assume a especificidade do argumento mais específico.
        let best: Specificity = [0, 0, 0];
        for (const sel of simple.argument) {
          const s = computeSpecificity(sel);
          if (compareSpecificity(s, best) > 0) best = s;
        }
        return best;
      }
      return [0, 1, 0];
    case 'type':
      return [0, 0, 1];
    default:
      return [0, 0, 0]; // universal
  }
}

export function compareSpecificity(x: Specificity, y: Specificity): number {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** Codifica a especificidade em um único número ordenável. */
export function specificityKey([a, b, c]: Specificity): number {
  return a * 1_000_000 + b * 1_000 + c;
}
