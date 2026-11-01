import { partDef } from '@/model/parts';
import { newId, type CircuitDoc } from '@/model/types';

export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'circuit';

export function serializeCircuit(doc: CircuitDoc): string {
  return JSON.stringify({ app: 'bench', ...doc }, null, 2);
}

/** Validate and normalise an imported circuit. Throws with a readable message. */
export function parseCircuit(text: string): CircuitDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const d = raw as Partial<CircuitDoc>;
  if (!d || d.schema !== 1 || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('This is not a Bench circuit file.');
  for (const p of d.parts) {
    if (!p || typeof p.type !== 'string' || typeof p.x !== 'number' || typeof p.y !== 'number') throw new Error('A part in this file is malformed.');
    partDef(p.type); // throws for unknown part types
    p.rot = ([0, 1, 2, 3].includes(p.rot) ? p.rot : 0) as typeof p.rot;
    p.props = { ...partDef(p.type).defaults, ...(p.props ?? {}) };
  }
  for (const w of d.wires) {
    if (!w || !w.a || !w.b || typeof w.a.x !== 'number' || typeof w.b.y !== 'number') throw new Error('A wire in this file is malformed.');
    w.id = w.id || newId('w');
    w.color = w.color || '#3e63dd';
    if (w.via && (typeof w.via.x !== 'number' || typeof w.via.y !== 'number')) delete w.via;
  }
  const now = Date.now();
  return {
    schema: 1,
    id: newId('c'),
    name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Imported circuit',
    board: d.board === 'none' ? 'none' : 'breadboard',
    parts: d.parts,
    wires: d.wires,
    probes: d.probes ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
