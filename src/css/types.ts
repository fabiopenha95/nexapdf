/**
 * Tipos compartilhados da engine CSS: tokens, valores especificados e
 * estilos computados.
 */

import type { Color } from '../graphics/colors.ts';

/* ------------------------------------------------------------------ tokens */

export type CSSToken =
  | { type: 'ident' | 'function' | 'at-keyword' | 'string' | 'bad-string' | 'url' | 'bad-url' | 'delim'; value: string }
  | { type: 'hash'; value: string; isId: boolean }
  | { type: 'number'; value: number; isInteger: boolean }
  | { type: 'percentage'; value: number }
  | { type: 'dimension'; value: number; unit: string; isInteger: boolean }
  | { type: 'whitespace' | 'colon' | 'semicolon' | 'comma' | '[' | ']' | '(' | ')' | '{' | '}' | 'cdo' | 'cdc' };

export type CSSTokenType = CSSToken['type'];

/* -------------------------------------------------- valores especificados */

export interface LengthValue {
  type: 'length';
  value: number;
  unit: string;
}

export interface PercentValue {
  type: 'percent';
  value: number;
}

/** Número puro (ex.: line-height: 1.5). */
export interface NumberValue {
  type: 'number';
  value: number;
}

export interface GlobalValue {
  global: 'inherit' | 'initial' | 'unset';
}

export type DecorationLine = 'underline' | 'overline' | 'line-through';

/** Valor especificado de uma longhand após o parse. */
export type SpecifiedValue =
  | string
  | number
  | LengthValue
  | PercentValue
  | NumberValue
  | Color
  | 'currentcolor'
  | string[]
  | DecorationLine[]
  | [LengthValue, LengthValue]
  | GlobalValue;

/* ------------------------------------------------------ valores computados */

/** Percentual ainda não resolvido (depende do bloco contêiner). */
export interface PercentLength {
  percent: number;
}

/** Comprimento computado: pontos, percentual pendente ou palavra-chave. */
export type ComputedLength = number | PercentLength | 'auto' | 'none';

export type LineHeight = 'normal' | NumberValue | number;

export interface TextDecoration {
  line: DecorationLine;
  color: Color;
}

/** Estilo computado de um elemento (comprimentos em pontos PDF). */
export interface ComputedStyle {
  display: string;
  color: Color;
  'background-color': Color;

  'font-family': string[];
  'font-size': number;
  'font-weight': number;
  'font-style': 'normal' | 'italic' | 'oblique';
  'line-height': LineHeight;
  'letter-spacing': number;
  'word-spacing': number;
  'text-align': 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';
  'text-indent': ComputedLength;
  'text-transform': 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  'text-decoration-line': DecorationLine[];
  'white-space': 'normal' | 'pre' | 'nowrap' | 'pre-wrap' | 'pre-line' | 'break-spaces';
  'overflow-wrap': 'normal' | 'break-word' | 'anywhere';
  'word-break': 'normal' | 'break-all' | 'keep-all' | 'break-word';
  visibility: 'visible' | 'hidden' | 'collapse';

  width: ComputedLength;
  height: ComputedLength;
  'min-width': ComputedLength;
  'min-height': ComputedLength;
  'max-width': ComputedLength;
  'max-height': ComputedLength;
  'box-sizing': 'content-box' | 'border-box';
  'vertical-align': string;

  'margin-top': ComputedLength;
  'margin-right': ComputedLength;
  'margin-bottom': ComputedLength;
  'margin-left': ComputedLength;
  'padding-top': ComputedLength;
  'padding-right': ComputedLength;
  'padding-bottom': ComputedLength;
  'padding-left': ComputedLength;
  'border-top-width': number;
  'border-right-width': number;
  'border-bottom-width': number;
  'border-left-width': number;
  'border-top-style': string;
  'border-right-style': string;
  'border-bottom-style': string;
  'border-left-style': string;
  'border-top-color': Color;
  'border-right-color': Color;
  'border-bottom-color': Color;
  'border-left-color': Color;

  'list-style-type': string;
  'list-style-position': 'inside' | 'outside';

  'border-collapse': 'separate' | 'collapse';
  'border-spacing': [ComputedLength, ComputedLength];
  'table-layout': 'auto' | 'fixed';

  'break-before': string;
  'break-after': string;
  'break-inside': string;
  orphans: number;
  widows: number;

  /** Decorações de texto propagadas dos ancestrais (CSS Text Decoration §2). */
  textDecorations: TextDecoration[];
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/* ---------------------------------------------------------------- seletores */

export type Specificity = [ids: number, classes: number, types: number];

export interface NthExpression {
  a: number;
  b: number;
}

export type SimpleSelector =
  | { type: 'type'; name: string }
  | { type: 'universal' }
  | { type: 'id'; name: string }
  | { type: 'class'; name: string }
  | { type: 'attribute'; name: string; op: string | null; value: string | null; caseInsensitive: boolean }
  | { type: 'pseudo-class'; name: string; nth?: NthExpression; argument?: ComplexSelector[] };

export type Combinator = ' ' | '>' | '+' | '~';

export interface CompoundSelector {
  simples: SimpleSelector[];
  /** Relação com o seletor composto anterior (null no primeiro). */
  combinator: Combinator | null;
}

export interface ComplexSelector {
  compounds: CompoundSelector[];
  specificity: Specificity;
}
