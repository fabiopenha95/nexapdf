/**
 * Erros tipados da NexaPDF.
 *
 * Todo erro lançado pela engine é uma instância de NexaPDFError e carrega:
 *  - code:    identificador estável, adequado para tratamento programático;
 *  - stage:   etapa do pipeline em que ocorreu (quando conhecida);
 *  - details: objeto com contexto adicional (limites, valores recebidos etc.).
 */

export type ErrorCode =
  | 'NEXAPDF_ERROR'
  | 'INVALID_CONFIGURATION'
  | 'PARSE_ERROR'
  | 'LIMIT_EXCEEDED'
  | 'CONVERSION_TIMEOUT'
  | 'RENDER_ERROR';

export type PipelineStage =
  | 'input'
  | 'configuration'
  | 'html'
  | 'css'
  | 'style'
  | 'layout'
  | 'pagination'
  | 'render'
  | 'pdf'
  | 'parse';

export interface NexaPDFErrorOptions {
  code?: ErrorCode;
  stage?: PipelineStage | null;
  details?: Record<string, unknown> | null;
  cause?: unknown;
}

export class NexaPDFError extends Error {
  readonly code: ErrorCode;
  readonly stage: PipelineStage | null;
  readonly details: Record<string, unknown> | null;

  constructor(message: string, { code = 'NEXAPDF_ERROR', stage = null, details = null, cause }: NexaPDFErrorOptions = {}) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'NexaPDFError';
    this.code = code;
    this.stage = stage;
    this.details = details;
  }
}

export class ConfigurationError extends NexaPDFError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'INVALID_CONFIGURATION', stage: 'configuration', details: details ?? null });
    this.name = 'ConfigurationError';
  }
}

export class ParseError extends NexaPDFError {
  constructor(message: string, { stage = 'parse', details }: { stage?: PipelineStage; details?: Record<string, unknown> } = {}) {
    super(message, { code: 'PARSE_ERROR', stage, details: details ?? null });
    this.name = 'ParseError';
  }
}

export class LimitExceededError extends NexaPDFError {
  constructor(limit: string, actual: number, max: number, stage: PipelineStage | null = null) {
    super(`Limite "${limit}" excedido: ${actual} (máximo permitido: ${max}).`, {
      code: 'LIMIT_EXCEEDED',
      stage,
      details: { limit, actual, max },
    });
    this.name = 'LimitExceededError';
  }
}

export class ConversionTimeoutError extends NexaPDFError {
  constructor(timeoutMs: number, stage: PipelineStage) {
    super(`Tempo limite de conversão excedido (${timeoutMs} ms) na etapa "${stage}".`, {
      code: 'CONVERSION_TIMEOUT',
      stage,
      details: { timeoutMs },
    });
    this.name = 'ConversionTimeoutError';
  }
}

export class RenderError extends NexaPDFError {
  constructor(
    message: string,
    { stage = 'render', details, cause }: { stage?: PipelineStage; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { code: 'RENDER_ERROR', stage, details: details ?? null, cause });
    this.name = 'RenderError';
  }
}
