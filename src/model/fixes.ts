import { analyzeTopology } from '@sim/diagnostics';
import type { Diagnostic } from '@sim/types';
import { formatEng } from '@sim/units';
import { BB, allHoles, holeAt } from './breadboard';
import { pinIndex } from './connect';
import { flipPart, placePart } from './edit';
import { extractNetlist, type Extraction } from './netlist';
import { partBounds, partDef, partLabel, pinPositions } from './parts';
import { newId, ptKey, samePt, type CircuitDoc, type PartInstance, type Pt, type Rot } from './types';

/**
 * One-tap repairs for the problems the circuit checker finds. Each fix is a list of plain document
 * operations (so it is undoable like any edit), plus an optional "repair the damaged part" step that
 * the simulator performs.
 */

export type FixOp =
  | { kind: 'place'; partId: string; x: number; y: number; rot: Rot }
  | { kind: 'flip'; partId: string }
  | { kind: 'deleteWire'; wireId: string }
  | { kind: 'moveWireEnd'; wireId: string; end: 'a' | 'b'; to: Pt }
  | { kind: 'addPart'; type: string; at: Pt; rot?: Rot; props?: Record<string, number | string | boolean> }
  | { kind: 'setProp'; partId: string; key: string; value: number | string | boolean }
  /** Handled by the simulator (replace a burnt part / blown fuse). */
  | { kind: 'repair'; partId: string };

export interface Fix {
  label: string;
  detail: string;
  ops: FixOp[];
}

const POLARISED = new Set(['led', 'ecap', 'diode', 'zener', 'schottky', 'buzzer', 'photodiode']);
const SOURCES = new Set(['battery', 'supply', 'funcgen', 'acsource']);
const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** Smallest standard (E12) resistor value ≥ r. */
export function e12AtLeast(r: number): number {
  const dec = Math.pow(10, Math.floor(Math.log10(Math.max(r, 1))));
  for (const m of [...E12, 10]) if (m * dec >= r - 1e-9) return m * dec;
  return 10 * dec;
}

/** Apply fix operations to a document draft (everything except `repair`). */
export function applyFixOps(d: CircuitDoc, ops: FixOp[]): void {
  for (const op of ops) {
    const part = 'partId' in op ? d.parts.find((p) => p.id === op.partId) : undefined;
    switch (op.kind) {
      case 'place':
        if (part) placePart(d, part, op.x, op.y, op.rot);
        break;
      case 'flip':
        if (part) flipPart(d, part);
        break;
      case 'deleteWire':
        d.wires = d.wires.filter((w) => w.id !== op.wireId);
        break;
      case 'moveWireEnd': {
        const w = d.wires.find((q) => q.id === op.wireId);
        if (w) w[op.end] = { ...op.to };
        d.wires = d.wires.filter((q) => !samePt(q.a, q.b));
        break;
      }
      case 'addPart': {
        const def = partDef(op.type);
        d.parts.push({ id: newId(def.prefix.toLowerCase()), type: op.type, x: op.at.x, y: op.at.y, rot: op.rot ?? 0, props: { ...def.defaults, ...(op.props ?? {}) } });
        break;
      }
      case 'setProp':
        if (part) part.props[op.key] = op.value;
        break;
      case 'repair':
        break;
    }
  }
}

// ------------------------------------------------------------------ geometry helpers

const overBoard = (q: Pt) => q.x >= 0 && q.x <= BB.width && q.y >= 0 && q.y <= BB.height;

function occupied(doc: CircuitDoc, exceptPart?: string): Set<string> {
  const s = new Set<string>();
  for (const p of doc.parts) if (p.id !== exceptPart) for (const q of pinPositions(p)) s.add(ptKey(q));
  for (const w of doc.wires) {
    s.add(ptKey(w.a));
    s.add(ptKey(w.b));
  }
  return s;
}

function bodyClash(doc: CircuitDoc, cand: PartInstance): boolean {
  const a = partBounds(cand);
  return doc.parts.some((p) => {
    if (p.id === cand.id || p.type === 'ground') return false;
    const b = partBounds(p);
    return a.x0 < b.x1 - 0.4 && a.x1 > b.x0 + 0.4 && a.y0 < b.y1 - 0.4 && a.y1 > b.y0 + 0.4;
  });
}

/**
 * The nearest position (and, if needed, orientation) where every lead of the part sits in its own
 * breadboard strip, on a free hole, without landing on another part.
 */
export function relocate(doc: CircuitDoc, part: PartInstance): { x: number; y: number; rot: Rot } | null {
  if (doc.board !== 'breadboard') return null;
  const taken = occupied(doc, part.id);
  let best: { x: number; y: number; rot: Rot; score: number } | null = null;
  const rots: Rot[] = [part.rot, ((part.rot + 1) % 4) as Rot, ((part.rot + 3) % 4) as Rot, ((part.rot + 2) % 4) as Rot];
  for (let ri = 0; ri < rots.length; ri++) {
    const rot = rots[ri];
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        const score = Math.abs(dx) + Math.abs(dy) * 1.05 + (ri === 0 ? 0 : ri === 3 ? 6 : 3);
        if (best && score >= best.score) continue;
        const cand: PartInstance = { ...part, x: part.x + dx, y: part.y + dy, rot };
        const pins = pinPositions(cand);
        const groups = new Set<string>();
        let ok = true;
        for (const q of pins) {
          const h = holeAt(q);
          if (!h || taken.has(ptKey(q)) || groups.has(h.group)) {
            ok = false;
            break;
          }
          groups.add(h.group);
        }
        if (!ok || bodyClash(doc, cand)) continue;
        best = { x: cand.x, y: cand.y, rot, score };
      }
  }
  return best ? { x: best.x, y: best.y, rot: best.rot } : null;
}

/** A free hole on the same net (breadboard), e.g. a spare hole of the − rail for a ground symbol. */
function freeHoleOnNet(doc: CircuitDoc, ex: Extraction, node: number): Pt | null {
  if (doc.board !== 'breadboard') return null;
  const groups = new Set([...ex.groupNode].filter(([, n]) => n === node).map(([g]) => g));
  if (!groups.size) return null;
  const taken = occupied(doc);
  for (const h of allHoles()) if (groups.has(holeAt(h)?.group ?? '') && !taken.has(ptKey(h))) return h;
  return null;
}

/** Strip group of a breadboard hole. */
const groupOf = (q: Pt) => holeAt(q)?.group ?? null;

/**
 * Put a resistor in series with one lead of a part: the wires feeding that lead's strip move to a
 * free strip four columns away and the resistor bridges the two strips.
 */
function seriesResistorFix(doc: CircuitDoc, part: PartInstance, pin: number, ohms: number): FixOp[] | null {
  if (doc.board !== 'breadboard') return null;
  const at = pinPositions(part)[pin];
  const h = holeAt(at);
  if (!h || h.kind !== 'strip') return null;
  const strip = h.group;
  const top = strip.startsWith('T');
  const col = Number(strip.slice(1));
  const rows = top ? BB.rowsTop : BB.rowsBottom;
  // only wires feed this strip (no other part's lead), otherwise the fix would cut those parts off too
  const others = doc.parts.some((p) => p.id !== part.id && pinPositions(p).some((q) => groupOf(q) === strip));
  const feeds = doc.wires.flatMap((w) => (['a', 'b'] as const).filter((e) => groupOf(w[e]) === strip).map((e) => ({ w, e })));
  if (others || !feeds.length) return null;
  const taken = occupied(doc);
  const stripFree = (c: number) => rows.every((y) => !taken.has(ptKey({ x: BB.x0 + c - 1, y })));
  const otherCols = new Set(pinPositions(part).map((q) => groupOf(q)).filter((g) => g && g !== strip));
  for (const dir of [-1, 1]) {
    const c2 = col + 4 * dir;
    if (c2 < 1 || c2 > BB.cols || !stripFree(c2) || otherCols.has(`${top ? 'T' : 'B'}${c2}`)) continue;
    // every column the resistor body passes over is fine; its leads go in a free row of both strips
    for (const y of rows) {
      const p1 = { x: BB.x0 + col - 1, y };
      const p2 = { x: BB.x0 + c2 - 1, y };
      if (taken.has(ptKey(p1)) || taken.has(ptKey(p2))) continue;
      const origin = dir > 0 ? p1 : p2;
      const probe: PartInstance = { id: '__r', type: 'resistor', x: origin.x, y: origin.y, rot: 0, props: {} };
      if (bodyClash(doc, probe)) continue;
      // the feeding wires move to the other holes of the new strip (the resistor uses row y)
      const freeRows = rows.filter((r) => r !== y);
      if (feeds.length > freeRows.length) return null;
      const ops: FixOp[] = [{ kind: 'addPart', type: 'resistor', at: origin, props: { r: ohms, maxP: 0.25 } }];
      feeds.forEach((f, i) => ops.push({ kind: 'moveWireEnd', wireId: f.w.id, end: f.e, to: { x: p2.x, y: freeRows[i] } }));
      return ops;
    }
  }
  return null;
}

function maxSourceVolts(doc: CircuitDoc): number {
  let v = 5;
  for (const p of doc.parts) {
    if (p.type === 'battery') v = Math.max(v, Number(p.props.v) || 9);
    else if (p.type === 'supply') v = Math.max(v, Number(p.props.vset) || 5);
  }
  return v;
}

// ------------------------------------------------------------------ fixes per problem

/** Repairs offered for one diagnostic (possibly none). */
export function fixesFor(diag: Diagnostic, doc: CircuitDoc, ex: Extraction | null): Fix[] {
  const part = diag.partId ? doc.parts.find((p) => p.id === diag.partId) : undefined;
  const label = part ? partLabel(part, doc.parts) : '';
  const out: Fix[] = [];

  switch (diag.code) {
    case 'no-ground': {
      const src = doc.parts.find((p) => SOURCES.has(p.type)) ?? doc.parts.find((p) => p.type === 'arduino');
      if (!src) break;
      const pins = pinPositions(src);
      const negPin = src.type === 'arduino' ? (pins.find((q) => q.name === 'GND') ?? pins[0]) : pins[1];
      const node = ex?.nodeOf.get(ptKey(negPin));
      const spot = (ex && node !== undefined ? freeHoleOnNet(doc, ex, node) : null) ?? { x: negPin.x, y: negPin.y };
      out.push({
        label: 'Add a Ground symbol',
        detail: `Places Ground on the − side of ${partLabel(src, doc.parts)}, so every voltage is measured from there.`,
        ops: [{ kind: 'addPart', type: 'ground', at: spot }],
      });
      break;
    }
    case 'bypassed':
    case 'dangling-pin': {
      if (!part || doc.board !== 'breadboard') break;
      const pins = pinPositions(part);
      const notInHole = pins.some((q) => overBoard(q) && !holeAt(q));
      if (diag.code === 'dangling-pin' && !notInHole) break; // a lead in an empty strip just needs wiring
      if (pins.every((q) => !overBoard(q))) break; // off-board parts are wired, not plugged
      const to = relocate(doc, part);
      if (!to) break;
      out.push({
        label: diag.code === 'bypassed' ? `Move ${label} so its leads are in different strips` : `Plug ${label} into the holes`,
        detail:
          diag.code === 'bypassed'
            ? 'Both leads were in one 5-hole strip, which joins them. Moving one lead into another strip puts the part back in the circuit.'
            : 'A lead was not in a hole, so it connected to nothing.',
        ops: [{ kind: 'place', partId: part.id, ...to }],
      });
      break;
    }
    case 'shorted-source':
    case 'source-loop': {
      // which single wire, removed, clears this problem without cutting the source off? Wires that
      // touch the source's own terminals are its feed, so they are tried last.
      const src = diag.partId ? doc.parts.find((p) => p.id === diag.partId) : undefined;
      const srcPins = new Set(src ? pinPositions(src).map((q) => ptKey(q)) : []);
      const feeds = (w: { a: Pt; b: Pt }) => srcPins.has(ptKey(w.a)) || srcPins.has(ptKey(w.b));
      // most likely culprit first: a wire straight from a + rail to a − rail, then anything not
      // feeding the source, shortest first
      const pol = (q: Pt) => (doc.board === 'breadboard' ? holeAt(q)?.polarity : undefined);
      const score = (w: { a: Pt; b: Pt }) => {
        const pa = pol(w.a);
        const pb = pol(w.b);
        return (pa && pb && pa !== pb ? 0 : 10) + (feeds(w) ? 100 : 0) + Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y) * 0.01;
      };
      const ordered = [...doc.wires].sort((a, b) => score(a) - score(b));
      for (const w of ordered) {
        const trial = { ...doc, wires: doc.wires.filter((q) => q.id !== w.id) };
        const after = analyzeTopology(extractNetlist(trial).netlist);
        const still = after.some((d) => d.code === diag.code && d.elementId === diag.elementId);
        const cutOff = after.some((d) => d.code === 'dangling-pin' && d.elementId === diag.elementId);
        if (!still && !cutOff) {
          out.push({
            label: 'Remove the wire causing the short',
            detail: `The wire from (${w.a.x}, ${w.a.y}) to (${w.b.x}, ${w.b.y}) joins the two sides of the source.`,
            ops: [{ kind: 'deleteWire', wireId: w.id }],
          });
          break;
        }
      }
      break;
    }
    case 'reverse-polarity': {
      if (!part || !POLARISED.has(part.type)) break;
      out.push({ label: `Turn ${label} around`, detail: 'Swaps its + and − leads.', ops: [{ kind: 'flip', partId: part.id }] });
      break;
    }
    case 'over-current':
    case 'over-power':
    case 'failed': {
      if (!part) break;
      if (part.type === 'led' || part.type === 'rgbled') {
        const r = e12AtLeast((maxSourceVolts(doc) - 2) / 0.015);
        const series = seriesResistorFix(doc, part, 0, r);
        if (series)
          out.push({
            label: `Add a ${formatEng(r, 'Ω')} resistor in series`,
            detail: `An LED needs a current-limiting resistor: (${formatEng(maxSourceVolts(doc), 'V')} − 2 V) / 15 mA ≈ ${formatEng(r, 'Ω')}.`,
            ops: [...series, ...(diag.code === 'failed' ? [{ kind: 'repair' as const, partId: part.id }] : [])],
          });
      }
      if (part.type === 'resistor' && diag.code !== 'failed') {
        const p = Number(part.props.maxP) || 0.25;
        const next = [0.25, 0.5, 1, 2].find((x) => x > p);
        if (next) out.push({ label: `Use a ${next} W resistor`, detail: 'A higher power rating survives the heat.', ops: [{ kind: 'setProp', partId: part.id, key: 'maxP', value: next }] });
      }
      if (diag.code === 'failed')
        out.push({
          label: part.type === 'fuse' ? 'Fit a new fuse' : `Replace ${label}`,
          detail: 'Fix the cause first, or it will fail again.',
          ops: [{ kind: 'repair', partId: part.id }],
        });
      break;
    }
  }
  return out;
}

/** Fixes for every pin that is not plugged into anything (not always reported as a diagnostic). */
export function plugInFixes(doc: CircuitDoc): Fix[] {
  if (doc.board !== 'breadboard') return [];
  const pins = pinIndex(doc);
  const out: Fix[] = [];
  for (const part of doc.parts) {
    if (part.type === 'arduino' || part.type === 'ground') continue;
    const qs = pinPositions(part);
    if (!qs.some((q) => overBoard(q) && !holeAt(q) && (pins.get(ptKey(q))?.length ?? 0) < 2)) continue;
    if (doc.wires.some((w) => qs.some((q) => samePt(q, w.a) || samePt(q, w.b)))) continue;
    const to = relocate(doc, part);
    if (to) out.push({ label: `Plug ${partLabel(part, doc.parts)} into the holes`, detail: 'A lead is over the centre channel or a gap and connects to nothing.', ops: [{ kind: 'place', partId: part.id, ...to }] });
  }
  return out;
}
