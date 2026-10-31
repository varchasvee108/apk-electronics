import type { Simulator } from '@sim/simulator';
import type { DeviceReading } from '@sim/types';
import { holeAt } from '@/model/breadboard';
import type { Extraction } from '@/model/netlist';
import { pinPositions } from '@/model/parts';
import { ptKey, type CircuitDoc } from '@/model/types';
import type { AveragedReading, ReadingAverager } from './averager';

export interface PartLive {
  v: number;
  i: number;
  p: number;
  extra: Record<string, number | string | boolean>;
  load: number;
  failed: boolean;
  failReason: string;
  pinV: number[];
  /** Readings of every element of the part, keyed by suffix ('' = main), averaged over the frame. */
  els: Record<string, DeviceReading>;
  /** RMS and peak-to-peak of the main reading over the frame (AC information). */
  vrms: number;
  irms: number;
  vpp: number;
  ipp: number;
  /** The reading changed noticeably within the frame (AC / PWM / switching). */
  ac: boolean;
}

export interface Snapshot {
  t: number;
  /** Node voltages averaged over the frame (plus their extremes). */
  nodeV: Float64Array;
  nodeMin: Float64Array;
  nodeMax: Float64Array;
  parts: Record<string, PartLive>;
  /** Average current along each wire, and the RMS of its AC part. */
  wireI: Record<string, number>;
  wireAc: Record<string, number>;
  vmax: number;
  /** Meter: DC (mean) volts and amps, plus the AC RMS and peak-to-peak of the voltage. */
  dmm: { v: number; i: number; vac: number; iac: number; vpp: number } | null;
}

/** Per-part pin currents from element readings. */
export function partPinCurrents(doc: CircuitDoc, ex: Extraction, get: (elementId: string) => DeviceReading | null): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const part of doc.parts) {
    const pins = ex.partPins.get(part.id) ?? [];
    const pc = new Array(pins.length).fill(0);
    for (const e of ex.elementsByPart.get(part.id) ?? []) {
      get(e.id)?.pinI?.forEach((cur, j) => {
        const pinIdx = pins.indexOf(e.nodes[j]);
        if (pinIdx >= 0) pc[pinIdx] += cur;
      });
    }
    out.set(part.id, pc);
  }
  return out;
}

/**
 * Build what the UI shows from the simulator and the frame's averaged readings. Pure: the app's
 * controller and the tests both use it, so lesson checks are verified on exactly what learners see.
 */
export function buildSnapshot(sim: Simulator, doc: CircuitDoc, ex: Extraction, avg: ReadingAverager, wireAc: Record<string, number> = {}): Snapshot {
    const nodes = avg.nodes(sim);
    const nodeV = nodes.mean;
    let vmax = 1;
    for (let i = 1; i < sim.nodeCount; i++) vmax = Math.max(vmax, Math.abs(nodeV[i]));
    const readings = new Map<string, AveragedReading>();
    const get = (id: string): AveragedReading | null => {
      let r = readings.get(id);
      if (!r) {
        r = avg.reading(sim, id) ?? undefined;
        if (r) readings.set(id, r);
      }
      return r ?? null;
    };
    const parts: Record<string, PartLive> = {};
    for (const part of doc.parts) {
      const els = ex.elementsByPart.get(part.id) ?? [];
      const pins = ex.partPins.get(part.id) ?? [];
      const live: PartLive = {
        v: 0,
        i: 0,
        p: 0,
        extra: {},
        load: 0,
        failed: false,
        failReason: '',
        pinV: pins.map((n) => nodeV[n] ?? 0),
        els: {},
        vrms: 0,
        irms: 0,
        vpp: 0,
        ipp: 0,
        ac: false,
      };
      els.forEach((e, k) => {
        const dev = sim.device(e.id);
        const rd = get(e.id);
        if (!dev || !rd) return;
        const suffix = e.id === part.id ? '' : e.id.slice(part.id.length + 1);
        live.els[suffix] = rd;
        if (e.id === part.id || k === 0) {
          live.v = rd.v;
          live.i = rd.i;
          live.extra = rd.extra ?? {};
          live.vrms = rd.vrms;
          live.irms = rd.irms;
          live.vpp = rd.vmax - rd.vmin;
          live.ipp = rd.imax - rd.imin;
          const vScale = Math.max(Math.abs(rd.vmax), Math.abs(rd.vmin));
          const iScale = Math.max(Math.abs(rd.imax), Math.abs(rd.imin));
          live.ac = live.vpp > 0.02 * vScale + 1e-3 || live.ipp > 0.02 * iScale + 1e-6;
        }
        // dissipated power for loads; sources report negative power (energy delivered)
        live.p += rd.p;
        live.load = Math.max(live.load, sim.load.get(e.id) ?? 0);
        if (dev.failed) {
          live.failed = true;
          live.failReason = dev.failReason;
        }
      });
      parts[part.id] = live;
    }
    let dmm: Snapshot['dmm'] = null;
    const pair = avg.pairStats(sim);
    if (pair) {
      const meter = sim.device('__dmm') ? get('__dmm') : null;
      const iMean = meter ? (meter.pinI?.[0] ?? 0) : 0;
      dmm = {
        v: pair.mean,
        i: iMean,
        vac: pair.acRms,
        iac: meter ? Math.sqrt(Math.max(0, meter.irms * meter.irms - iMean * iMean)) : 0,
        vpp: pair.pp,
      };
    }
    const snapshot: Snapshot = {
      t: sim.t,
      nodeV,
      nodeMin: nodes.min,
      nodeMax: nodes.max,
      parts,
      wireI: wireCurrents(doc, ex, partPinCurrents(doc, ex, get)),
      wireAc,
      vmax,
      dmm,
    };
  return snapshot;
}

/**
 * Current along each wire. Each net is a tree of zero-ohm connections (wires and breadboard strips);
 * pins draw current out of it. A spanning tree per net gives each wire the current needed by the
 * pins on its far side (redundant wires in loops are shown carrying nothing).
 */
export function wireCurrents(doc: CircuitDoc, ex: Extraction, pinCurrents: Map<string, number[]>): Record<string, number> {
  const demand = new Map<string, number>();
  const adj = new Map<string, { to: string; wire?: string; forward: boolean }[]>();
  const link = (a: string, b: string, wire?: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a))?.push({ to: b, wire, forward: true });
    (adj.get(b) ?? adj.set(b, []).get(b))?.push({ to: a, wire, forward: false });
  };
  for (const part of doc.parts) {
    const pc = pinCurrents.get(part.id);
    if (!pc) continue;
    pinPositions(part).forEach((p, k) => {
      const key = ptKey(p);
      demand.set(key, (demand.get(key) ?? 0) + (pc[k] ?? 0));
    });
  }
  for (const w of doc.wires) link(ptKey(w.a), ptKey(w.b), w.id);
  if (doc.board === 'breadboard') {
    for (const k of ex.nodeOf.keys()) {
      const [x, y] = k.split(',').map(Number);
      const h = holeAt({ x, y });
      if (h) link(`#${h.group}`, k);
    }
  }
  const out: Record<string, number> = {};
  const visited = new Set<string>();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    // iterative DFS producing a parent order
    const order: string[] = [];
    const parentEdge = new Map<string, { from: string; wire?: string; forward: boolean }>();
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const u = stack.pop() as string;
      order.push(u);
      for (const e of adj.get(u) ?? []) {
        if (visited.has(e.to)) continue;
        visited.add(e.to);
        parentEdge.set(e.to, { from: u, wire: e.wire, forward: e.forward });
        stack.push(e.to);
      }
    }
    const sub = new Map<string, number>();
    for (let i = order.length - 1; i >= 0; i--) {
      const u = order[i];
      const total = (sub.get(u) ?? 0) + (demand.get(u) ?? 0);
      const pe = parentEdge.get(u);
      if (pe) {
        sub.set(pe.from, (sub.get(pe.from) ?? 0) + total);
        // current flows parent → child equal to the child's subtree demand
        if (pe.wire) out[pe.wire] = pe.forward ? total : -total;
      }
    }
  }
  return out;
}

