import { BB } from './breadboard';
import { partBounds, partDef } from './parts';
import type { CircuitDoc, PartInstance, Pt } from './types';

function overlaps(a: PartInstance, doc: CircuitDoc): boolean {
  const ba = partBounds(a);
  return doc.parts.some((p) => {
    const b = partBounds(p);
    return ba.x0 < b.x1 - 0.2 && ba.x1 > b.x0 + 0.2 && ba.y0 < b.y1 - 0.2 && ba.y1 > b.y0 + 0.2;
  });
}

/** A sensible free spot for a new part near `center` (grid units). */
export function placementFor(type: string, center: Pt, doc: CircuitDoc): Pt {
  const def = partDef(type);
  const cx = Math.round(center.x);
  const tryAt = (pts: Pt[]): Pt => {
    for (const p of pts) {
      const probe: PartInstance = { id: '__probe', type, x: p.x, y: p.y, rot: 0, props: def.defaults };
      if (!overlaps(probe, doc)) return p;
    }
    return pts[0];
  };
  const xs = (from: number, step: number) => Array.from({ length: 40 }, (_, k) => from + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * step);
  if (doc.board === 'breadboard') {
    const clampCol = (x: number) => Math.max(BB.x0 + 1, Math.min(BB.x0 + BB.cols - 8, x));
    if (type === 'arduino') return tryAt(xs(clampCol(cx) - 10, 28).map((x) => ({ x, y: 28 })));
    if (type === 'ground') return tryAt(xs(clampCol(cx), 2).map((x) => ({ x, y: 3 })));
    if (def.offBoard) return tryAt(xs(clampCol(cx), 7).map((x) => ({ x, y: -9 })));
    if (def.dip) return tryAt(xs(clampCol(cx), 2).map((x) => ({ x: clampCol(x), y: BB.rowsTop[4] })));
    const rows = [BB.rowsTop[2], BB.rowsBottom[2], BB.rowsTop[3], BB.rowsBottom[3], BB.rowsTop[1], BB.rowsBottom[1]];
    const pts: Pt[] = [];
    for (const x of xs(clampCol(cx), 2)) for (const y of rows) pts.push({ x: clampCol(x), y });
    return tryAt(pts);
  }
  const pts: Pt[] = [];
  for (const x of xs(cx, 4)) for (const y of [0, 5, -5, 10]) pts.push({ x, y: Math.round(center.y) + y });
  return tryAt(pts);
}
