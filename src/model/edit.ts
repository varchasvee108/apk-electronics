import { holeAt } from './breadboard';
import { pinPositions } from './parts';
import { ptKey, samePt, type CircuitDoc, type PartInstance, type Pt, type Rot } from './types';

/** Document edits shared by the editor store and automatic fixes. */

export function centroid(pts: Pt[]): Pt {
  const n = Math.max(1, pts.length);
  return { x: pts.reduce((a, q) => a + q.x, 0) / n, y: pts.reduce((a, q) => a + q.y, 0) / n };
}

export function pinsOf(d: CircuitDoc, ids: Set<string>): Map<string, Pt[]> {
  return new Map(d.parts.filter((p) => ids.has(p.id)).map((p) => [p.id, pinPositions(p).map(({ x, y }) => ({ x, y }))]));
}

/**
 * After parts moved or rotated, bring along the wire ends that were attached to their pins:
 * always in a schematic, for pins that sit outside the breadboard (battery, supply, Arduino headers),
 * and for wires whose two ends both belong to moved parts. Wires plugged into breadboard holes stay put.
 */
export function carryWires(d: CircuitDoc, before: Map<string, Pt[]>): void {
  const moved = new Map<string, Pt>();
  const loose = new Set<string>();
  for (const p of d.parts) {
    const old = before.get(p.id);
    if (!old) continue;
    const now = pinPositions(p);
    old.forEach((o, k) => {
      const key = ptKey(o);
      moved.set(key, { x: now[k].x, y: now[k].y });
      if (d.board === 'none' || !holeAt(o)) loose.add(key);
    });
  }
  for (const w of d.wires) {
    const ka = ptKey(w.a);
    const kb = ptKey(w.b);
    const both = moved.has(ka) && moved.has(kb);
    const na = moved.get(ka);
    const nb = moved.get(kb);
    const a0 = w.a;
    if (na && (both || loose.has(ka))) w.a = na;
    if (nb && (both || loose.has(kb))) w.b = nb;
    // a bent wire whose two ends moved together keeps its shape
    if (w.via && both && na && nb) w.via = { x: w.via.x + (w.a.x - a0.x), y: w.via.y + (w.a.y - a0.y) };
  }
  d.wires = d.wires.filter((w) => !samePt(w.a, w.b));
}


/** Turn a part round by 180° in place (swaps its leads), carrying attached off-board wires along. */
export function flipPart(d: CircuitDoc, part: PartInstance): void {
  const before = pinsOf(d, new Set([part.id]));
  const c0 = centroid(pinPositions(part));
  part.rot = ((part.rot + 2) % 4) as Rot;
  const c1 = centroid(pinPositions(part));
  part.x += Math.round(c0.x - c1.x);
  part.y += Math.round(c0.y - c1.y);
  carryWires(d, before);
}

/** Move a part to a new origin / orientation, carrying attached off-board wires along. */
export function placePart(d: CircuitDoc, part: PartInstance, x: number, y: number, rot: Rot): void {
  const before = pinsOf(d, new Set([part.id]));
  part.x = x;
  part.y = y;
  part.rot = rot;
  carryWires(d, before);
}
