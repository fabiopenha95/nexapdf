/**
 * Contexto de formatação inline (CSS 2.1 §9.4.2, CSS Text Level 3).
 *
 * Etapas:
 *  1. segmentação: processamento de espaços (white-space), text-transform e
 *     divisão em palavras, espaços e quebras forçadas, já medidos com as
 *     métricas reais da fonte;
 *  2. quebra de linhas gulosa (greedy) nas oportunidades de quebra (espaços);
 *  3. métricas verticais de cada linha (strut + meia-entrelinha por trecho);
 *  4. alinhamento horizontal (left/right/center/justify) e geração de fragmentos.
 *
 * Limitações (Fase 1): sem hifenização, sem quebra após hífen, sem bidi,
 * sem vertical-align em trechos inline, sem caixas inline-block.
 */

import { measureText, resolveLineHeight } from '../fonts/text-measurement.ts';
import type { FontFace, FontManager } from '../fonts/font-manager.ts';
import type { ComputedStyle } from '../css/types.ts';
import type { Color } from '../graphics/colors.ts';
import type { Fragment, InlineItem, IntrinsicSizes, LineBox } from './types.ts';

const EPS = 0.01;

interface Segment {
  kind: 'word' | 'space' | 'break';
  text: string;
  style: ComputedStyle;
  face: FontFace;
  bg: Color | null;
  width: number;
  /** Espaço que é oportunidade de quebra. */
  opportunity: boolean;
  collapsible: boolean;
  hidden: boolean;
}

type Unit =
  | { type: 'break'; seg: Segment }
  | { type: 'space'; seg: Segment }
  | { type: 'unit'; segs: Segment[]; width: number };

type WordUnit = Extract<Unit, { type: 'unit' }>;

function wsMode(ws: ComputedStyle['white-space']): { collapse: boolean; keepNewlines: boolean; wrap: boolean } {
  return {
    collapse: ws === 'normal' || ws === 'nowrap' || ws === 'pre-line',
    keepNewlines: ws === 'pre' || ws === 'pre-wrap' || ws === 'pre-line' || ws === 'break-spaces',
    wrap: ws !== 'nowrap' && ws !== 'pre',
  };
}

function applyTransform(text: string, transform: ComputedStyle['text-transform'], state: { wordStart: boolean }): string {
  switch (transform) {
    case 'uppercase': return text.toLocaleUpperCase('pt-BR');
    case 'lowercase': return text.toLocaleLowerCase('pt-BR');
    case 'capitalize': {
      let out = '';
      for (const ch of text) {
        out += state.wordStart && /\p{L}/u.test(ch) ? ch.toLocaleUpperCase('pt-BR') : ch;
        state.wordStart = /\s/.test(ch);
      }
      return out;
    }
    default:
      return text;
  }
}

/** Converte itens inline em segmentos medidos. */
export function segmentInline(items: readonly InlineItem[], fonts: FontManager): Segment[] {
  const segs: Segment[] = [];
  let prevSpace = true; // início de bloco: espaços iniciais colapsáveis são removidos
  let column = 0;
  const tState = { wordStart: true };

  const breakSeg = (style: ComputedStyle, face: FontFace): Segment => ({
    kind: 'break', text: '', style, face, bg: null, width: 0, opportunity: false, collapsible: false, hidden: false,
  });

  for (const item of items) {
    const style = item.style;
    if (item.type === 'br') {
      segs.push(breakSeg(style, fonts.resolve(style)));
      prevSpace = true;
      column = 0;
      continue;
    }
    const mode = wsMode(style['white-space']);
    const face = fonts.resolve(style);
    const fs = style['font-size'];
    const ls = style['letter-spacing'] || 0;
    const wordSpacing = style['word-spacing'] || 0;
    let text = item.text;

    if (mode.collapse) {
      if (mode.keepNewlines) text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
      else text = text.replace(/[\t\n\r\f]/g, ' ');
      text = text.replace(/ {2,}/g, ' ');
    } else {
      // Tabulações expandidas para múltiplos de 8 colunas.
      let out = '';
      for (const ch of text) {
        if (ch === '\t') {
          const n = 8 - (column % 8);
          out += ' '.repeat(n);
          column += n;
        } else {
          out += ch;
          column = ch === '\n' ? 0 : column + 1;
        }
      }
      text = out;
    }
    text = applyTransform(text, style['text-transform'], tState);

    const push = (kind: 'word' | 'space', t: string): void => {
      if (!t) return;
      const width = kind === 'space' ? measureText(t, face, fs, ls) + wordSpacing * t.length : measureText(t, face, fs, ls);
      segs.push({
        kind,
        text: t,
        style,
        face,
        bg: item.bg,
        width,
        opportunity: kind === 'space' && mode.wrap,
        collapsible: mode.collapse,
        hidden: !!item.hidden,
      });
    };

    // Divide em linhas (quebras forçadas) e, depois, em palavras/espaços.
    const lines = mode.keepNewlines ? text.split('\n') : [text];
    lines.forEach((line, li) => {
      if (li > 0) {
        segs.push(breakSeg(style, face));
        prevSpace = true;
      }
      const re = / +|[^ ]+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const t = m[0];
        if (t[0] === ' ') {
          if (mode.collapse) {
            if (prevSpace) continue;
            push('space', ' ');
            prevSpace = true;
          } else {
            push('space', t);
            prevSpace = false;
          }
        } else {
          push('word', t);
          prevSpace = false;
        }
      }
    });
  }
  return segs;
}

/** Agrupa segmentos em unidades inquebráveis separadas por oportunidades de quebra. */
function toUnits(segs: readonly Segment[]): Unit[] {
  const units: Unit[] = [];
  let cur: WordUnit | null = null;
  for (const s of segs) {
    if (s.kind === 'break') {
      cur = null;
      units.push({ type: 'break', seg: s });
    } else if (s.kind === 'space' && s.opportunity) {
      cur = null;
      units.push({ type: 'space', seg: s });
    } else {
      if (!cur) {
        cur = { type: 'unit', segs: [], width: 0 };
        units.push(cur);
      }
      cur.segs.push(s);
      cur.width += s.width;
    }
  }
  return units;
}

/** Larguras intrínsecas mínima e máxima do conteúdo inline. */
export function inlineIntrinsicSizes(items: readonly InlineItem[], fonts: FontManager, indent = 0): IntrinsicSizes {
  const units = toUnits(segmentInline(items, fonts));
  let min = 0;
  let max = 0;
  let line = indent;
  let pendingSpace = 0;
  for (const u of units) {
    if (u.type === 'break') {
      max = Math.max(max, line);
      line = 0;
      pendingSpace = 0;
    } else if (u.type === 'space') {
      if (line > 0) pendingSpace += u.seg.width;
    } else {
      min = Math.max(min, u.width);
      line += pendingSpace + u.width;
      pendingSpace = 0;
    }
  }
  max = Math.max(max, line);
  return { min, max };
}

function canBreakWord(style: ComputedStyle): boolean {
  return (
    style['overflow-wrap'] === 'break-word' ||
    style['overflow-wrap'] === 'anywhere' ||
    style['word-break'] === 'break-all' ||
    style['word-break'] === 'break-word'
  );
}

/** Divide uma unidade longa em pedaços por caractere que caibam em `avail`. */
function splitUnit(unit: WordUnit, avail: number, firstAvail: number): WordUnit[] {
  const pieces: WordUnit[] = [];
  let cur: WordUnit = { type: 'unit', segs: [], width: 0 };
  let limit = firstAvail;
  for (const seg of unit.segs) {
    let buf = '';
    let bufW = 0;
    for (const ch of seg.text) {
      const w = measureText(ch, seg.face, seg.style['font-size'], seg.style['letter-spacing'] || 0);
      if (cur.width + bufW + w > limit + EPS && cur.width + bufW > 0) {
        if (buf) {
          cur.segs.push({ ...seg, text: buf, width: bufW });
          cur.width += bufW;
        }
        pieces.push(cur);
        cur = { type: 'unit', segs: [], width: 0 };
        limit = avail;
        buf = '';
        bufW = 0;
      }
      buf += ch;
      bufW += w;
    }
    if (buf) {
      cur.segs.push({ ...seg, text: buf, width: bufW });
      cur.width += bufW;
    }
  }
  if (cur.segs.length) pieces.push(cur);
  return pieces;
}

function strut(style: ComputedStyle, fonts: FontManager): { above: number; below: number } {
  const face = fonts.resolve(style);
  const fs = style['font-size'];
  const A = face.ascent * fs;
  const D = face.descent * fs;
  const lh = resolveLineHeight(style, face);
  const half = (lh - (A + D)) / 2;
  return { above: A + half, below: D + half };
}

export interface InlineContainer {
  style: ComputedStyle;
  /** x da área de conteúdo */
  x: number;
  /** y do topo da área de conteúdo */
  y: number;
  width: number;
}

interface RawLine {
  segs: Segment[];
  width: number;
  forced: boolean;
  breakSeg?: Segment;
}

/** Executa o layout inline e devolve as linhas posicionadas. */
export function layoutInline(items: readonly InlineItem[], container: InlineContainer, fonts: FontManager): { lines: LineBox[]; height: number } {
  const { style } = container;
  const segs = segmentInline(items, fonts);
  if (segs.length === 0) return { lines: [], height: 0 };
  const units = toUnits(segs);

  const indentRaw = style['text-indent'];
  const indent = typeof indentRaw === 'number' ? indentRaw : typeof indentRaw === 'object' ? (indentRaw.percent / 100) * container.width : 0;

  const raw: RawLine[] = [];
  let cur: { segs: Segment[]; width: number; pending: Segment[] } = { segs: [], width: 0, pending: [] };
  const availFor = (): number => container.width - (raw.length === 0 ? indent : 0);

  const finish = (forced: boolean, breakSeg?: Segment): void => {
    raw.push({ segs: cur.segs, width: cur.width, forced, breakSeg });
    cur = { segs: [], width: 0, pending: [] };
  };
  const place = (unit: WordUnit): void => {
    for (const p of cur.pending) {
      cur.segs.push(p);
      cur.width += p.width;
    }
    cur.pending = [];
    for (const s of unit.segs) cur.segs.push(s);
    cur.width += unit.width;
  };

  for (const u of units) {
    if (u.type === 'break') {
      finish(true, u.seg);
      continue;
    }
    if (u.type === 'space') {
      if (cur.segs.length === 0 && u.seg.collapsible) continue; // espaço no início da linha
      cur.pending.push(u.seg);
      continue;
    }
    const pendingW = cur.pending.reduce((a, s) => a + s.width, 0);
    if (cur.segs.length && cur.width + pendingW + u.width > availFor() + EPS) finish(false);
    const firstSeg = u.segs[0];
    if (u.width > availFor() + EPS && firstSeg && canBreakWord(firstSeg.style)) {
      const used = cur.segs.length ? cur.width + cur.pending.reduce((a, s) => a + s.width, 0) : 0;
      const pieces = splitUnit(u, container.width, availFor() - used);
      pieces.forEach((p, k) => {
        if (k > 0) finish(false);
        place(p);
      });
      continue;
    }
    place(u);
  }
  // Última linha. Um <br> final não gera linha extra (como nos navegadores).
  if (cur.segs.length) finish(false);
  if (raw.length === 0) return { lines: [], height: 0 };

  // Métricas verticais e alinhamento.
  const base = strut(style, fonts);
  const lines: LineBox[] = [];
  let y = container.y;
  const align = style['text-align'];
  raw.forEach((r, idx) => {
    let above = base.above;
    let below = base.below;
    const metricSegs = r.segs.length ? r.segs : r.breakSeg ? [r.breakSeg] : [];
    for (const s of metricSegs) {
      const st = strut(s.style, fonts);
      if (st.above > above) above = st.above;
      if (st.below > below) below = st.below;
    }
    const height = above + below;
    const first = idx === 0;
    const avail = container.width - (first ? indent : 0);
    const isLast = idx === raw.length - 1 || r.forced;
    let offset = first ? indent : 0;
    let extraPerSpace = 0;
    const free = avail - r.width;
    if (align === 'right' || align === 'end') offset += free;
    else if (align === 'center') offset += free / 2;
    else if (align === 'justify' && !isLast && free > 0) {
      const spaces = r.segs.filter((s) => s.kind === 'space').length;
      if (spaces > 0) extraPerSpace = free / spaces;
    }

    // Fragmentos: trechos contíguos com o mesmo estilo/fundo são unidos.
    const fragments: Fragment[] = [];
    let x = container.x + offset;
    for (const s of r.segs) {
      const w = s.width + (s.kind === 'space' ? extraPerSpace : 0);
      const last = fragments[fragments.length - 1];
      const mergeable = last && extraPerSpace === 0 && last.style === s.style && last.bg === s.bg && last.hidden === s.hidden;
      if (last && mergeable) {
        last.text += s.text;
        last.width += w;
      } else if (s.kind === 'space' && extraPerSpace > 0) {
        // Em texto justificado, espaços viram lacunas (mas mantêm decoração/fundo).
        fragments.push({ x, width: w, text: '', style: s.style, face: s.face, bg: s.bg, hidden: s.hidden, gap: true });
      } else {
        fragments.push({ x, width: w, text: s.text, style: s.style, face: s.face, bg: s.bg, hidden: s.hidden });
      }
      x += w;
    }
    lines.push({ x: container.x, y, width: r.width + (extraPerSpace ? free : 0), height, baseline: y + above, fragments });
    y += height;
  });

  return { lines, height: y - container.y };
}
