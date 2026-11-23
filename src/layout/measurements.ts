/**
 * Unidades e conversões.
 *
 * A unidade interna de layout da NexaPDF é o ponto tipográfico PDF (pt).
 *   1in = 72pt = 96px CSS  →  1px = 0,75pt
 *   1mm = 72 / 25,4 pt ≈ 2,8346457pt
 *
 * As conversões são feitas a partir de razões exatas (e não de constantes já
 * arredondadas) para evitar acúmulo de erro.
 */

export const PT_PER_IN = 72;
export const PX_PER_IN = 96;
export const MM_PER_IN = 25.4;

export const PT_PER_PX = PT_PER_IN / PX_PER_IN; // 0.75
export const PT_PER_MM = PT_PER_IN / MM_PER_IN; // 2.834645669...
export const PT_PER_CM = PT_PER_MM * 10;
export const PT_PER_PC = 12; // 1 pica = 12pt
export const PT_PER_Q = PT_PER_MM / 4; // quarter-millimeter

export type AbsoluteUnit = 'pt' | 'px' | 'in' | 'mm' | 'cm' | 'pc' | 'q';

/** Unidades absolutas suportadas → fator para pontos. */
export const ABSOLUTE_UNITS: Readonly<Record<AbsoluteUnit, number>> = Object.freeze({
  pt: 1,
  px: PT_PER_PX,
  in: PT_PER_IN,
  mm: PT_PER_MM,
  cm: PT_PER_CM,
  pc: PT_PER_PC,
  q: PT_PER_Q,
});

export function isAbsoluteUnit(unit: string): unit is AbsoluteUnit {
  return Object.prototype.hasOwnProperty.call(ABSOLUTE_UNITS, unit);
}

/** Converte um valor numérico em uma unidade absoluta para pontos. */
export function toPoints(value: number, unit: string): number {
  const u = String(unit).toLowerCase();
  if (!isAbsoluteUnit(u)) {
    throw new TypeError(`Unidade absoluta desconhecida: "${unit}"`);
  }
  return value * ABSOLUTE_UNITS[u];
}

/** Converte pontos para outra unidade absoluta. */
export function fromPoints(points: number, unit: string): number {
  return points / toPoints(1, unit);
}

/** Medida aceita nas opções: número (na unidade padrão) ou string com unidade. */
export type Measure = number | string;

/**
 * Interpreta uma medida de configuração: número (na unidade padrão) ou string
 * como "20mm", "1in", "72pt", "2.5cm", "96px". Retorna null se inválida.
 */
export function parseMeasure(input: unknown, defaultUnit: AbsoluteUnit = 'mm'): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return toPoints(input, defaultUnit);
  }
  if (typeof input === 'string') {
    const m = /^\s*(-?\d*\.?\d+)\s*([a-zA-Z]*)\s*$/.exec(input);
    if (m) {
      const unit = m[2] ? m[2].toLowerCase() : defaultUnit;
      if (isAbsoluteUnit(unit)) return toPoints(parseFloat(m[1]!), unit);
    }
  }
  return null;
}

/** Arredonda para uma precisão fixa (usado apenas na serialização). */
export function roundTo(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
