/**
 * API pública da NexaPDF.
 *
 *   const pdf = new NexaPDF({ format: 'A4' });           // opções padrão
 *   const r = await pdf.convert({ html, css, options, output });
 *     output: undefined | 'buffer' → apenas em memória
 *             '/caminho/arquivo.pdf' → grava o arquivo (e também retorna o buffer)
 *   r → { buffer, pageCount, warnings, metrics, path? }
 *
 *   const stream = pdf.createStream({ html, css, options });  // Readable
 */

import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { runPipeline } from './pipeline.ts';
import { ConfigurationError, NexaPDFError, RenderError } from './errors.ts';
import type { ConversionResult, ConvertInput, ConvertOptions, ConvertRequest, MarginOptions } from './options.ts';

function isMarginObject(m: ConvertOptions['margin']): m is MarginOptions {
  return typeof m === 'object' && m !== null;
}

function mergeOptions(defaults: ConvertOptions, options: ConvertOptions | undefined): ConvertOptions {
  const merged: ConvertOptions = { ...defaults, ...(options ?? {}) };
  if (isMarginObject(defaults.margin) && isMarginObject(options?.margin)) {
    merged.margin = { ...defaults.margin, ...options.margin };
  }
  if (defaults.limits || options?.limits) merged.limits = { ...(defaults.limits ?? {}), ...(options?.limits ?? {}) };
  if (defaults.metadata || options?.metadata) merged.metadata = { ...(defaults.metadata ?? {}), ...(options?.metadata ?? {}) };
  return merged;
}

export class NexaPDF {
  /** Opções aplicadas a todas as conversões desta instância. */
  readonly defaults: Readonly<ConvertOptions>;

  constructor(defaults: ConvertOptions = {}) {
    if (defaults === null || typeof defaults !== 'object') throw new ConfigurationError('As opções padrão devem ser um objeto.');
    this.defaults = { ...defaults };
  }

  /** Conversão síncrona (útil em scripts e testes). */
  convertSync({ html, css, options }: ConvertInput): ConversionResult {
    try {
      const r = runPipeline({ html, css, options: mergeOptions(this.defaults, options) });
      return { buffer: r.buffer, pageCount: r.pageCount, warnings: r.warnings, metrics: r.metrics };
    } catch (err) {
      if (err instanceof NexaPDFError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new RenderError(`Falha inesperada na conversão: ${message}`, { cause: err });
    }
  }

  /** Converte HTML em PDF. Grava em disco quando `output` é um caminho. */
  async convert({ html, css, options, output }: ConvertRequest): Promise<ConversionResult> {
    const result = this.convertSync({ html, css, options });
    if (output !== undefined && output !== 'buffer') {
      if (typeof output !== 'string' || !output.trim()) {
        throw new ConfigurationError('A opção "output" deve ser "buffer" ou um caminho de arquivo.');
      }
      await writeFile(output, result.buffer);
      result.path = output;
    }
    return result;
  }

  /**
   * Retorna um Readable com o PDF. Nesta fase o documento é gerado por
   * completo antes de ser transmitido (a geração incremental é planejada).
   */
  createStream({ html, css, options }: ConvertInput): Readable {
    let started = false;
    const convert = (input: ConvertInput): ConversionResult => this.convertSync(input);
    return new Readable({
      read: function (this: Readable): void {
        if (started) return;
        started = true;
        try {
          const { buffer } = convert({ html, css, options });
          const CHUNK = 64 * 1024;
          for (let i = 0; i < buffer.length; i += CHUNK) this.push(buffer.subarray(i, i + CHUNK));
          this.push(null);
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
      },
    });
  }
}
