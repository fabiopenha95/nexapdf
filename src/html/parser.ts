/**
 * Construtor de árvore HTML.
 *
 * Implementação simplificada do algoritmo de construção de árvore da
 * especificação WHATWG, suficiente para HTML5 estático:
 *  - garante a estrutura html/head/body;
 *  - elementos vazios (void) não recebem filhos;
 *  - fechamentos implícitos (p, li, dt/dd, tr, td/th, thead/tbody/tfoot, option);
 *  - inserção implícita de <tbody> e <tr> em tabelas;
 *  - tags de fechamento sem abertura correspondente são ignoradas;
 *  - limites de profundidade e de quantidade de nós (proteção contra abuso).
 */

import { tokenize } from './tokenizer.ts';
import { DocumentNode, ElementNode, TextNode, CommentNode, NodeType } from './dom-node.ts';

export interface ParseHTMLOptions {
  /** Profundidade máxima de aninhamento. */
  maxDepth?: number;
  /** Quantidade máxima de nós. */
  maxNodes?: number;
}
import { LimitExceededError } from '../core/errors.ts';

export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

const HEAD_ELEMENTS = new Set(['title', 'meta', 'link', 'style', 'base', 'script', 'noscript']);

/** Elementos cuja abertura fecha um <p> aberto. */
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup',
  'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
]);

/** Elementos que delimitam o escopo de busca por fechamentos implícitos. */
const SCOPE_BOUNDARY = new Set(['html', 'body', 'table', 'td', 'th', 'caption', 'template']);
const LIST_SCOPE_BOUNDARY = new Set([...SCOPE_BOUNDARY, 'ul', 'ol']);
const TABLE_SECTIONS = new Set(['thead', 'tbody', 'tfoot']);

export function parseHTML(html: string, { maxDepth = 512, maxNodes = 500_000 }: ParseHTMLOptions = {}): DocumentNode {
  const document = new DocumentNode();
  const htmlEl = new ElementNode('html');
  const head = new ElementNode('head');
  const body = new ElementNode('body');
  document.appendChild(htmlEl);
  htmlEl.appendChild(head);
  htmlEl.appendChild(body);

  let inBody = false; // conteúdo já foi direcionado ao body
  let headRawTarget: ElementNode | null = null; // elemento do head que recebe texto bruto (style, title...)
  let skipLeadingNewline = false; // ignora a quebra de linha logo após <pre>
  const stack: ElementNode[] = [body]; // pilha de elementos abertos (dentro do body)
  let nodeCount = 3;

  const current = (): ElementNode => stack[stack.length - 1]!;

  function countNode() {
    if (++nodeCount > maxNodes) throw new LimitExceededError('maxNodes', nodeCount, maxNodes, 'html');
  }

  function hasInScope(tag: string, boundary: ReadonlySet<string> = SCOPE_BOUNDARY): boolean {
    for (let i = stack.length - 1; i >= 0; i--) {
      const name = stack[i]!.tagName;
      if (name === tag) return true;
      if (boundary.has(name)) return false;
    }
    return false;
  }

  function popUntil(tag: string): void {
    while (stack.length > 1) {
      const el = stack.pop()!;
      if (el.tagName === tag) return;
    }
  }

  function closeIfOpen(tag: string, boundary?: ReadonlySet<string>): void {
    if (hasInScope(tag, boundary)) popUntil(tag);
  }

  function insertElement(name: string, attributes: Map<string, string>, selfClosing: boolean): ElementNode {
    countNode();
    const el = new ElementNode(name, attributes);
    current().appendChild(el);
    if (!VOID_ELEMENTS.has(name) && !selfClosing) {
      stack.push(el);
      if (stack.length > maxDepth) throw new LimitExceededError('maxDepth', stack.length, maxDepth, 'html');
    }
    return el;
  }

  function appendText(data: string): void {
    const parent = current();
    const last = parent.children[parent.children.length - 1];
    if (last && last.type === NodeType.TEXT) {
      last.data += data;
    } else {
      countNode();
      parent.appendChild(new TextNode(data));
    }
  }

  /** Fechamentos e inserções implícitas antes de abrir `name`. */
  function prepareFor(name: string): void {
    if (CLOSES_P.has(name)) closeIfOpen('p');
    switch (name) {
      case 'li':
        closeIfOpen('li', LIST_SCOPE_BOUNDARY);
        break;
      case 'dt':
      case 'dd':
        closeIfOpen('dt');
        closeIfOpen('dd');
        break;
      case 'option':
        if (current().tagName === 'option') stack.pop();
        break;
      case 'thead':
      case 'tbody':
      case 'tfoot':
        for (const s of TABLE_SECTIONS) closeIfOpen(s, new Set(['table', 'html']));
        break;
      case 'tr': {
        closeIfOpen('tr', new Set(['table', 'thead', 'tbody', 'tfoot', 'html']));
        if (current().tagName === 'table') insertElement('tbody', new Map<string, string>(), false);
        break;
      }
      case 'td':
      case 'th': {
        closeIfOpen('td', new Set(['tr', 'table', 'html']));
        closeIfOpen('th', new Set(['tr', 'table', 'html']));
        const tag = current().tagName;
        if (tag === 'table') insertElement('tbody', new Map<string, string>(), false);
        if (TABLE_SECTIONS.has(current().tagName)) insertElement('tr', new Map<string, string>(), false);
        break;
      }
      default:
        break;
    }
  }

  for (const token of tokenize(html)) {
    switch (token.type) {
      case 'doctype':
        document.doctype = token.data;
        break;

      case 'comment':
        countNode();
        (inBody ? current() : head).appendChild(new CommentNode(token.data));
        break;

      case 'text': {
        if (headRawTarget) {
          headRawTarget.appendChild(new TextNode(token.data));
          break;
        }
        if (!inBody) {
          if (/^[\t\n\f\r ]*$/.test(token.data)) break; // espaço antes do body é descartado
          inBody = true;
        }
        let data = token.data;
        if (skipLeadingNewline) {
          // Uma quebra de linha logo após <pre> é ignorada (especificação HTML).
          if (data.startsWith('\n')) data = data.slice(1);
          skipLeadingNewline = false;
          if (!data) break;
        }
        appendText(data);
        break;
      }

      case 'startTag': {
        const { name, attributes, selfClosing } = token;
        if (name === 'html') {
          for (const [k, v] of attributes) if (!htmlEl.hasAttribute(k)) htmlEl.setAttribute(k, v);
          break;
        }
        if (name === 'head') break;
        if (name === 'body') {
          inBody = true;
          for (const [k, v] of attributes) if (!body.hasAttribute(k)) body.setAttribute(k, v);
          break;
        }
        if (!inBody && HEAD_ELEMENTS.has(name)) {
          countNode();
          const el = new ElementNode(name, attributes);
          head.appendChild(el);
          // Conteúdo bruto (style/title/script) chega como texto logo em seguida.
          if (!VOID_ELEMENTS.has(name) && !selfClosing) headRawTarget = el;
          break;
        }
        inBody = true;
        prepareFor(name);
        insertElement(name, attributes, selfClosing);
        skipLeadingNewline = name === 'pre' || name === 'listing' || name === 'textarea';
        break;
      }

      case 'endTag': {
        const { name } = token;
        skipLeadingNewline = false;
        if (headRawTarget && headRawTarget.tagName === name) {
          headRawTarget = null;
          break;
        }
        if (name === 'html' || name === 'body' || name === 'head') break;
        if (name === 'br') {
          // "</br>" é tratado como "<br>" pela especificação.
          inBody = true;
          insertElement('br', new Map<string, string>(), true);
          break;
        }
        // Procura o elemento aberto mais próximo com o mesmo nome.
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i]!.tagName === name) {
            stack.length = i;
            break;
          }
        }
        break;
      }
      default:
        break;
    }

  }

  return document;
}
