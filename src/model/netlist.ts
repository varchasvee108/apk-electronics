import type { ElementSpec, Netlist } from '@sim/types';
import { holeAt } from './breadboard';
import { partDef, pinPositions, partLabel } from './parts';
import type { CircuitDoc, Pt } from './types';
import { ptKey } from './types';

export interface Extraction {
  netlist: Netlist;
  /** Grid point key → node index (only for points that matter: pins, wire ends, probes, holes in use). */
  nodeOf: Map<string, number>;
  /** Part id → node index of each pin (in footprint order). */
  partPins: Map<string, number[]>;
  /** Elements produced by each part. */
  elementsByPart: Map<string, ElementSpec[]>;
  /** Grid points belonging to each node (for highlighting a net). */
  netPoints: Pt[][];
  errors: { partId: string; message: string }[];
}

class UnionFind {
  parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a);
    if (p === undefined) {
      this.parent.set(a, a);
      return a;
    }
    let root = a;
    while (p !== root) {
      root = p;
      p = this.parent.get(root) ?? root;
    }
    // path compression
    let cur = a;
    while (cur !== root) {
      const next = this.parent.get(cur) ?? root;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const GROUND = '#GND';

/** Build the solver netlist from the document geometry. Pure and fast: run it on every edit. */
export function extractNetlist(doc: CircuitDoc): Extraction {
  const uf = new UnionFind();
  const points = new Map<string, Pt>();
  const touch = (p: Pt) => {
    const k = ptKey(p);
    if (!points.has(k)) points.set(k, p);
    uf.find(k);
    return k;
  };
  uf.find(GROUND);

  const pinPts = new Map<string, Pt[]>();
  for (const part of doc.parts) {
    const pts = pinPositions(part).map((q) => ({ x: q.x, y: q.y }));
    pinPts.set(part.id, pts);
    pts.forEach(touch);
    if (part.type === 'ground') uf.union(ptKey(pts[0]), GROUND);
  }
  for (const w of doc.wires) {
    uf.union(touch(w.a), touch(w.b));
  }
  for (const p of Object.values(doc.probes)) if (p) touch(p);

  if (doc.board === 'breadboard') {
    for (const [k, p] of points) {
      const h = holeAt(p);
      if (h) uf.union(k, `#${h.group}`);
    }
  }

  // ----- number the nets: ground first, then in order of appearance
  const rootIndex = new Map<string, number>([[uf.find(GROUND), 0]]);
  const names: string[] = ['GND'];
  const netPoints: Pt[][] = [[]];
  const nodeOf = new Map<string, number>();
  const nameHint = new Map<number, string>();
  for (const [k, p] of points) {
    const r = uf.find(k);
    let idx = rootIndex.get(r);
    if (idx === undefined) {
      idx = names.length;
      rootIndex.set(r, idx);
      names.push(`N${idx}`);
      netPoints.push([]);
    }
    nodeOf.set(k, idx);
    netPoints[idx].push(p);
    if (idx !== 0 && doc.board === 'breadboard') {
      const h = holeAt(p);
      if (h) {
        const prev = nameHint.get(idx);
        const label = h.kind === 'rail' ? h.name : `column ${h.name.slice(1)} (${h.name[0] <= 'e' ? 'a–e' : 'f–j'})`;
        if (!prev || (h.kind === 'rail' && !prev.includes('rail'))) nameHint.set(idx, label);
      }
    }
  }
  // pin-based names for nets with no hole
  for (const part of doc.parts) {
    const def = partDef(part.type);
    const pts = pinPts.get(part.id) ?? [];
    pts.forEach((p, i) => {
      const idx = nodeOf.get(ptKey(p)) ?? -1;
      if (idx > 0 && !nameHint.has(idx)) nameHint.set(idx, `${partLabel(part, doc.parts)}.${def.pins[i].name}`);
    });
  }
  for (const [idx, nm] of nameHint) names[idx] = nm;
  // make names unique
  const seen = new Map<string, number>();
  names.forEach((nm, i) => {
    const c = seen.get(nm) ?? 0;
    if (c > 0) names[i] = `${nm} #${c + 1}`;
    seen.set(nm, c + 1);
  });

  // ----- expand parts into elements
  const elements: ElementSpec[] = [];
  const partPins = new Map<string, number[]>();
  const elementsByPart = new Map<string, ElementSpec[]>();
  const errors: Extraction['errors'] = [];
  for (const part of doc.parts) {
    const def = partDef(part.type);
    const pins = (pinPts.get(part.id) ?? []).map((p) => nodeOf.get(ptKey(p)) ?? 0);
    partPins.set(part.id, pins);
    const label = partLabel(part, doc.parts);
    try {
      const els = def.expand(part, {
        id: part.id,
        pin: (k) => pins[k],
        internal: (nm) => {
          names.push(`${label}·${nm}`);
          netPoints.push([]);
          return names.length - 1;
        },
      });
      for (const e of els) e.label = e.id === part.id ? label : `${label}${e.id.slice(part.id.length)}`;
      elementsByPart.set(part.id, els);
      elements.push(...els);
    } catch (e) {
      errors.push({ partId: part.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { netlist: { nodeNames: names, elements }, nodeOf, partPins, elementsByPart, netPoints, errors };
}

/** Structural fingerprint: identical topology and element types (params may differ). */
export function topologyKey(n: Netlist): string {
  return n.elements.map((e) => `${e.id}:${e.type}:${e.nodes.join('.')}`).join('|') + `#${n.nodeNames.length}`;
}
