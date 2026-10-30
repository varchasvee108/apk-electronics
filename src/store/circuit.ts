import { create } from 'zustand';
import { partDef, pinPositions } from '@/model/parts';
import { newId, samePt, type CircuitDoc, type PartInstance, type ProbeKind, type Pt, type Rot, type Wire } from '@/model/types';
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
  setProp(partId: string, key: string, value: number | string | boolean, coalesce?: boolean): void;
  addWire(a: Pt, b: Pt): string | null;
  setWireColorFor(ids: string[], color: string): void;
  moveWireEnd(id: string, end: 'a' | 'b', to: Pt): void;
  placeProbe(kind: ProbeKind, at: Pt | null): void;
  rename(name: string): void;
  markSaved(): void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
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
      // wires whose both ends sit on pins of the moved parts move along with them
      const pinPts = d.parts.filter((p) => moving.has(p.id)).flatMap((p) => pinPositions(p));
      const onMoved = (q: Pt) => pinPts.some((pp) => samePt(pp, q));
      for (const w of d.wires) {
        const a = onMoved(w.a);
        const bb = onMoved(w.b);
        if (a && bb) {
          w.a = { x: w.a.x + dx, y: w.a.y + dy };
          w.b = { x: w.b.x + dx, y: w.b.y + dy };
        } else if (d.board === 'none') {
          // in schematic mode wires stay attached to pins
          if (a) w.a = { x: w.a.x + dx, y: w.a.y + dy };
          if (bb) w.b = { x: w.b.x + dx, y: w.b.y + dy };
        }
      }
      for (const p of d.parts) {
        if (moving.has(p.id)) {
          p.x += dx;
          p.y += dy;
        }
      }
    });
  },

  rotateSelection() {
    const ids = new Set(get().selection.parts);
    if (!ids.size) return;
    get().apply((d) => {
      for (const p of d.parts) if (ids.has(p.id)) p.rot = (((p.rot + 1) % 4) as Rot);
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

  setProp(partId, key, value, coalesce) {
    get().apply((d) => {
      const p = d.parts.find((q) => q.id === partId);
      if (p) p.props[key] = value;
    }, coalesce ? `prop:${partId}:${key}` : undefined);
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
