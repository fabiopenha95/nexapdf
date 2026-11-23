/**
 * Tokenizador CSS.
 *
 * Implementação própria baseada na especificação CSS Syntax Module Level 3
 * (seção 4, "Tokenization"), com simplificações documentadas:
 *  - "unicode-range" não é tokenizado de forma especial;
 *  - escapes são decodificados em identificadores e strings.
 *
 * Tipos de token:
 *   ident, function, at-keyword, hash, string, url, number, percentage,
 *   dimension, whitespace, colon, semicolon, comma, [ ] ( ) { }, delim, cdo, cdc
 */

import type { CSSToken } from './types.ts';

type Ch = string | undefined;

function isDigit(c: Ch): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}
function isHex(c: Ch): boolean {
  if (c === undefined) return false;
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
function isNameStart(c: Ch): boolean {
  if (c === undefined) return false;
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c.charCodeAt(0) >= 0x80;
}
function isName(c: Ch): boolean {
  return isNameStart(c) || isDigit(c) || c === '-';
}
function isWS(c: Ch): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
}

export function tokenizeCSS(input: string): CSSToken[] {
  const s = input.replace(/\r\n?|\f/g, '\n');
  const tokens: CSSToken[] = [];
  let i = 0;
  const n = s.length;

  const validEscape = (a: Ch, b: Ch): boolean => a === '\\' && b !== '\n' && b !== undefined;

  function startsIdent(a: Ch, b: Ch, c: Ch): boolean {
    if (a === '-') return isNameStart(b) || b === '-' || validEscape(b, c);
    if (isNameStart(a)) return true;
    return validEscape(a, b);
  }

  function startsNumber(a: Ch, b: Ch, c: Ch): boolean {
    if (a === '+' || a === '-') return isDigit(b) || (b === '.' && isDigit(c));
    if (a === '.') return isDigit(b);
    return isDigit(a);
  }

  function consumeEscape(): string {
    // i aponta para o caractere após "\"
    if (isHex(s[i])) {
      let hex = '';
      while (hex.length < 6 && isHex(s[i])) hex += s[i++];
      if (isWS(s[i])) i++;
      const cp = parseInt(hex, 16);
      return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '�' : String.fromCodePoint(cp);
    }
    if (i >= n) return '�';
    return s[i++]!;
  }

  function consumeName(): string {
    let out = '';
    while (i < n) {
      const c = s[i];
      if (isName(c)) {
        out += c;
        i++;
      } else if (validEscape(c, s[i + 1])) {
        i++;
        out += consumeEscape();
      } else break;
    }
    return out;
  }

  function consumeNumber(): { value: number; isInteger: boolean } {
    let repr = '';
    let isInteger = true;
    if (s[i] === '+' || s[i] === '-') repr += s[i++];
    while (isDigit(s[i])) repr += s[i++];
    if (s[i] === '.' && isDigit(s[i + 1])) {
      isInteger = false;
      repr += s[i++];
      while (isDigit(s[i])) repr += s[i++];
    }
    if ((s[i] === 'e' || s[i] === 'E') && (isDigit(s[i + 1]) || ((s[i + 1] === '+' || s[i + 1] === '-') && isDigit(s[i + 2])))) {
      isInteger = false;
      repr += s[i++];
      if (s[i] === '+' || s[i] === '-') repr += s[i++];
      while (isDigit(s[i])) repr += s[i++];
    }
    return { value: parseFloat(repr), isInteger };
  }

  function consumeString(quote: string): CSSToken {
    let out = '';
    i++;
    while (i < n) {
      const c = s[i];
      if (c === quote) {
        i++;
        return { type: 'string', value: out };
      }
      if (c === '\n') return { type: 'bad-string', value: out };
      if (c === '\\') {
        if (s[i + 1] === '\n') {
          i += 2;
          continue;
        }
        i++;
        out += consumeEscape();
        continue;
      }
      out += c;
      i++;
    }
    return { type: 'string', value: out };
  }

  function consumeUrl(): CSSToken {
    // i após "url("
    while (isWS(s[i])) i++;
    let out = '';
    while (i < n) {
      const c = s[i];
      if (c === ')') {
        i++;
        return { type: 'url', value: out };
      }
      if (isWS(c)) {
        while (isWS(s[i])) i++;
        if (s[i] === ')') {
          i++;
          return { type: 'url', value: out };
        }
        break;
      }
      if (c === '\\' && validEscape(c, s[i + 1])) {
        i++;
        out += consumeEscape();
        continue;
      }
      out += c;
      i++;
    }
    // url malformada: consome até ")"
    while (i < n && s[i] !== ')') i++;
    i++;
    return { type: 'bad-url', value: out };
  }

  function consumeIdentLike(): CSSToken {
    const name = consumeName();
    if (name.toLowerCase() === 'url' && s[i] === '(') {
      i++;
      let j = i;
      while (isWS(s[j])) j++;
      if (s[j] === '"' || s[j] === "'") {
        return { type: 'function', value: name };
      }
      return consumeUrl();
    }
    if (s[i] === '(') {
      i++;
      return { type: 'function', value: name };
    }
    return { type: 'ident', value: name };
  }

  while (i < n) {
    const c = s[i];

    // Comentários
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (isWS(c)) {
      while (isWS(s[i])) i++;
      tokens.push({ type: 'whitespace' });
      continue;
    }
    if (c === '"' || c === "'") {
      tokens.push(consumeString(c));
      continue;
    }
    if (c === '#') {
      if (isName(s[i + 1]) || validEscape(s[i + 1], s[i + 2])) {
        i++;
        const isId = startsIdent(s[i], s[i + 1], s[i + 2]);
        tokens.push({ type: 'hash', value: consumeName(), isId });
      } else {
        tokens.push({ type: 'delim', value: c });
        i++;
      }
      continue;
    }
    if (startsNumber(c, s[i + 1], s[i + 2])) {
      const num = consumeNumber();
      if (startsIdent(s[i], s[i + 1], s[i + 2])) {
        tokens.push({ type: 'dimension', value: num.value, unit: consumeName().toLowerCase(), isInteger: num.isInteger });
      } else if (s[i] === '%') {
        i++;
        tokens.push({ type: 'percentage', value: num.value });
      } else {
        tokens.push({ type: 'number', value: num.value, isInteger: num.isInteger });
      }
      continue;
    }
    if (c === '-' && s[i + 1] === '-' && s[i + 2] === '>') {
      tokens.push({ type: 'cdc' });
      i += 3;
      continue;
    }
    if (c === '<' && s.startsWith('<!--', i)) {
      tokens.push({ type: 'cdo' });
      i += 4;
      continue;
    }
    if (startsIdent(c, s[i + 1], s[i + 2])) {
      tokens.push(consumeIdentLike());
      continue;
    }
    if (c === '@') {
      i++;
      if (startsIdent(s[i], s[i + 1], s[i + 2])) {
        tokens.push({ type: 'at-keyword', value: consumeName() });
      } else {
        tokens.push({ type: 'delim', value: '@' });
      }
      continue;
    }
    const simple: Record<string, CSSToken['type']> = { ':': 'colon', ';': 'semicolon', ',': 'comma', '[': '[', ']': ']', '(': '(', ')': ')', '{': '{', '}': '}' };
    const simpleType = simple[c];
    if (simpleType) {
      tokens.push({ type: simpleType } as CSSToken);
      i++;
      continue;
    }
    if (c === '\\') {
      if (validEscape(c, s[i + 1])) {
        tokens.push(consumeIdentLike());
        continue;
      }
    }
    tokens.push({ type: 'delim', value: c });
    i++;
  }
  return tokens;
}

/** Reconstrói texto a partir de tokens (útil para mensagens e valores brutos). */
export function serializeTokens(tokens: readonly CSSToken[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'whitespace': return ' ';
        case 'ident': return t.value;
        case 'function': return t.value + '(';
        case 'at-keyword': return '@' + t.value;
        case 'hash': return '#' + t.value;
        case 'string': return JSON.stringify(t.value);
        case 'url': return `url(${t.value})`;
        case 'number': return String(t.value);
        case 'percentage': return t.value + '%';
        case 'dimension': return t.value + t.unit;
        case 'colon': return ':';
        case 'semicolon': return ';';
        case 'comma': return ',';
        case 'delim': return t.value;
        default: return t.type;
      }
    })
    .join('');
}
