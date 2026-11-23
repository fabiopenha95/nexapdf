/**
 * Configuração de documentos: tamanhos de página, orientação, margens,
 * cabeçalho/rodapé, metadados e limites de segurança.
 *
 * normalizeOptions() recebe as opções do usuário e devolve um objeto
 * totalmente resolvido, com todas as medidas em pontos PDF.
 */

import { ConfigurationError } from './errors.ts';
import { parseMeasure, toPoints } from '../layout/measurements.ts';
import type {
  ConversionLimits,
  ConvertOptions,
  CssPageRule,
  HeaderFooterOptions,
  MarginOptions,
  Orientation,
  ResolvedConfig,
  ResolvedHeaderFooter,
  ResolvedMargins,
} from './options.ts';
import type { Measure } from '../layout/measurements.ts';

/** Tamanhos de página em retrato: [largura, altura, unidade]. */
export const PAGE_SIZES: Readonly<Record<string, readonly [number, number, 'mm' | 'in']>> = Object.freeze({
  A0: [841, 1189, 'mm'],
  A1: [594, 841, 'mm'],
  A2: [420, 594, 'mm'],
  A3: [297, 420, 'mm'],
  A4: [210, 297, 'mm'],
  A5: [148, 210, 'mm'],
  A6: [105, 148, 'mm'],
  LETTER: [8.5, 11, 'in'],
  LEGAL: [8.5, 14, 'in'],
  LEDGER: [17, 11, 'in'],
  TABLOID: [11, 17, 'in'],
  OFICIO: [216, 330, 'mm'],
});

/** Remove acentos e normaliza o nome do formato ("Ofício" → "OFICIO"). */
function normalizeFormatName(name: string): string {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** Resolve um nome de formato para [largura, altura] em pontos (retrato), ou null. */
export function resolvePageSize(format: string): [number, number] | null {
  const entry = PAGE_SIZES[normalizeFormatName(format)];
  if (!entry) return null;
  return [toPoints(entry[0], entry[2]), toPoints(entry[1], entry[2])];
}

export const DEFAULT_LIMITS: Readonly<ConversionLimits> = Object.freeze({
  maxHtmlSize: 10 * 1024 * 1024,
  maxCssSize: 5 * 1024 * 1024,
  maxDepth: 512,
  maxNodes: 500_000,
  maxPages: 2000,
  timeout: 30_000,
});

const DEFAULT_MARGIN: Required<MarginOptions> = { top: 20, right: 15, bottom: 20, left: 15 }; // mm

export const DEFAULT_OPTIONS = Object.freeze({
  format: 'A4',
  orientation: 'portrait' as Orientation,
  margin: DEFAULT_MARGIN,
  compress: true,
  background: 'white' as const,
});

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

function resolveMargin(margin: Measure | MarginOptions | undefined | null, fallback: Required<MarginOptions>): ResolvedMargins {
  let m: MarginOptions;
  if (margin === undefined || margin === null) m = fallback;
  else if (typeof margin === 'number' || typeof margin === 'string') m = { top: margin, right: margin, bottom: margin, left: margin };
  else if (typeof margin === 'object') m = margin;
  else throw new ConfigurationError('Opção "margin" inválida.', { margin });

  const out = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const side of SIDES) {
    const raw = m[side] ?? fallback[side] ?? 0;
    const pt = parseMeasure(raw, 'mm');
    if (pt === null || pt < 0) {
      throw new ConfigurationError(`Margem "${side}" inválida: ${JSON.stringify(raw)}.`, { side, value: raw });
    }
    out[side] = pt;
  }
  return out;
}

function resolveSize(options: ConvertOptions, cssPage: CssPageRule | null): { width: number; height: number; orientation: Orientation } {
  let width: number;
  let height: number;
  if (options.width !== undefined || options.height !== undefined) {
    const w = parseMeasure(options.width, 'mm');
    const h = parseMeasure(options.height, 'mm');
    if (w === null || h === null || !(w > 0) || !(h > 0)) {
      throw new ConfigurationError('Dimensões personalizadas de página inválidas.', {
        width: options.width,
        height: options.height,
      });
    }
    width = w;
    height = h;
  } else if (options.format !== undefined) {
    const size = resolvePageSize(options.format);
    if (!size) {
      throw new ConfigurationError(`Formato de página desconhecido: "${options.format}".`, {
        format: options.format,
        supported: Object.keys(PAGE_SIZES),
      });
    }
    [width, height] = size;
  } else if (cssPage?.size) {
    [width, height] = cssPage.size;
  } else {
    [width, height] = resolvePageSize(DEFAULT_OPTIONS.format)!;
  }

  const raw = String(options.orientation ?? cssPage?.orientation ?? DEFAULT_OPTIONS.orientation).toLowerCase();
  if (raw !== 'portrait' && raw !== 'landscape') {
    throw new ConfigurationError(`Orientação inválida: "${raw}". Use "portrait" ou "landscape".`);
  }
  const orientation: Orientation = raw;
  if (orientation === 'landscape' && width < height) [width, height] = [height, width];
  if (orientation === 'portrait' && width > height && options.format !== undefined) [width, height] = [height, width];
  return { width, height, orientation };
}

function resolveHeaderFooter(value: ConvertOptions['header'], name: string): ResolvedHeaderFooter | null {
  if (value === null || value === undefined || value === false) return null;
  const spec: HeaderFooterOptions | null = typeof value === 'string' ? { text: value } : typeof value === 'object' ? value : null;
  if (!spec || typeof spec.text !== 'string') {
    throw new ConfigurationError(`Opção "${name}" inválida: use uma string ou { text, fontSize, align, color }.`);
  }
  const align = spec.align ?? 'center';
  if (!['left', 'center', 'right'].includes(align)) {
    throw new ConfigurationError(`Alinhamento inválido em "${name}": "${align}".`);
  }
  const fontSize = parseMeasure(spec.fontSize ?? 9, 'pt');
  if (fontSize === null || fontSize <= 0) throw new ConfigurationError(`fontSize inválido em "${name}".`);
  return { text: spec.text, fontSize, align, color: spec.color ?? '#555555' };
}

/**
 * Resolve as opções finais.
 * Precedência: opções explícitas > regra CSS @page > padrões.
 */
export function normalizeOptions(options: ConvertOptions = {}, cssPage: CssPageRule | null = null): ResolvedConfig {
  if (options === null || typeof options !== 'object') {
    throw new ConfigurationError('As opções devem ser um objeto.');
  }
  const size = resolveSize(options, cssPage);

  let margin: ResolvedMargins;
  if (options.margin !== undefined) {
    margin = resolveMargin(options.margin, DEFAULT_MARGIN);
  } else if (cssPage?.margin) {
    margin = { ...resolveMargin(DEFAULT_MARGIN, DEFAULT_MARGIN), ...cssPage.margin };
  } else {
    margin = resolveMargin(DEFAULT_MARGIN, DEFAULT_MARGIN);
  }

  const contentWidth = size.width - margin.left - margin.right;
  const contentHeight = size.height - margin.top - margin.bottom;
  if (contentWidth <= 0 || contentHeight <= 0) {
    throw new ConfigurationError('As margens não deixam área útil na página.', { size, margin });
  }

  const limits: ConversionLimits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  for (const [key, val] of Object.entries(limits)) {
    if (typeof val !== 'number' || val < 0 || Number.isNaN(val)) {
      throw new ConfigurationError(`Limite "${key}" inválido.`, { key, value: val });
    }
  }

  const background = options.background ?? DEFAULT_OPTIONS.background;
  if (background !== 'white' && background !== 'transparent') {
    throw new ConfigurationError('Opção "background" deve ser "white" ou "transparent".');
  }

  return {
    pageWidth: size.width,
    pageHeight: size.height,
    orientation: size.orientation,
    margin,
    contentWidth,
    contentHeight,
    compress: options.compress ?? DEFAULT_OPTIONS.compress,
    background,
    header: resolveHeaderFooter(options.header, 'header'),
    footer: resolveHeaderFooter(options.footer, 'footer'),
    metadata: { ...(options.metadata ?? {}) },
    limits,
  };
}
