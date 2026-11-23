/**
 * Métricas das fontes padrão do PDF (Standard 14) usadas na Fase 1.
 *
 * Fonte: arquivos AFM (Adobe Font Metrics) públicos das fontes Core 14,
 * distribuídos pela Adobe para uso livre. As larguras estão em unidades de
 * 1/1000 em e indexadas pelo byte WinAnsi (0x20–0xFF).
 *
 * Helvetica-Oblique e Helvetica-BoldOblique têm as mesmas larguras das
 * variantes retas; o mesmo vale para todas as variantes de Courier (600).
 *
 * As métricas verticais (ascent/descent/lineGap) seguem os valores das fontes
 * métricamente compatíveis usadas pelos navegadores (Arial / Courier New),
 * para que line-height: normal produza alturas de linha semelhantes.
 */

/** Métricas de uma face padrão (unidades verticais em em; larguras em 1/1000 em). */
export interface StandardFontMetrics {
  baseFont: string;
  widths: Uint16Array;
  ascent: number;
  descent: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
  underlinePosition: number;
  underlineThickness: number;
  bbox: [number, number, number, number];
  italicAngle: number;
  flags: number;
}

function table(rows: number[][]): Uint16Array {
  const out = new Uint16Array(256);
  let code = 0x20;
  for (const row of rows) for (const w of row) out[code++] = w;
  return out;
}

const rep = (v: number, n: number): number[] => Array(n).fill(v);

// prettier-ignore
const HELVETICA = table([
  // 0x20–0x3F
  [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
   556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556],
  // 0x40–0x5F
  [1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
   667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556],
  // 0x60–0x7F
  [333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
   556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350],
  // 0x80–0x9F
  [556, 350, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350,
   350, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 350, 500, 667],
  // 0xA0–0xBF
  [278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
   400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611],
  // 0xC0–0xDF
  [...rep(667, 6), 1000, 722, ...rep(667, 4), ...rep(278, 4),
   722, 722, ...rep(778, 5), 584, 778, ...rep(722, 4), 667, 667, 611],
  // 0xE0–0xFF
  [...rep(556, 6), 889, 500, ...rep(556, 4), ...rep(278, 4),
   556, 556, ...rep(556, 5), 584, 611, ...rep(556, 4), 500, 556, 500],
]);

// prettier-ignore
const HELVETICA_BOLD = table([
  // 0x20–0x3F
  [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
   556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611],
  // 0x40–0x5F
  [975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
   667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556],
  // 0x60–0x7F
  [333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
   611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 350],
  // 0x80–0x9F
  [556, 350, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350,
   350, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 350, 500, 667],
  // 0xA0–0xBF
  [278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
   400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611],
  // 0xC0–0xDF
  [...rep(722, 6), 1000, 722, ...rep(667, 4), ...rep(278, 4),
   722, 722, ...rep(778, 5), 584, 778, ...rep(722, 4), 667, 667, 611],
  // 0xE0–0xFF
  [...rep(556, 6), 889, 556, ...rep(556, 4), ...rep(278, 4),
   611, 611, ...rep(611, 5), 584, 611, ...rep(611, 4), 556, 611, 556],
]);

const COURIER = table([rep(600, 224)]);

const SANS_VERTICAL = { ascent: 0.905, descent: 0.212, lineGap: 0.033, capHeight: 0.718, xHeight: 0.523, underlinePosition: -0.106, underlineThickness: 0.073 };
const MONO_VERTICAL = { ascent: 0.833, descent: 0.3, lineGap: 0, capHeight: 0.571, xHeight: 0.423, underlinePosition: -0.1, underlineThickness: 0.05 };

export const STANDARD_FONTS: Readonly<Record<string, StandardFontMetrics>> = Object.freeze({
  Helvetica: { baseFont: 'Helvetica', widths: HELVETICA, ...SANS_VERTICAL, bbox: [-166, -225, 1000, 931], italicAngle: 0, flags: 32 },
  'Helvetica-Bold': { baseFont: 'Helvetica-Bold', widths: HELVETICA_BOLD, ...SANS_VERTICAL, bbox: [-170, -228, 1003, 962], italicAngle: 0, flags: 32 },
  'Helvetica-Oblique': { baseFont: 'Helvetica-Oblique', widths: HELVETICA, ...SANS_VERTICAL, bbox: [-170, -225, 1116, 931], italicAngle: -12, flags: 96 },
  'Helvetica-BoldOblique': { baseFont: 'Helvetica-BoldOblique', widths: HELVETICA_BOLD, ...SANS_VERTICAL, bbox: [-174, -228, 1114, 962], italicAngle: -12, flags: 96 },
  Courier: { baseFont: 'Courier', widths: COURIER, ...MONO_VERTICAL, bbox: [-23, -250, 715, 805], italicAngle: 0, flags: 33 },
  'Courier-Bold': { baseFont: 'Courier-Bold', widths: COURIER, ...MONO_VERTICAL, bbox: [-113, -250, 749, 801], italicAngle: 0, flags: 33 },
  'Courier-Oblique': { baseFont: 'Courier-Oblique', widths: COURIER, ...MONO_VERTICAL, bbox: [-27, -250, 849, 805], italicAngle: -12, flags: 97 },
  'Courier-BoldOblique': { baseFont: 'Courier-BoldOblique', widths: COURIER, ...MONO_VERTICAL, bbox: [-57, -250, 869, 801], italicAngle: -12, flags: 97 },
});
