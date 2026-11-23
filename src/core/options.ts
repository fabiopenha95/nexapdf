/**
 * Tipos públicos de configuração da NexaPDF.
 */

import type { Measure } from '../layout/measurements.ts';

/** Formatos de página conhecidos (sem diferenciar maiúsculas/acentos). */
export type PageFormat =
  | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
  | 'Letter' | 'Legal' | 'Ledger' | 'Tabloid' | 'Ofício' | 'Oficio'
  | (string & {});

export type Orientation = 'portrait' | 'landscape';

export interface MarginOptions {
  top?: Measure;
  right?: Measure;
  bottom?: Measure;
  left?: Measure;
}

export interface HeaderFooterOptions {
  /** Texto; aceita os marcadores {{page}} e {{pages}}. */
  text: string;
  align?: 'left' | 'center' | 'right';
  /** Tamanho da fonte (número em pt ou string com unidade). */
  fontSize?: Measure;
  /** Cor CSS, ex.: "#555", "gray". */
  color?: string;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string | string[];
  creator?: string;
  creationDate?: Date | string | number;
  modDate?: Date | string | number;
}

export interface ConversionLimits {
  /** Tamanho máximo do HTML (caracteres). */
  maxHtmlSize: number;
  /** Tamanho máximo somado do CSS (caracteres). */
  maxCssSize: number;
  /** Profundidade máxima da árvore DOM. */
  maxDepth: number;
  /** Quantidade máxima de nós DOM. */
  maxNodes: number;
  /** Quantidade máxima de páginas. */
  maxPages: number;
  /** Tempo máximo de conversão em ms (0 desativa). */
  timeout: number;
}

export interface ConvertOptions {
  format?: PageFormat;
  /** Largura personalizada (número em mm ou string com unidade). */
  width?: Measure;
  /** Altura personalizada (número em mm ou string com unidade). */
  height?: Measure;
  orientation?: Orientation;
  /** Número (todas as margens, em mm), string com unidade ou objeto por lado. */
  margin?: Measure | MarginOptions;
  compress?: boolean;
  background?: 'white' | 'transparent';
  header?: string | HeaderFooterOptions | null | false;
  footer?: string | HeaderFooterOptions | null | false;
  metadata?: DocumentMetadata;
  limits?: Partial<ConversionLimits>;
}

/** Margens resolvidas, em pontos. */
export interface ResolvedMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResolvedHeaderFooter {
  text: string;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  color: string;
}

/** Configuração final, com todas as medidas em pontos PDF. */
export interface ResolvedConfig {
  pageWidth: number;
  pageHeight: number;
  orientation: Orientation;
  margin: ResolvedMargins;
  contentWidth: number;
  contentHeight: number;
  compress: boolean;
  background: 'white' | 'transparent';
  header: ResolvedHeaderFooter | null;
  footer: ResolvedHeaderFooter | null;
  metadata: DocumentMetadata;
  limits: ConversionLimits;
}

/** Regra @page consolidada (medidas em pontos). */
export interface CssPageRule {
  size: [number, number] | null;
  orientation: Orientation | null;
  margin: Partial<ResolvedMargins> | null;
}

/** Etapas medidas do pipeline. */
export type TimedStage = 'html' | 'css' | 'configuration' | 'style' | 'layout' | 'pagination' | 'render' | 'pdf' | 'total';

export interface ConversionMetrics {
  /** Tempo de cada etapa, em milissegundos. */
  timings: Partial<Record<TimedStage, number>>;
  /** Tamanho do PDF em bytes. */
  bytes: number;
}

/** Entrada de uma conversão. */
export interface ConvertInput {
  /** Documento HTML (sempre tratado como estático; scripts não são executados). */
  html: string;
  /** CSS adicional, aplicado após os <style> do documento. */
  css?: string;
  options?: ConvertOptions;
}

export interface ConvertRequest extends ConvertInput {
  /** Omitido ou "buffer": apenas em memória. Caminho: grava o arquivo. */
  output?: 'buffer' | (string & {});
}

export interface ConversionResult {
  /** O arquivo PDF completo. */
  buffer: Buffer;
  pageCount: number;
  /** Avisos sobre recursos ignorados ou não suportados. */
  warnings: string[];
  metrics: ConversionMetrics;
  /** Caminho gravado, quando `output` é um caminho de arquivo. */
  path?: string;
}
