/**
 * Objetos PDF (ISO 32000-1:2008, seção 7.3) e sua serialização.
 *
 *   boolean, número, string, nome, array, dicionário, stream, null,
 *   referência indireta ("n 0 R").
 *
 * TypeScript → PDF:
 *   number → número;  boolean → true/false;  null → null;  Array → array;
 *   objeto simples → dicionário;  PdfName / PdfRef / PdfString / PdfHexString
 *   / PdfStream para os demais tipos.
 */

export class PdfName {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export class PdfRef {
  readonly id: number;
  readonly generation: number;
  constructor(id: number, generation = 0) {
    this.id = id;
    this.generation = generation;
  }
}

/** String literal a partir de bytes. */
export class PdfString {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array | string) {
    this.bytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(Buffer.from(String(bytes), 'latin1'));
  }
}

export class PdfHexString {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
}

export type PdfValue =
  | number
  | boolean
  | null
  | undefined
  | string
  | PdfName
  | PdfRef
  | PdfString
  | PdfHexString
  | PdfValue[]
  | PdfDict;

export interface PdfDict {
  [key: string]: PdfValue;
}

export class PdfStream {
  readonly dict: PdfDict;
  readonly data: Uint8Array;
  /** @param dict dicionário (sem /Length, calculado na serialização) */
  constructor(dict: PdfDict, data: Uint8Array) {
    this.dict = dict;
    this.data = data;
  }
}

export const name = (n: string): PdfName => new PdfName(n);

/** Formata um número com no máximo 4 casas decimais, sem notação científica. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new TypeError(`Número inválido para PDF: ${n}`);
  if (Number.isInteger(n)) return String(n);
  let s = n.toFixed(4);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}

function escapeName(n: string): string {
  let out = '';
  for (const ch of Buffer.from(n, 'utf8')) {
    const c = String.fromCharCode(ch);
    if (ch < 0x21 || ch > 0x7e || '#()<>[]{}/%'.includes(c)) out += '#' + ch.toString(16).padStart(2, '0');
    else out += c;
  }
  return out;
}

/** Escapa bytes para uma string literal "( ... )" mantendo o conteúdo em ASCII. */
export function escapeLiteralBytes(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7e) out += '\\' + b.toString(8).padStart(3, '0');
    else out += String.fromCharCode(b);
  }
  return out;
}

/** String de texto do PDF (seção 7.9.2.2): ASCII literal ou UTF-16BE com BOM. */
export function textString(str: string): PdfString | PdfHexString {
  const s = String(str);
  if (/^[\x20-\x7e]*$/.test(s)) return new PdfString(Buffer.from(s, 'latin1'));
  const units = [0xfe, 0xff];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    units.push(c >> 8, c & 0xff);
  }
  return new PdfHexString(Uint8Array.from(units));
}

/** Data no formato do PDF: D:AAAAMMDDHHmmSSZ (sempre em UTC). */
export function pdfDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new TypeError('Data inválida nos metadados.');
  const p = (n: number, l = 2): string => String(n).padStart(l, '0');
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Serializa um valor (exceto streams) para string latin1. */
export function serializeValue(v: PdfValue | PdfStream): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return '(' + escapeLiteralBytes(Buffer.from(v, 'latin1')) + ')';
  if (v instanceof PdfName) return '/' + escapeName(v.name);
  if (v instanceof PdfRef) return `${v.id} ${v.generation} R`;
  if (v instanceof PdfString) return '(' + escapeLiteralBytes(v.bytes) + ')';
  if (v instanceof PdfHexString) return '<' + Buffer.from(v.bytes).toString('hex').toUpperCase() + '>';
  if (v instanceof PdfStream) throw new TypeError('Streams devem ser objetos indiretos.');
  if (Array.isArray(v)) return '[' + v.map(serializeValue).join(' ') + ']';
  const parts: string[] = [];
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined) continue;
    parts.push('/' + escapeName(k) + ' ' + serializeValue(val));
  }
  return '<< ' + parts.join(' ') + ' >>';
}
