/**
 * NexaPDF — engine independente de renderização HTML/CSS para PDF.
 * Ponto de entrada público.
 */

export { NexaPDF } from './core/engine.ts';
export {
  NexaPDFError,
  ConfigurationError,
  ParseError,
  LimitExceededError,
  ConversionTimeoutError,
  RenderError,
} from './core/errors.ts';
export type { ErrorCode, PipelineStage } from './core/errors.ts';
export { PAGE_SIZES, DEFAULT_LIMITS } from './core/configuration.ts';
export type {
  ConvertOptions,
  ConvertInput,
  ConvertRequest,
  ConversionResult,
  ConversionMetrics,
  ConversionLimits,
  DocumentMetadata,
  HeaderFooterOptions,
  MarginOptions,
  Orientation,
  PageFormat,
  TimedStage,
} from './core/options.ts';
export type { Measure } from './layout/measurements.ts';

// APIs de baixo nível (experimentais até a 1.0).
export { parseHTML } from './html/parser.ts';
export type { ParseHTMLOptions } from './html/parser.ts';
export { parseStylesheet } from './css/parser.ts';
export type { Stylesheet } from './css/parser.ts';
export { toPoints, fromPoints } from './layout/measurements.ts';
