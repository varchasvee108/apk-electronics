import type { ParamValue } from '@sim/types';

/** A point on the 0.1" grid (breadboard holes sit on integer coordinates). */
export interface Pt {
  x: number;
  y: number;
}

export type Rot = 0 | 1 | 2 | 3;

export type Props = Record<string, ParamValue>;

export interface PartInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: Rot;
  props: Props;
  label?: string;
}

export interface Wire {
  id: string;
  a: Pt;
  b: Pt;
  color: string;
  /** Optional bend: the wire is drawn as a smooth curve through this point. */
  via?: Pt;
}

export type ProbeKind = 'dmm+' | 'dmm-' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'la0' | 'la1' | 'la2' | 'la3' | 'la4' | 'la5' | 'la6' | 'la7';

export interface CircuitDoc {
  schema: 1;
  id: string;
  name: string;
  board: 'breadboard' | 'none';
  parts: PartInstance[];
  wires: Wire[];
  probes: Partial<Record<ProbeKind, Pt>>;
  createdAt: number;
  updatedAt: number;
  /** Optional lesson / example origin. */
  origin?: string;
}

export const WIRE_COLORS = [
  { name: 'Red', value: '#e5484d' },
  { name: 'Black', value: '#2b2f36' },
  { name: 'Blue', value: '#3e63dd' },
  { name: 'Green', value: '#30a46c' },
  { name: 'Yellow', value: '#f5c518' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Purple', value: '#8e4ec6' },
  { name: 'White', value: '#e8eaee' },
] as const;

export function newId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function emptyDoc(board: CircuitDoc['board'], name = 'Untitled circuit'): CircuitDoc {
  const now = Date.now();
  return { schema: 1, id: newId('c'), name, board, parts: [], wires: [], probes: {}, createdAt: now, updatedAt: now };
}

export const ptKey = (p: Pt): string => `${p.x},${p.y}`;
export const samePt = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;
