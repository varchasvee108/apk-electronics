import type { Pt } from './types';

/**
 * Full-size breadboard geometry on the 0.1" grid.
 *  - 63 columns of terminal strips; each column has two 5-hole strips (rows a–e and f–j)
 *  - a 0.3" centre channel between rows e and f, so DIP chips straddle it
 *  - two power rails on each side, in groups of five, split in the middle (left / right halves)
 */
export const BB = {
  cols: 63,
  x0: 2, // x of column 1
  rowsTop: [6, 7, 8, 9, 10], // a–e
  rowsBottom: [13, 14, 15, 16, 17], // f–j
  railTop: [2, 3], // + then −
  railBottom: [20, 21], // + then −
  width: 67,
  height: 24,
  channelY: 11.5,
} as const;

export const ROW_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

/** Rail hole x positions: 10 groups of 5 holes. Left half = groups 0–4, right half = 5–9. */
export const RAIL_XS: number[] = (() => {
  const xs: number[] = [];
  for (let g = 0; g < 10; g++) for (let k = 0; k < 5; k++) xs.push(4 + g * 6 + k);
  return xs;
})();
const RAIL_SPLIT_X = 33;

export type HoleKind = 'strip' | 'rail';

export interface HoleInfo {
  kind: HoleKind;
  /** Connectivity group id (all holes with the same group are connected). */
  group: string;
  /** Human name, e.g. "a12" or "top + rail (left)". */
  name: string;
  /** For rails: '+' or '−'. */
  polarity?: '+' | '−';
}

const RAIL_INFO: Record<number, { side: 'top' | 'bottom'; pol: '+' | '−' }> = {
  [BB.railTop[0]]: { side: 'top', pol: '+' },
  [BB.railTop[1]]: { side: 'top', pol: '−' },
  [BB.railBottom[0]]: { side: 'bottom', pol: '+' },
  [BB.railBottom[1]]: { side: 'bottom', pol: '−' },
};

const railXSet = new Set(RAIL_XS);

export function holeAt(p: Pt): HoleInfo | null {
  const { x, y } = p;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const col = x - BB.x0 + 1;
  if (col >= 1 && col <= BB.cols) {
    const ti = (BB.rowsTop as readonly number[]).indexOf(y);
    if (ti >= 0) return { kind: 'strip', group: `T${col}`, name: `${ROW_LETTERS[ti]}${col}` };
    const bi = (BB.rowsBottom as readonly number[]).indexOf(y);
    if (bi >= 0) return { kind: 'strip', group: `B${col}`, name: `${ROW_LETTERS[bi + 5]}${col}` };
  }
  const rail = RAIL_INFO[y];
  if (rail && railXSet.has(x)) {
    const half = x < RAIL_SPLIT_X ? 'left' : 'right';
    return {
      kind: 'rail',
      group: `R${rail.side}${rail.pol}${half}`,
      name: `${rail.side} ${rail.pol} rail (${half})`,
      polarity: rail.pol,
    };
  }
  return null;
}

/** All hole positions (for drawing). */
export function allHoles(): Pt[] {
  const out: Pt[] = [];
  for (let c = 0; c < BB.cols; c++) {
    const x = BB.x0 + c;
    for (const y of BB.rowsTop) out.push({ x, y });
    for (const y of BB.rowsBottom) out.push({ x, y });
  }
  for (const y of [...BB.railTop, ...BB.railBottom]) for (const x of RAIL_XS) out.push({ x, y });
  return out;
}

export function onBoardArea(p: Pt): boolean {
  return p.x >= 0 && p.x <= BB.width && p.y >= 0 && p.y <= BB.height;
}

/** Grid point for a hole name like "a12" or "e30". */
export function hole(name: string): Pt {
  const m = /^([a-j])(\d+)$/.exec(name);
  if (!m) throw new Error(`bad hole ${name}`);
  const row = ROW_LETTERS.indexOf(m[1]);
  const col = Number(m[2]);
  const y = row < 5 ? BB.rowsTop[row] : BB.rowsBottom[row - 5];
  return { x: BB.x0 + col - 1, y };
}

/** Grid point on a rail: side top/bottom, polarity, rail-hole index 0..49. */
export function railHole(side: 'top' | 'bottom', pol: '+' | '-', index: number): Pt {
  const y = side === 'top' ? (pol === '+' ? BB.railTop[0] : BB.railTop[1]) : pol === '+' ? BB.railBottom[0] : BB.railBottom[1];
  return { x: RAIL_XS[index], y };
}

/** x of column c (1-based). */
export const colX = (c: number): number => BB.x0 + c - 1;
