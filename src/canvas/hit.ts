import { BB } from '@/model/breadboard';
import { partBounds, pinPositions } from '@/model/parts';
import type { CircuitDoc, PartInstance, Pt, Wire } from '@/model/types';

export function hitPart(doc: CircuitDoc, w: Pt): PartInstance | null {
  for (let i = doc.parts.length - 1; i >= 0; i--) {
    const p = doc.parts[i];
    const b = partBounds(p);
    if (w.x >= b.x0 && w.x <= b.x1 && w.y >= b.y0 && w.y <= b.y1) return p;
  }
  return null;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Control point of a breadboard jumper's arc (shared by drawing and hit testing). */
export function wireControl(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(1.2, len * 0.12);
  const nx = -dy / len;
  const ny = dx / len;
  // bow "up" the screen so long wires don't hide the holes below
  const sgn = ny > 0 ? -1 : 1;
  return { x: (a.x + b.x) / 2 + nx * bow * sgn, y: (a.y + b.y) / 2 + ny * bow * sgn };
}

/** Wire under point w; `arc` matches the curved breadboard rendering. */
export function hitWire(doc: CircuitDoc, w: Pt, arc = false, tol = 0.45): Wire | null {
  let best: Wire | null = null;
  let bd = tol;
  for (const wire of doc.wires) {
    let d: number;
    if (arc) {
      const c = wireControl(wire.a, wire.b);
      d = Infinity;
      let prev = wire.a;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const u = 1 - t;
        const q = { x: u * u * wire.a.x + 2 * u * t * c.x + t * t * wire.b.x, y: u * u * wire.a.y + 2 * u * t * c.y + t * t * wire.b.y };
        d = Math.min(d, segDist(w, prev, q));
        prev = q;
      }
    } else d = segDist(w, wire.a, wire.b);
    if (d < bd) {
      bd = d;
      best = wire;
    }
  }
  return best;
}

export function snap(w: Pt): Pt {
  return { x: Math.round(w.x), y: Math.round(w.y) };
}

/** Bounds of everything in the document (grid units). */
export function docBounds(doc: CircuitDoc, withBoard = true): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (a: number, b: number, c: number, d: number) => {
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, d);
  };
  if (doc.board === 'breadboard' && withBoard) grow(0, 0, BB.width, BB.height);
  for (const p of doc.parts) {
    const b = partBounds(p);
    grow(b.x0, b.y0, b.x1, b.y1);
  }
  if (withBoard || doc.board === 'none') for (const w of doc.wires) grow(Math.min(w.a.x, w.b.x), Math.min(w.a.y, w.b.y), Math.max(w.a.x, w.b.x), Math.max(w.a.y, w.b.y));
  if (!Number.isFinite(x0)) return { x0: -10, y0: -10, x1: 30, y1: 20 };
  return { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 };
}

/** Minimum spanning tree (Manhattan) of the pins on each net, for schematic net lines. */
export function netSegments(doc: CircuitDoc, partPins: Map<string, number[]>): { a: Pt; b: Pt; node: number }[] {
  const byNet = new Map<number, Pt[]>();
  for (const p of doc.parts) {
    const nodes = partPins.get(p.id) ?? [];
    pinPositions(p).forEach((q, k) => {
      const n = nodes[k];
      if (n === undefined) return;
      const arr = byNet.get(n) ?? [];
      if (!arr.some((r) => r.x === q.x && r.y === q.y)) arr.push({ x: q.x, y: q.y });
      byNet.set(n, arr);
    });
  }
  const out: { a: Pt; b: Pt; node: number }[] = [];
  for (const [node, pts] of byNet) {
    if (pts.length < 2) continue;
    const inTree = new Set<number>([0]);
    while (inTree.size < pts.length) {
      let best = Infinity;
      let bi = -1;
      let bj = -1;
      for (const i of inTree) {
        for (let j = 0; j < pts.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.abs(pts[i].x - pts[j].x) + Math.abs(pts[i].y - pts[j].y);
          if (d < best) {
            best = d;
            bi = i;
            bj = j;
          }
        }
      }
      inTree.add(bj);
      out.push({ a: pts[bi], b: pts[bj], node });
    }
  }
  return out;
}
