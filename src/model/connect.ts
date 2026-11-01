import { BB, holeAt } from './breadboard';
import { partBounds, pinPositions } from './parts';
import type { CircuitDoc, Pt } from './types';
import { ptKey } from './types';

/**
 * Where a wire end (or an instrument probe) can be attached.
 *
 * On a breadboard a jumper can only go into a hole or onto a part's terminal (battery clips, supply
 * posts, Arduino headers); a wire end left in mid-air connects to nothing, which used to make
 * correct-looking circuits silently dead. On the free schematic canvas any grid point is a valid
 * junction, but pins still attract the cursor so a slightly-off tap lands on the pin.
 */

export interface PinRef {
  partId: string;
  pin: number;
}

/** Every part pin, keyed by grid point. */
export function pinIndex(doc: CircuitDoc): Map<string, PinRef[]> {
  const out = new Map<string, PinRef[]>();
  for (const part of doc.parts) {
    pinPositions(part).forEach((q, pin) => {
      const k = ptKey(q);
      const arr = out.get(k);
      if (arr) arr.push({ partId: part.id, pin });
      else out.set(k, [{ partId: part.id, pin }]);
    });
  }
  return out;
}

/** True when a wire end placed at p would connect to something. */
export function isAnchor(doc: CircuitDoc, p: Pt, pins: Map<string, PinRef[]> = pinIndex(doc)): boolean {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return false;
  if (doc.board === 'none') return true;
  return holeAt(p) !== null || pins.has(ptKey(p));
}

export interface SnapOptions {
  /** Search radius in grid units (derived from the finger size at the current zoom). */
  radius: number;
  /** Probes: a tap on a part body snaps to that part's nearest pin. */
  partBodies?: boolean;
}

/**
 * The connection point nearest to w within the radius, or null when nothing is close enough.
 * Pins win ties over holes (a pin sitting in a hole is the same point anyway).
 */
export function snapToAnchor(doc: CircuitDoc, w: Pt, opts: SnapOptions): Pt | null {
  const r = Math.max(0.5, opts.radius);
  let best: Pt | null = null;
  let bd = Infinity;
  const consider = (q: Pt, bias = 0) => {
    const d = Math.hypot(q.x - w.x, q.y - w.y) - bias;
    if (d <= r && d < bd) {
      bd = d;
      best = { x: q.x, y: q.y };
    }
  };
  for (const part of doc.parts) for (const q of pinPositions(part)) consider(q, 0.05);
  if (opts.partBodies && (!best || bd > 0.45)) {
    // a probe touched on a part's body measures at that part's nearest lead, not the hidden hole beneath
    for (let i = doc.parts.length - 1; i >= 0; i--) {
      const part = doc.parts[i];
      const b = partBounds(part);
      if (w.x < b.x0 || w.x > b.x1 || w.y < b.y0 || w.y > b.y1) continue;
      let pd = Infinity;
      let pin: Pt | null = null;
      for (const q of pinPositions(part)) {
        const d = Math.hypot(q.x - w.x, q.y - w.y);
        if (d < pd) {
          pd = d;
          pin = { x: q.x, y: q.y };
        }
      }
      if (pin) return pin;
    }
  }
  if (doc.board === 'breadboard') {
    const x0 = Math.floor(w.x - r);
    const x1 = Math.ceil(w.x + r);
    const y0 = Math.floor(w.y - r);
    const y1 = Math.ceil(w.y + r);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (holeAt({ x, y })) consider({ x, y });
  }
  if (!best && doc.board === 'none') return { x: Math.round(w.x), y: Math.round(w.y) };
  return best;
}

/**
 * After a drop on the breadboard, nudge a group of parts by at most a hole or two so that every pin
 * lying over the board lands in a hole (a lead over the centre channel or a rail gap connects to
 * nothing). Returns the extra offset to apply, or [0, 0] when the drop is already good or no nearby
 * offset fixes it.
 */
export function settleOffset(doc: CircuitDoc, ids: Set<string>, dx: number, dy: number): [number, number] {
  if (doc.board !== 'breadboard') return [0, 0];
  const pts: Pt[] = [];
  for (const p of doc.parts) if (ids.has(p.id)) for (const q of pinPositions(p)) pts.push({ x: q.x + dx, y: q.y + dy });
  const overBoard = (q: Pt) => q.x >= 0 && q.x <= BB.width && q.y >= 0 && q.y <= BB.height;
  const misses = (ox: number, oy: number) => {
    let over = 0;
    let bad = 0;
    for (const q of pts) {
      const s = { x: q.x + ox, y: q.y + oy };
      if (!overBoard(s)) continue;
      over++;
      if (!holeAt(s)) bad++;
    }
    return { over, bad };
  };
  const here = misses(0, 0);
  // fully off the board (supplies, Arduino) or already all in holes: leave it
  if (here.over === 0 || here.bad === 0) return [0, 0];
  let best: [number, number] = [0, 0];
  let bestScore = Infinity;
  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++) {
      const m = misses(ox, oy);
      if (m.bad > 0 || m.over < here.over) continue;
      const score = Math.abs(ox) + Math.abs(oy) * 1.01;
      if (score < bestScore) {
        bestScore = score;
        best = [ox, oy];
      }
    }
  return best;
}

/** Pins of a part that connect to nothing on the breadboard (not in a hole and no wire on them). */
export function loosePins(doc: CircuitDoc): Pt[] {
  if (doc.board !== 'breadboard') return [];
  const wired = new Set<string>();
  for (const w of doc.wires) {
    wired.add(ptKey(w.a));
    wired.add(ptKey(w.b));
  }
  const pins = pinIndex(doc);
  const out: Pt[] = [];
  for (const part of doc.parts) {
    // the Uno has dozens of header pins; only the ones in use matter
    if (part.type === 'arduino') continue;
    for (const q of pinPositions(part)) {
      const k = ptKey(q);
      if (holeAt(q) || wired.has(k) || (pins.get(k)?.length ?? 0) > 1) continue;
      out.push({ x: q.x, y: q.y });
    }
  }
  return out;
}
