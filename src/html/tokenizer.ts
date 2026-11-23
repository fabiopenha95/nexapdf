/**
 * Tokenizador HTML.
 *
 * Implementação própria, inspirada na máquina de estados da especificação
 * WHATWG HTML (seção "Tokenization"), simplificada para documentos estáticos.
 *
 * Produz tokens:
 *   { type: 'doctype', data }
 *   { type: 'startTag', name, attributes: Map, selfClosing }
 *   { type: 'endTag', name }
 *   { type: 'text', data }
 *   { type: 'comment', data }
 *
 * O conteúdo de elementos "raw text" (script, style, textarea, title) é lido
 * literalmente até a tag de fechamento correspondente.
 */

import { decodeEntities } from './entities.ts';

export type HtmlToken =
  | { type: 'doctype'; data: string }
  | { type: 'startTag'; name: string; attributes: Map<string, string>; selfClosing: boolean }
  | { type: 'endTag'; name: string }
  | { type: 'text'; data: string }
  | { type: 'comment'; data: string };

export const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript']);
const ESCAPABLE_RAW = new Set(['textarea', 'title']);

const WS = /[\t\n\f\r ]/;

function isAsciiAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

export function* tokenize(input: string): Generator<HtmlToken> {
  const src = input.replace(/\r\n?/g, '\n');
  const len = src.length;
  let i = 0;
  let textStart = 0;

  function* flushText(end: number): Generator<HtmlToken> {
    if (end > textStart) yield { type: 'text', data: decodeEntities(src.slice(textStart, end)) };
  }

  while (i < len) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      i = len;
      break;
    }
    i = lt;
    const next = src[i + 1];

    // Comentário
    if (src.startsWith('<!--', i)) {
      yield* flushText(i);
      const end = src.indexOf('-->', i + 4);
      const data = end === -1 ? src.slice(i + 4) : src.slice(i + 4, end);
      i = end === -1 ? len : end + 3;
      textStart = i;
      yield { type: 'comment', data };
      continue;
    }

    // DOCTYPE, CDATA e outras declarações
    if (next === '!' || next === '?') {
      yield* flushText(i);
      const end = src.indexOf('>', i + 2);
      const body = end === -1 ? src.slice(i + 2) : src.slice(i + 2, end);
      i = end === -1 ? len : end + 1;
      textStart = i;
      if (/^doctype/i.test(body)) yield { type: 'doctype', data: body.slice(7).trim() };
      else if (body.startsWith('[CDATA[')) yield { type: 'text', data: body.slice(7).replace(/]]$/, '') };
      else yield { type: 'comment', data: body };
      continue;
    }

    // Tag de fechamento
    if (next === '/') {
      if (isAsciiAlpha(src[i + 2] ?? '')) {
        yield* flushText(i);
        let j = i + 2;
        while (j < len && !WS.test(src[j]) && src[j] !== '/' && src[j] !== '>') j++;
        const name = src.slice(i + 2, j).toLowerCase();
        const end = src.indexOf('>', j);
        i = end === -1 ? len : end + 1;
        textStart = i;
        yield { type: 'endTag', name };
        continue;
      }
      if (src[i + 2] === '>') {
        // "</>" é ignorado
        yield* flushText(i);
        i += 3;
        textStart = i;
        continue;
      }
      i++;
      continue;
    }

    // Tag de abertura
    if (isAsciiAlpha(next ?? '')) {
      yield* flushText(i);
      let j = i + 1;
      while (j < len && !WS.test(src[j]) && src[j] !== '/' && src[j] !== '>') j++;
      const name = src.slice(i + 1, j).toLowerCase();
      const attributes = new Map<string, string>();
      let selfClosing = false;

      // Atributos
      for (;;) {
        while (j < len && (WS.test(src[j]) || (src[j] === '/' && src[j + 1] !== '>'))) j++;
        if (j >= len) break;
        if (src[j] === '>') {
          j++;
          break;
        }
        if (src[j] === '/' && src[j + 1] === '>') {
          selfClosing = true;
          j += 2;
          break;
        }
        let k = j;
        // O primeiro caractere de um nome pode ser "=" (especificação HTML).
        if (src[k] === '=') k++;
        while (k < len && !WS.test(src[k]) && src[k] !== '/' && src[k] !== '>' && src[k] !== '=') k++;
        const attrName = src.slice(j, k).toLowerCase();
        j = k;
        while (j < len && WS.test(src[j])) j++;
        let value = '';
        if (src[j] === '=') {
          j++;
          while (j < len && WS.test(src[j])) j++;
          const q = src[j];
          if (q === '"' || q === "'") {
            const close = src.indexOf(q, j + 1);
            value = close === -1 ? src.slice(j + 1) : src.slice(j + 1, close);
            j = close === -1 ? len : close + 1;
          } else {
            let k2 = j;
            while (k2 < len && !WS.test(src[k2]) && src[k2] !== '>') k2++;
            value = src.slice(j, k2);
            j = k2;
          }
          value = decodeEntities(value);
        }
        // Atributos duplicados: prevalece o primeiro (especificação HTML).
        if (attrName && !attributes.has(attrName)) attributes.set(attrName, value);
      }

      i = j;
      textStart = i;
      yield { type: 'startTag', name, attributes, selfClosing };

      // Elementos de texto bruto: lê até </name
      if (RAW_TEXT_ELEMENTS.has(name) && !selfClosing) {
        const lower = src.toLowerCase();
        let search = i;
        let close = -1;
        for (;;) {
          close = lower.indexOf('</' + name, search);
          if (close === -1) break;
          const after = lower[close + 2 + name.length];
          if (after === undefined || after === '>' || after === '/' || WS.test(after)) break;
          search = close + 1;
        }
        const raw = close === -1 ? src.slice(i) : src.slice(i, close);
        if (raw) yield { type: 'text', data: ESCAPABLE_RAW.has(name) ? decodeEntities(raw) : raw };
        if (close === -1) {
          i = len;
        } else {
          const end = src.indexOf('>', close);
          i = end === -1 ? len : end + 1;
        }
        textStart = i;
        yield { type: 'endTag', name };
      }
      continue;
    }

    // "<" sem significado de marcação: faz parte do texto.
    i++;
  }
  yield* flushText(len);
}
