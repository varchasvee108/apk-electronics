import { BB, RAIL_XS, colX, hole } from './breadboard';
import { partDef } from './parts';
import { emptyDoc, newId, type CircuitDoc, type ProbeKind, type Props, type Pt, type Rot } from './types';

export const WIRE = {
  red: '#e5484d',
  black: '#2b2f36',
  blue: '#3e63dd',
  green: '#30a46c',
  yellow: '#f5c518',
  orange: '#f76b15',
  purple: '#8e4ec6',
  white: '#e8eaee',
} as const;

type At = Pt | string;
const toPt = (a: At): Pt => (typeof a === 'string' ? hole(a) : a);

/** Fluent helper for building example circuits and lesson starting points. */
export class DocBuilder {
  doc: CircuitDoc;
  private seq = 0;
  constructor(name: string, board: CircuitDoc['board'] = 'breadboard') {
    this.doc = emptyDoc(board, name);
  }
  part(type: string, at: At, opts: { rot?: Rot; props?: Props; id?: string; label?: string } = {}): string {
    const def = partDef(type);
    const p = toPt(at);
    const id = opts.id ?? `${def.prefix.toLowerCase()}${++this.seq}`;
    this.doc.parts.push({ id, type, x: p.x, y: p.y, rot: opts.rot ?? 0, props: { ...def.defaults, ...(opts.props ?? {}) }, label: opts.label });
    return id;
  }
  wire(a: At, b: At, color: string = WIRE.blue): this {
    this.doc.wires.push({ id: newId('w'), a: toPt(a), b: toPt(b), color });
    return this;
  }
  probe(kind: ProbeKind, at: At): this {
    this.doc.probes[kind] = toPt(at);
    return this;
  }
  build(origin?: string): CircuitDoc {
    return { ...this.doc, origin };
  }
}

// ------------------------------------------------------------------ breadboard layout helpers

type Side = 'top' | 'bottom';
type Pol = '+' | '-';

/** Rail hole nearest to column `col` (prefers the same split half). */
export function railNear(side: Side, pol: Pol, col: number): Pt {
  const x = colX(col);
  let best = RAIL_XS[0];
  for (const rx of RAIL_XS) if (Math.abs(rx - x) < Math.abs(best - x) && (rx < 33) === (x < 33)) best = rx;
  const y = side === 'top' ? (pol === '+' ? BB.railTop[0] : BB.railTop[1]) : pol === '+' ? BB.railBottom[0] : BB.railBottom[1];
  return { x: best, y };
}

/** Column and side of DIP pin k (1-based) for a chip whose pin 1 sits in column `col`. */
export function dipPin(col: number, pins: number, k: number): { col: number; top: boolean } {
  const half = pins / 2;
  return k <= half ? { col: col + k - 1, top: false } : { col: col + (pins - k), top: true };
}

/** A free hole in the same strip as DIP pin k (row a–d above the chip, g–j below). */
export function dipHole(col: number, pins: number, k: number, row = 0): string {
  const p = dipPin(col, pins, k);
  return `${p.top ? 'abcd'[row] : 'jihg'[row]}${p.col}`;
}

export interface RailOpts {
  v?: number;
  supply?: boolean;
  /** Also power the bottom rails. */
  bottom?: boolean;
}

/**
 * Battery (or bench supply) above the board feeding the top rails, a ground symbol on the − rail,
 * jumpers across the split rails and optionally down to the bottom rails.
 */
export function addRails(b: DocBuilder, opts: RailOpts = {}): string {
  const v = opts.v ?? 9;
  const src = opts.supply
    ? b.part('supply', { x: 4, y: -8 }, { props: { vset: v, ilim: 0.5, on: true }, id: 'src' })
    : b.part('battery', { x: 4, y: -9 }, { props: { v }, id: 'src' });
  const neg = opts.supply ? { x: 8, y: -8 } : { x: 7, y: -9 };
  b.wire(opts.supply ? { x: 4, y: -8 } : { x: 4, y: -9 }, { x: 4, y: 2 }, WIRE.red);
  b.wire(neg, { x: 8, y: 3 }, WIRE.black);
  b.part('ground', { x: 10, y: 3 }, { id: 'gnd' });
  b.wire({ x: 32, y: 2 }, { x: 34, y: 2 }, WIRE.red);
  b.wire({ x: 32, y: 3 }, { x: 34, y: 3 }, WIRE.black);
  if (opts.bottom) {
    b.wire({ x: 62, y: 2 }, { x: 62, y: 20 }, WIRE.red);
    b.wire({ x: 61, y: 3 }, { x: 61, y: 21 }, WIRE.black);
    b.wire({ x: 32, y: 20 }, { x: 34, y: 20 }, WIRE.red);
    b.wire({ x: 32, y: 21 }, { x: 34, y: 21 }, WIRE.black);
  }
  return src;
}
