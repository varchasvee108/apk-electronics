import { create } from 'zustand';
import { partDef, pinPositions } from '@/model/parts';
import { holeAt } from '@/model/breadboard';
import { newId, ptKey, samePt, type CircuitDoc, type PartInstance, type ProbeKind, type Pt, type Rot, type Wire } from '@/model/types';
import { saveCircuit } from './db';

export type Tool = 'select' | 'wire' | 'probe' | 'multi';
export type ViewMode = 'breadboard' | 'schematic' | 'netlist';

interface Selection {
  parts: string[];
  wires: string[];
}

interface CircuitState {
  doc: CircuitDoc;
  past: CircuitDoc[];
  future: CircuitDoc[];
  lastKey: string | null;
  selection: Selection;
  tool: Tool;
  view: ViewMode;
  wireColor: string;
  probeTool: ProbeKind;
  /** Net (node index) highlighted after tapping a hole / wire. */
  focusNet: number | null;
  dirty: boolean;
  /** Readouts pinned on the canvas (part ids or "net:<n>"). */
  pinned: string[];

  load(doc: CircuitDoc): void;
  /** Mutate the document. `key` coalesces repeated edits (slider drags) into one undo step. */
  apply(fn: (d: CircuitDoc) => void, key?: string): void;
  /** Mutate the document without an undo step or marking it edited (momentary controls). */
  applyLive(fn: (d: CircuitDoc) => void): void;
  undo(): void;
  redo(): void;
  select(sel: Partial<Selection>, add?: boolean): void;
  clearSelection(): void;
  setTool(t: Tool): void;
  setView(v: ViewMode): void;
  setWireColor(c: string): void;
  setProbeTool(p: ProbeKind): void;
  setFocusNet(n: number | null): void;
  togglePin(id: string): void;

  addPart(type: string, at: Pt, props?: Record<string, number | string | boolean>): string;
  movePartsBy(ids: string[], dx: number, dy: number): void;
  rotateSelection(): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  setProp(partId: string, key: string, value: number | string | boolean, mode?: 'coalesce' | 'live'): void;
  addWire(a: Pt, b: Pt): string | null;
  setWireColorFor(ids: string[], color: string): void;
  moveWireEnd(id: string, end: 'a' | 'b', to: Pt): void;
  placeProbe(kind: ProbeKind, at: Pt | null): void;
  rename(name: string): void;
  markSaved(): void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function centroid(pts: Pt[]): Pt {
  const n = Math.max(1, pts.length);
  return { x: pts.reduce((a, q) => a + q.x, 0) / n, y: pts.reduce((a, q) => a + q.y, 0) / n };
}

function pinsOf(d: CircuitDoc, ids: Set<string>): Map<string, Pt[]> {
  return new Map(d.parts.filter((p) => ids.has(p.id)).map((p) => [p.id, pinPositions(p).map(({ x, y }) => ({ x, y }))]));
}

/**
 * After parts moved or rotated, bring along the wire ends that were attached to their pins:
 * always in a schematic, for pins that sit outside the breadboard (battery, supply, Arduino headers),
 * and for wires whose two ends both belong to moved parts. Wires plugged into breadboard holes stay put.
 */
function carryWires(d: CircuitDoc, before: Map<string, Pt[]>): void {
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
    if (na && (both || loose.has(ka))) w.a = na;
    if (nb && (both || loose.has(kb))) w.b = nb;
  }
  d.wires = d.wires.filter((w) => !samePt(w.a, w.b));
}
const HISTORY = 100;

export const useCircuit = create<CircuitState>((set, get) => ({
  doc: { schema: 1, id: '', name: '', board: 'breadboard', parts: [], wires: [], probes: {}, createdAt: 0, updatedAt: 0 },
  past: [],
  future: [],
  lastKey: null,
  selection: { parts: [], wires: [] },
  tool: 'select',
  view: 'breadboard',
  wireColor: '#3e63dd',
  probeTool: 'dmm+',
  focusNet: null,
  dirty: false,
  pinned: [],

  load(doc) {
    set({
      doc: clone(doc),
      past: [],
      future: [],
      lastKey: null,
      selection: { parts: [], wires: [] },
      focusNet: null,
      dirty: false,
      pinned: [],
      view: doc.board === 'none' ? 'schematic' : 'breadboard',
      tool: 'select',
    });
  },

  apply(fn, key) {
    const { doc, past, lastKey } = get();
    const next = clone(doc);
    fn(next);
    next.updatedAt = Date.now();
    const coalesce = key !== undefined && key === lastKey;
    set({
      doc: next,
      past: coalesce ? past : [...past.slice(-HISTORY + 1), doc],
      future: [],
      lastKey: key ?? null,
      dirty: true,
    });
  },

  applyLive(fn) {
    const next = clone(get().doc);
    fn(next);
    set({ doc: next, lastKey: null });
  },

  undo() {
    const { past, doc, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastKey: null, dirty: true, selection: { parts: [], wires: [] } });
  },

  redo() {
    const { past, doc, future } = get();
    if (!future.length) return;
    set({ doc: future[0], past: [...past, doc], future: future.slice(1), lastKey: null, dirty: true, selection: { parts: [], wires: [] } });
  },

  select(sel, add) {
    const cur = get().selection;
    if (add) {
      const toggle = (list: string[], ids: string[] = []) => {
        const s = new Set(list);
        for (const id of ids) {
          if (s.has(id)) s.delete(id);
          else s.add(id);
        }
        return [...s];
      };
      set({ selection: { parts: toggle(cur.parts, sel.parts), wires: toggle(cur.wires, sel.wires) } });
    } else set({ selection: { parts: sel.parts ?? [], wires: sel.wires ?? [] } });
  },
  clearSelection: () => set({ selection: { parts: [], wires: [] }, focusNet: null }),
  setTool: (tool) => set({ tool }),
  setView: (view) => set({ view }),
  setWireColor: (wireColor) => set({ wireColor }),
  setProbeTool: (probeTool) => set({ probeTool, tool: 'probe' }),
  setFocusNet: (focusNet) => set({ focusNet }),
  togglePin: (id) => {
    const p = get().pinned;
    set({ pinned: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] });
  },

  addPart(type, at, props) {
    const def = partDef(type);
    const id = newId(def.prefix.toLowerCase());
    get().apply((d) => {
      d.parts.push({ id, type, x: Math.round(at.x), y: Math.round(at.y), rot: 0, props: { ...def.defaults, ...(props ?? {}) } });
    });
    set({ selection: { parts: [id], wires: [] }, tool: 'select' });
    return id;
  },

  movePartsBy(ids, dx, dy) {
    if (!dx && !dy) return;
    const moving = new Set(ids);
    get().apply((d) => {
      const before = pinsOf(d, moving);
      for (const p of d.parts) {
        if (moving.has(p.id)) {
          p.x += dx;
          p.y += dy;
        }
      }
      carryWires(d, before);
    });
  },

  rotateSelection() {
    const ids = new Set(get().selection.parts);
    if (!ids.size) return;
    get().apply((d) => {
      const before = pinsOf(d, ids);
      for (const p of d.parts) {
        if (!ids.has(p.id)) continue;
        // rotate about the centre of the pins so the part stays where it is (a 180° turn swaps the leads)
        const c0 = centroid(pinPositions(p));
        p.rot = ((p.rot + 1) % 4) as Rot;
        const c1 = centroid(pinPositions(p));
        p.x += Math.round(c0.x - c1.x);
        p.y += Math.round(c0.y - c1.y);
      }
      carryWires(d, before);
    });
  },

  deleteSelection() {
    const { parts, wires } = get().selection;
    if (!parts.length && !wires.length) return;
    const ps = new Set(parts);
    const ws = new Set(wires);
    get().apply((d) => {
      d.parts = d.parts.filter((p) => !ps.has(p.id));
      d.wires = d.wires.filter((w) => !ws.has(w.id));
    });
    set({ selection: { parts: [], wires: [] }, pinned: get().pinned.filter((p) => !ps.has(p)) });
  },

  duplicateSelection() {
    const { parts, wires } = get().selection;
    const newParts: string[] = [];
    const newWires: string[] = [];
    get().apply((d) => {
      for (const p of d.parts.filter((q) => parts.includes(q.id))) {
        const id = newId(partDef(p.type).prefix.toLowerCase());
        d.parts.push({ ...clone(p), id, x: p.x + 2, y: p.y + 3, label: undefined } as PartInstance);
        newParts.push(id);
      }
      for (const w of d.wires.filter((q) => wires.includes(q.id))) {
        const id = newId('w');
        d.wires.push({ ...w, id, a: { x: w.a.x + 2, y: w.a.y + 3 }, b: { x: w.b.x + 2, y: w.b.y + 3 } });
        newWires.push(id);
      }
    });
    set({ selection: { parts: newParts, wires: newWires } });
  },

  setProp(partId, key, value, mode) {
    const fn = (d: CircuitDoc) => {
      const p = d.parts.find((q) => q.id === partId);
      if (p) p.props[key] = value;
    };
    if (mode === 'live') get().applyLive(fn);
    else get().apply(fn, mode === 'coalesce' ? `prop:${partId}:${key}` : undefined);
  },

  addWire(a, b) {
    if (samePt(a, b)) return null;
    const id = newId('w');
    const color = get().wireColor;
    get().apply((d) => {
      d.wires.push({ id, a, b, color } as Wire);
    });
    return id;
  },

  setWireColorFor(ids, color) {
    const s = new Set(ids);
    get().apply((d) => {
      for (const w of d.wires) if (s.has(w.id)) w.color = color;
    });
    set({ wireColor: color });
  },

  moveWireEnd(id, end, to) {
    get().apply((d) => {
      const w = d.wires.find((q) => q.id === id);
      if (w) w[end] = to;
      d.wires = d.wires.filter((q) => !samePt(q.a, q.b));
    });
  },

  placeProbe(kind, at) {
    get().apply((d) => {
      if (at) d.probes[kind] = at;
      else delete d.probes[kind];
    });
  },

  rename(name) {
    get().apply((d) => {
      d.name = name.trim() || 'Untitled circuit';
    });
  },

  markSaved() {
    const { doc } = get();
    if (!doc.id) return;
    saveCircuit(doc);
    set({ dirty: false });
  },
}));
