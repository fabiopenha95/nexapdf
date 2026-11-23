/**
 * Decodificação de referências de caracteres HTML.
 *
 * Suporta referências numéricas (decimais e hexadecimais) e um subconjunto de
 * entidades nomeadas, com cobertura completa de Latin-1 (inclui toda a
 * acentuação do português) e da pontuação tipográfica comum.
 * Entidades desconhecidas são mantidas literalmente, como fazem os navegadores.
 */

const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§',
  uml: '¨', copy: '©', ordf: 'ª', laquo: '«', not: '¬', shy: '­', reg: '®',
  macr: '¯', deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ',
  para: '¶', middot: '·', cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼',
  frac12: '½', frac34: '¾', iquest: '¿',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í',
  Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô',
  Otilde: 'Õ', Ouml: 'Ö', times: '×', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û',
  Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í',
  icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô',
  otilde: 'õ', ouml: 'ö', divide: '÷', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û',
  uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌', zwj: '‍',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
  bdquo: '„', dagger: '†', Dagger: '‡', bull: '•', hellip: '…', permil: '‰', prime: '′',
  Prime: '″', lsaquo: '‹', rsaquo: '›', euro: '€', trade: '™', larr: '←', rarr: '→',
  uarr: '↑', darr: '↓', harr: '↔', minus: '−', le: '≤', ge: '≥', ne: '≠', infin: '∞',
};

/** Substituições do intervalo 0x80–0x9F definidas pela especificação HTML. */
const C1_REPLACEMENTS: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function codePointToString(cp: number): string {
  const mapped = C1_REPLACEMENTS[cp];
  if (mapped !== undefined) cp = mapped;
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
  return String.fromCodePoint(cp);
}

const ENTITY_RE = /&(?:#(\d{1,7});?|#[xX]([0-9a-fA-F]{1,6});?|([A-Za-z][A-Za-z0-9]{1,31});?)/g;

export function decodeEntities(text: string): string {
  if (text.indexOf('&') === -1) return text;
  return text.replace(ENTITY_RE, (match: string, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (dec !== undefined) return codePointToString(parseInt(dec, 10));
    if (hex !== undefined) return codePointToString(parseInt(hex, 16));
    if (name !== undefined && Object.prototype.hasOwnProperty.call(NAMED, name)) return NAMED[name]!;
    return match;
  });
}

export const NAMED_ENTITIES = Object.freeze({ ...NAMED });
