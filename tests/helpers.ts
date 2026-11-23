/**
 * Utilitários de teste: inspeção estrutural de PDFs gerados.
 * (Implementação própria e mínima, apenas para os testes.)
 */

import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

/** Valida cabeçalho, xref, trailer e offsets. Retorna informações básicas. */
export function inspectPDF(buffer: Buffer): { size: number; objects: Map<number, Buffer>; trailer: string; pageCount: number } {
  const text = buffer.toString('latin1');
  if (!text.startsWith('%PDF-1.7\n')) throw new Error('Cabeçalho PDF ausente');
  if (!text.trimEnd().endsWith('%%EOF')) throw new Error('%%EOF ausente');
  const sx = text.lastIndexOf('startxref');
  const xrefOffset = parseInt(text.slice(sx + 9).trim(), 10);
  if (text.slice(xrefOffset, xrefOffset + 4) !== 'xref') throw new Error('startxref não aponta para a tabela xref');
  const header = /xref\n0 (\d+)\n/.exec(text.slice(xrefOffset));
  if (!header) throw new Error('Cabeçalho da tabela xref ausente');
  const size = parseInt(header[1]!, 10);
  const entriesStart = xrefOffset + header[0].length;
  const objects = new Map<number, Buffer>();
  for (let i = 0; i < size; i++) {
    const entry = text.slice(entriesStart + i * 20, entriesStart + (i + 1) * 20);
    if (entry.length !== 20 || !/^\d{10} \d{5} [nf]\r\n$/.test(entry)) throw new Error(`Entrada xref ${i} malformada: ${JSON.stringify(entry)}`);
    if (i === 0) continue;
    const off = parseInt(entry.slice(0, 10), 10);
    if (!text.startsWith(`${i} 0 obj`, off)) throw new Error(`Offset do objeto ${i} incorreto`);
    const end = text.indexOf('endobj', off);
    objects.set(i, buffer.subarray(off, end));
  }
  const trailer = text.slice(text.indexOf('trailer', xrefOffset), sx);
  const count = /\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text);
  return { size, objects, trailer, pageCount: count ? parseInt(count[1]!, 10) : 0 };
}

/** Extrai e descomprime todos os content streams de página, em ordem. */
export function pageContents(buffer: Buffer): string[] {
  const text = buffer.toString('latin1');
  const out: string[] = [];
  const pageRe = /\/Type \/Page \/Parent \d+ 0 R .*?\/Contents (\d+) 0 R/g;
  let m: RegExpExecArray | null;
  while ((m = pageRe.exec(text))) {
    const id = m[1];
    const objStart = text.indexOf(`\n${id} 0 obj\n`) + 1;
    const streamStart = text.indexOf('stream\n', objStart) + 7;
    const dict = text.slice(objStart, streamStart);
    const length = parseInt(/\/Length (\d+)/.exec(dict)?.[1] ?? '0', 10);
    let data = buffer.subarray(streamStart, streamStart + length);
    if (dict.includes('/FlateDecode')) data = inflateSync(data);
    out.push(data.toString('latin1'));
  }
  return out;
}

/** Textos desenhados (operadores Tj) por página, com as posições. */
export interface DrawnText {
  x: number;
  y: number;
  text: string;
}

export function pageTexts(buffer: Buffer): DrawnText[][] {
  return pageContents(buffer).map((c) => {
    const items: DrawnText[] = [];
    const re = /([\d.-]+) ([\d.-]+) Tm\n\((.*?)\) Tj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(c))) {
      const str = m[3]!.replace(/\\([()\\])/g, '$1').replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
      items.push({ x: parseFloat(m[1]!), y: parseFloat(m[2]!), text: str });
    }
    return items;
  });
}

export const allText = (buffer: Buffer): string[] => pageTexts(buffer).map((p) => p.map((i) => i.text).join(' '));

/** Garante que um valor existe (falha o teste caso contrário) e estreita o tipo. */
export function must<T>(value: T | null | undefined, message = 'valor ausente'): T {
  if (value === null || value === undefined) throw new assert.AssertionError({ message });
  return value;
}
