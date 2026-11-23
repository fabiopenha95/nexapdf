/**
 * Serialização binária do arquivo PDF (ISO 32000-1, seção 7.5):
 *   cabeçalho → objetos indiretos → tabela de referência cruzada → trailer.
 *
 * A saída é determinística: mesmas entradas produzem os mesmos bytes
 * (o /ID é derivado de um hash MD5 do conteúdo; datas só entram nos
 * metadados quando fornecidas explicitamente).
 */

import { createHash } from 'node:crypto';
import { PdfStream, serializeValue, PdfHexString } from './pdf-objects.ts';
import type { PdfDict, PdfValue } from './pdf-objects.ts';

export interface IndirectObject {
  id: number;
  value: PdfValue | PdfStream;
}

const HEADER = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1');

/**
 * @param {Array<{id:number, value:any}>} objects  objetos indiretos (ids de 1..n, contíguos)
 * @param {object} trailer  { Root: PdfRef, Info?: PdfRef }
 * @returns {Buffer}
 */
export function serializePDF(objects: readonly IndirectObject[], trailer: PdfDict): Buffer {
  const sorted = [...objects].sort((a, b) => a.id - b.id);
  sorted.forEach((o, i) => {
    if (o.id !== i + 1) throw new Error(`IDs de objetos PDF devem ser contíguos (esperado ${i + 1}, recebido ${o.id}).`);
  });

  const chunks: Buffer[] = [HEADER];
  let offset = HEADER.length;
  const offsets: number[] = [];

  for (const { id, value } of sorted) {
    offsets[id] = offset;
    let buf: Buffer;
    if (value instanceof PdfStream) {
      const dict = { ...value.dict, Length: value.data.length };
      buf = Buffer.concat([
        Buffer.from(`${id} 0 obj\n${serializeValue(dict)}\nstream\n`, 'latin1'),
        Buffer.from(value.data),
        Buffer.from('\nendstream\nendobj\n', 'latin1'),
      ]);
    } else {
      buf = Buffer.from(`${id} 0 obj\n${serializeValue(value)}\nendobj\n`, 'latin1');
    }
    chunks.push(buf);
    offset += buf.length;
  }

  const size = sorted.length + 1;
  // Cada entrada da tabela xref tem exatamente 20 bytes (seção 7.5.4).
  let xref = `xref\n0 ${size}\n0000000000 65535 f\r\n`;
  for (let id = 1; id < size; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n\r\n`;

  const body = Buffer.concat(chunks);
  const digest = createHash('md5').update(body).digest();
  const id = new PdfHexString(Uint8Array.from(digest));
  const trailerDict: PdfDict = { Size: size, ...trailer, ID: [id, id] };
  const tail = `${xref}trailer\n${serializeValue(trailerDict)}\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.concat([body, Buffer.from(tail, 'latin1')]);
}
