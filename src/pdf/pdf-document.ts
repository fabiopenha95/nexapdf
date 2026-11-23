/**
 * Montagem do documento PDF 1.7:
 *   Catalog → Pages → Page[] (MediaBox, Resources, Contents)
 *   Fontes Type1 padrão (WinAnsiEncoding), ExtGState para transparência,
 *   dicionário Info com metadados.
 */

import { deflateSync } from 'node:zlib';
import { PdfRef, PdfStream, name, textString, pdfDate } from './pdf-objects.ts';
import type { PdfDict, PdfValue } from './pdf-objects.ts';
import { ContentBuilder } from './pdf-content.ts';
import { serializePDF } from './pdf-serializer.ts';
import type { IndirectObject } from './pdf-serializer.ts';
import type { Canvas } from '../graphics/canvas.ts';
import type { FontFace } from '../fonts/font-manager.ts';
import type { DocumentMetadata } from '../core/options.ts';

interface ResourceEntry {
  ref: PdfRef;
  name: string;
}

export const PRODUCER = 'NexaPDF 0.1.0';

export class PdfDocumentBuilder {
  private readonly compress: boolean;
  private readonly objects: IndirectObject[] = [];
  private nextId = 1;
  private readonly fontRefs = new Map<string, ResourceEntry>(); // face.key → recurso
  private readonly alphaRefs = new Map<number, ResourceEntry>(); // alfa → recurso

  constructor({ compress = true }: { compress?: boolean } = {}) {
    this.compress = compress;
  }

  private alloc(): PdfRef {
    return new PdfRef(this.nextId++);
  }

  private set(ref: PdfRef, value: PdfValue | PdfStream): void {
    this.objects.push({ id: ref.id, value });
  }

  private fontResource(face: FontFace): ResourceEntry {
    let entry = this.fontRefs.get(face.key);
    if (!entry) {
      const ref = this.alloc();
      entry = { ref, name: `F${this.fontRefs.size + 1}` };
      this.fontRefs.set(face.key, entry);
      this.set(ref, {
        Type: name('Font'),
        Subtype: name('Type1'),
        BaseFont: name(face.metrics.baseFont),
        Encoding: name('WinAnsiEncoding'),
      });
    }
    return entry;
  }

  private alphaResource(alpha: number): ResourceEntry {
    const key = Math.round(alpha * 1000) / 1000;
    let entry = this.alphaRefs.get(key);
    if (!entry) {
      const ref = this.alloc();
      entry = { ref, name: `GS${this.alphaRefs.size + 1}` };
      this.alphaRefs.set(key, entry);
      this.set(ref, { Type: name('ExtGState'), ca: key, CA: key });
    }
    return entry;
  }

  private stream(dict: PdfDict, data: Buffer): PdfStream {
    if (this.compress) return new PdfStream({ ...dict, Filter: name('FlateDecode') }, deflateSync(data));
    return new PdfStream(dict, data);
  }

  /**
   * @param {Canvas[]} canvases  uma por página
   * @param {object} metadata  { title, author, subject, keywords, creator, creationDate, modDate }
   */
  build(canvases: readonly Canvas[], metadata: DocumentMetadata = {}): Buffer {
    const catalogRef = this.alloc();
    const pagesRef = this.alloc();
    const infoRef = this.alloc();
    const pageRefs: PdfRef[] = [];

    for (const canvas of canvases) {
      const pageRef = this.alloc();
      const contentRef = this.alloc();
      pageRefs.push(pageRef);
      const usedFonts = new Map<string, PdfRef>();
      const usedAlpha = new Map<string, PdfRef>();
      const resources = {
        fontName: (face: FontFace): string => {
          const e = this.fontResource(face);
          usedFonts.set(e.name, e.ref);
          return '/' + e.name;
        },
        alphaName: (a: number): string => {
          const e = this.alphaResource(a);
          usedAlpha.set(e.name, e.ref);
          return '/' + e.name;
        },
      };
      const data = new ContentBuilder(canvas.height, resources).build(canvas.ops);
      this.set(contentRef, this.stream({}, data));
      const res: PdfDict = { ProcSet: [name('PDF'), name('Text')] };
      if (usedFonts.size) res.Font = Object.fromEntries([...usedFonts].sort());
      if (usedAlpha.size) res.ExtGState = Object.fromEntries([...usedAlpha].sort());
      this.set(pageRef, {
        Type: name('Page'),
        Parent: pagesRef,
        MediaBox: [0, 0, round(canvas.width), round(canvas.height)],
        Resources: res,
        Contents: contentRef,
      });
    }

    this.set(pagesRef, { Type: name('Pages'), Kids: pageRefs, Count: pageRefs.length });
    this.set(catalogRef, { Type: name('Catalog'), Pages: pagesRef });

    const info: PdfDict = { Producer: textString(PRODUCER) };
    if (metadata.title) info.Title = textString(metadata.title);
    if (metadata.author) info.Author = textString(metadata.author);
    if (metadata.subject) info.Subject = textString(metadata.subject);
    if (metadata.keywords) info.Keywords = textString(Array.isArray(metadata.keywords) ? metadata.keywords.join(', ') : metadata.keywords);
    info.Creator = textString(metadata.creator ?? PRODUCER);
    if (metadata.creationDate) info.CreationDate = textString(pdfDate(metadata.creationDate));
    if (metadata.modDate) info.ModDate = textString(pdfDate(metadata.modDate));
    this.set(infoRef, info);

    return serializePDF(this.objects, { Root: catalogRef, Info: infoRef });
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
