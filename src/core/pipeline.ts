/**
 * Pipeline de renderização:
 *
 *   HTML → parse → CSS (UA + <style> + css do usuário) → @page/configuração
 *        → cascata e estilos computados → layout → paginação
 *        → renderização gráfica → PDF
 *
 * Cada etapa recebe e devolve estruturas bem definidas; o tempo de cada uma
 * é medido e o prazo (timeout) é verificado entre e dentro das etapas.
 */

import { performance } from 'node:perf_hooks';
import { parseHTML } from '../html/parser.ts';
import { parseStylesheet, mediaMatchesPrint } from '../css/parser.ts';
import { tokenizeCSS } from '../css/tokenizer.ts';
import { RuleIndex } from '../css/cascade.ts';
import { computeStyles } from '../css/computed-style.ts';
import { USER_AGENT_CSS } from '../css/user-agent.ts';
import { extractPageRule } from '../css/page-rules.ts';
import { normalizeOptions } from './configuration.ts';
import { FontManager } from '../fonts/font-manager.ts';
import { layoutDocument } from '../layout/layout-engine.ts';
import { paginate } from '../pagination/pagination-engine.ts';
import { renderPages } from '../graphics/renderer.ts';
import { drawHeadersAndFooters } from '../pagination/headers-footers.ts';
import { PdfDocumentBuilder } from '../pdf/pdf-document.ts';
import { ConfigurationError, LimitExceededError, ConversionTimeoutError } from './errors.ts';
import { DEFAULT_LIMITS } from './configuration.ts';
import type { Stylesheet, PageRule } from '../css/parser.ts';
import type { ConversionLimits, ConversionResult, ConvertInput, ResolvedConfig, TimedStage } from './options.ts';
import type { PipelineStage } from './errors.ts';
import type { DocumentNode, ElementNode } from '../html/dom-node.ts';
import type { ComputedStyle } from '../css/types.ts';
import type { LayoutResult } from '../layout/layout-engine.ts';
import type { PaginationResult } from '../pagination/pagination-engine.ts';

/** Estruturas intermediárias expostas para testes e depuração. */
export interface PipelineDebug {
  document: DocumentNode;
  styles: Map<ElementNode, ComputedStyle>;
  layout: LayoutResult;
  pagination: PaginationResult;
  config: ResolvedConfig;
}

export interface PipelineResult extends ConversionResult {
  debug: PipelineDebug;
}

let uaSheetCache: Stylesheet | null = null;
function userAgentSheet(): Stylesheet {
  if (!uaSheetCache) uaSheetCache = parseStylesheet(USER_AGENT_CSS);
  return uaSheetCache;
}

/** Executa o pipeline completo. */
export function runPipeline({ html, css = '', options = {} }: ConvertInput): PipelineResult {
  const timings: Partial<Record<TimedStage, number>> = {};
  const warnings = new Set<string>();
  const warn = (msg: string): void => {
    warnings.add(msg);
  };
  const t0 = performance.now();
  const limits: ConversionLimits = { ...DEFAULT_LIMITS, ...(options?.limits ?? {}) };
  const deadline = limits.timeout > 0 ? t0 + limits.timeout : Infinity;
  const checkDeadline = (stage: PipelineStage): void => {
    if (performance.now() > deadline) throw new ConversionTimeoutError(limits.timeout, stage);
  };
  let stageStart = t0;
  const mark = (stage: Exclude<TimedStage, 'total'>): void => {
    const now = performance.now();
    timings[stage] = Math.round((now - stageStart) * 1000) / 1000;
    stageStart = now;
    checkDeadline(stage);
  };

  // 0. Validação de entrada
  if (typeof html !== 'string') throw new ConfigurationError('A opção "html" deve ser uma string.');
  if (typeof css !== 'string') throw new ConfigurationError('A opção "css" deve ser uma string.');
  if (html.length > limits.maxHtmlSize) throw new LimitExceededError('maxHtmlSize', html.length, limits.maxHtmlSize, 'input');
  if (css.length > limits.maxCssSize) throw new LimitExceededError('maxCssSize', css.length, limits.maxCssSize, 'input');

  // 1. HTML
  const document = parseHTML(html, { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes });
  mark('html');

  // 2. CSS
  const index = new RuleIndex();
  const ua = userAgentSheet();
  index.addStylesheet(ua, 'ua');
  let order = ua.nextOrder;
  const pageRules: PageRule[] = [];
  const sources: string[] = [];
  for (const styleEl of document.findAll('style')) {
    const media = styleEl.getAttribute('media');
    if (media && !mediaMatchesPrint(tokenizeCSS(media))) continue;
    sources.push(styleEl.textContent);
  }
  if (css) sources.push(css);
  let cssSize = 0;
  for (const src of sources) {
    cssSize += src.length;
    if (cssSize > limits.maxCssSize) throw new LimitExceededError('maxCssSize', cssSize, limits.maxCssSize, 'css');
    const sheet = parseStylesheet(src, { startOrder: order });
    order = sheet.nextOrder;
    sheet.warnings.forEach(warn);
    index.addStylesheet(sheet, 'author');
    pageRules.push(...sheet.pageRules);
  }
  if (document.findAll('link').some((l) => (l.getAttribute('rel') ?? '').toLowerCase() === 'stylesheet')) {
    warn('<link rel="stylesheet"> é ignorado: recursos externos não são carregados. Use a opção "css".');
  }
  if (document.findAll('script').length) warn('Scripts nunca são executados; o HTML é tratado como documento estático.');
  mark('css');

  // 3. Configuração (opções explícitas > @page > padrões)
  const config = normalizeOptions(options, extractPageRule(pageRules));
  mark('configuration');

  // 4. Estilos computados
  const styles = computeStyles(document, index, {
    rootFontSize: 12,
    viewportWidth: config.contentWidth,
    viewportHeight: config.contentHeight,
  });
  mark('style');

  // 5. Layout
  const fonts = new FontManager();
  const layout = layoutDocument(document, styles, {
    fonts,
    contentWidth: config.contentWidth,
    warn,
    checkDeadline,
  });
  mark('layout');

  // 6. Paginação
  const pagination = paginate(layout.root, {
    pageContentHeight: config.contentHeight,
    maxPages: config.limits.maxPages,
    checkDeadline,
  });
  mark('pagination');

  // 7. Renderização gráfica
  const page = { width: config.pageWidth, height: config.pageHeight, margin: config.margin };
  const canvases = renderPages(layout.root, pagination, page);
  drawHeadersAndFooters(canvases, config, fonts);
  if (config.background === 'white') {
    // Fundo branco explícito: insere um retângulo no início de cada página.
    for (const c of canvases) c.ops.unshift({ op: 'rect', x: 0, y: 0, w: c.width, h: c.height, color: { r: 255, g: 255, b: 255, a: 1 } });
  }
  mark('render');

  // 8. PDF
  const metadata = { ...config.metadata };
  if (!metadata.title) {
    const title = document.find('title')?.textContent.trim();
    if (title) metadata.title = title;
  }
  const buffer = new PdfDocumentBuilder({ compress: config.compress }).build(canvases, metadata);
  mark('pdf');

  timings.total = Math.round((performance.now() - t0) * 1000) / 1000;
  return {
    buffer,
    pageCount: canvases.length,
    warnings: [...warnings],
    metrics: { timings, bytes: buffer.length },
    // Estruturas intermediárias (úteis para testes e depuração).
    debug: { document, styles, layout, pagination, config },
  };
}
