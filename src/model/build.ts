import { hole } from './breadboard';
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
