import { Simulator, SimulationError } from '@sim/simulator';
import type { DeviceReading, Diagnostic, ElementSpec, Netlist } from '@sim/types';
import { extractNetlist, topologyKey, type Extraction } from '@/model/netlist';
import { holeAt } from '@/model/breadboard';
import { pinPositions } from '@/model/parts';
import { ptKey, type CircuitDoc, type ProbeKind } from '@/model/types';
import { useSim } from './store';

export interface PartLive {
  v: number;
  i: number;
  p: number;
  extra: Record<string, number | string | boolean>;
  load: number;
  failed: boolean;
  failReason: string;
  pinV: number[];
  /** Readings of every element of the part, keyed by suffix ('' = main). */
  els: Record<string, DeviceReading>;
}

export interface Snapshot {
  t: number;
  nodeV: Float64Array;
  parts: Record<string, PartLive>;
  wireI: Record<string, number>;
  vmax: number;
  dmm: { v: number; i: number } | null;
}

export const SCOPE_CHANNELS: ProbeKind[] = ['ch1', 'ch2', 'ch3', 'ch4'];
export const LA_CHANNELS: ProbeKind[] = ['la0', 'la1', 'la2', 'la3', 'la4', 'la5', 'la6', 'la7'];
const TRACE_KINDS: ProbeKind[] = [...SCOPE_CHANNELS, ...LA_CHANNELS];

/** Rolling capture of probe voltages, sampled on accepted solver steps. */
export class TraceBuffer {
  t: number[] = [];
  ch: Record<string, number[]> = {};
  version = 0;
  max = 8000;
  reset(): void {
    this.t = [];
    this.ch = {};
    this.version++;
  }
  push(t: number, values: Record<string, number>): void {
    this.t.push(t);
    for (const k of TRACE_KINDS) {
      const arr = (this.ch[k] ??= []);
      while (arr.length < this.t.length - 1) arr.push(NaN);
      arr.push(values[k] ?? NaN);
    }
    if (this.t.length > this.max * 1.5) {
      const cut = this.t.length - this.max;
      this.t.splice(0, cut);
      for (const k of Object.keys(this.ch)) this.ch[k].splice(0, cut);
    }
  }
}

export type DmmMode = 'V' | 'A' | 'Ω';

class SimController {
  doc: CircuitDoc | null = null;
  ex: Extraction | null = null;
  sim: Simulator | null = null;
  private key = '';
  private raf: number | null = null;
  private lastWall = 0;
  private lastPublish = 0;
  private lastSample = -Infinity;
  private speedEma = 0;
  timeScale = 1;
  timePerDiv = 1e-3;
  dmmMode: DmmMode = 'V';
  failures = true;
  trace = new TraceBuffer();
  private probeNodes: Partial<Record<ProbeKind, number>> = {};

  get running(): boolean {
    const st = useSim.getState().status;
    return st === 'running' || st === 'paused' || st === 'error';
  }

  // ------------------------------------------------------------------ netlist

  private build(doc: CircuitDoc): { ex: Extraction; netlist: Netlist } {
    const ex = extractNetlist(doc);
    const elements: ElementSpec[] = [...ex.netlist.elements];
    const dp = doc.probes['dmm+'];
    const dm = doc.probes['dmm-'];
    if (this.dmmMode === 'A' && dp && dm) {
      const a = ex.nodeOf.get(ptKey(dp)) ?? 0;
      const b = ex.nodeOf.get(ptKey(dm)) ?? 0;
      if (a !== b) elements.push({ id: '__dmm', type: 'V', nodes: [a, b], params: { v: 0 } });
    }
    this.probeNodes = {};
    for (const k of Object.keys(doc.probes) as ProbeKind[]) {
      const p = doc.probes[k];
      if (p) this.probeNodes[k] = ex.nodeOf.get(ptKey(p));
    }
    return { ex, netlist: { nodeNames: ex.netlist.nodeNames, elements } };
  }

  /** Called on every document change. Re-extracts the netlist and updates a running simulation in place. */
  setDoc(doc: CircuitDoc): void {
    this.doc = doc;
    const { ex, netlist } = this.build(doc);
    this.ex = ex;
    if (!this.running) {
      this.key = '';
      this.publishStatic();
      return;
    }
    const key = topologyKey(netlist);
    const sim = this.sim;
    if (sim && key === this.key && useSim.getState().status !== 'error') {
      let changed = false;
      for (const e of netlist.elements) {
        const dev = sim.device(e.id);
        if (!dev) continue;
        for (const [k, v] of Object.entries(e.params)) {
          if (dev.params[k] !== v) {
            dev.setParam(k, v);
            changed = true;
          }
        }
      }
      if (changed) sim.markDiscontinuity();
      this.publish(true);
      return;
    }
    try {
      const next = new Simulator(netlist, { failures: this.failures, maxStep: this.maxStep() });
      if (sim) next.adoptFrom(sim);
      else next.startTransient();
      this.sim = next;
      this.key = key;
      if (useSim.getState().status === 'error') useSim.setState({ status: 'running', error: null });
    } catch (e) {
      this.fail(e);
    }
    this.publish(true);
  }

  private maxStep(): number {
    return Math.max(1e-9, Math.min(0.01, this.timeScale / 240, this.timePerDiv / 25));
  }

  // ------------------------------------------------------------------ run control

  powerOn(): void {
    if (!this.doc) return;
    const { ex, netlist } = this.build(this.doc);
    this.ex = ex;
    this.trace.reset();
    this.lastSample = -Infinity;
    try {
      this.sim = new Simulator(netlist, { failures: this.failures, maxStep: this.maxStep() });
      this.sim.startTransient();
      this.key = topologyKey(netlist);
      useSim.setState({ status: 'running', error: null });
    } catch (e) {
      this.sim = null;
      useSim.setState({ status: 'error' });
      this.fail(e);
    }
    this.lastWall = performanceNow();
    this.loop();
    this.publish(true);
  }

  powerOff(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.sim = null;
    this.key = '';
    useSim.setState({ status: 'off', snapshot: null, error: null, simTime: 0, speed: 0 });
    this.publishStatic();
  }

  pause(): void {
    if (useSim.getState().status === 'running') useSim.setState({ status: 'paused' });
  }

  resume(): void {
    if (useSim.getState().status === 'paused') {
      this.lastWall = performanceNow();
      useSim.setState({ status: 'running' });
    }
  }

  /** One solver step (when paused). */
  stepOnce(): void {
    const sim = this.sim;
    if (!sim) return;
    try {
      sim.step();
      this.sample(sim, true);
    } catch (e) {
      this.fail(e);
    }
    this.publish(true);
  }

  /** Advance by one scope division (when paused). */
  stepDiv(): void {
    const sim = this.sim;
    if (!sim) return;
    try {
      sim.advance(sim.t + this.timePerDiv, { budgetMs: 500, onStep: (s) => this.sample(s) });
    } catch (e) {
      this.fail(e);
    }
    this.publish(true);
  }

  setTimeScale(s: number): void {
    this.timeScale = s;
    if (this.sim) this.sim.maxStep = this.maxStep();
    useSim.setState({ timeScale: s });
  }

  setTimePerDiv(t: number): void {
    this.timePerDiv = t;
    if (this.sim) this.sim.maxStep = this.maxStep();
  }

  setDmmMode(m: DmmMode): void {
    this.dmmMode = m;
    useSim.setState({ dmmMode: m });
    if (this.doc) this.setDoc(this.doc);
  }

  setFailures(on: boolean): void {
    this.failures = on;
    if (this.sim) this.sim.failures = on;
  }

  repair(partId: string): void {
    const sim = this.sim;
    if (!sim || !this.ex) return;
    for (const e of this.ex.elementsByPart.get(partId) ?? []) sim.repair(e.id);
    this.publish(true);
  }

  private fail(e: unknown): void {
    const d: Diagnostic =
      e instanceof SimulationError
        ? e.diagnostic
        : { severity: 'error', code: 'note', title: 'Simulation error', message: e instanceof Error ? e.message : String(e) };
    useSim.setState({ status: 'error', error: d });
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const st = useSim.getState().status;
    const now = performanceNow();
    const wall = Math.min((now - this.lastWall) / 1000, 0.1);
    this.lastWall = now;
    const sim = this.sim;
    if (!sim || st !== 'running') return;
    const t0 = sim.t;
    try {
      sim.advance(t0 + wall * this.timeScale, { budgetMs: 10, onStep: (s) => this.sample(s) });
    } catch (e) {
      this.fail(e);
    }
    if (wall > 0) this.speedEma = this.speedEma * 0.9 + 0.1 * ((sim.t - t0) / wall);
    if (now - this.lastPublish > 40) this.publish();
  };

  private sample(sim: Simulator, force = false): void {
    const dtS = (this.timePerDiv * 10) / 1500;
    if (!force && sim.t - this.lastSample < dtS) return;
    this.lastSample = sim.t;
    const vals: Record<string, number> = {};
    for (const k of TRACE_KINDS) {
      const n = this.probeNodes[k];
      if (n !== undefined) vals[k] = sim.nodeVoltage(n);
    }
    this.trace.push(sim.t, vals);
  }

  // ------------------------------------------------------------------ snapshots

  private publishStatic(): void {
    useSim.setState({ diagnostics: this.staticDiagnostics() });
  }

  private staticDiagnostics(): Diagnostic[] {
    const ex = this.ex;
    if (!ex) return [];
    const out: Diagnostic[] = ex.errors.map((e) => ({ severity: 'error', code: 'note', title: 'Part error', message: e.message, partId: e.partId }));
    if (ex.netlist.elements.length) {
      try {
        out.push(...new Simulator(ex.netlist).topology);
      } catch (e) {
        out.push({ severity: 'error', code: 'note', title: 'Circuit error', message: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }

  publish(force = false): void {
    const sim = this.sim;
    const ex = this.ex;
    const doc = this.doc;
    this.lastPublish = performanceNow();
    if (!sim || !ex || !doc) return;
    const nodeV = new Float64Array(sim.nodeCount);
    let vmax = 1;
    for (let i = 1; i < sim.nodeCount; i++) {
      nodeV[i] = sim.nodeVoltage(i);
      vmax = Math.max(vmax, Math.abs(nodeV[i]));
    }
    const parts: Record<string, PartLive> = {};
    const pinCurrents = new Map<string, number[]>();
    for (const part of doc.parts) {
      const els = ex.elementsByPart.get(part.id) ?? [];
      const pins = ex.partPins.get(part.id) ?? [];
      const live: PartLive = { v: 0, i: 0, p: 0, extra: {}, load: 0, failed: false, failReason: '', pinV: pins.map((n) => nodeV[n] ?? 0), els: {} };
      const pc = new Array(pins.length).fill(0);
      els.forEach((e, k) => {
        const dev = sim.device(e.id);
        if (!dev) return;
        const rd = dev.read(sim.x);
        const suffix = e.id === part.id ? '' : e.id.slice(part.id.length + 1);
        live.els[suffix] = rd;
        if (e.id === part.id || k === 0) {
          live.v = rd.v;
          live.i = rd.i;
          live.extra = rd.extra ?? {};
        }
        live.p += Math.max(0, rd.p);
        live.load = Math.max(live.load, sim.load.get(e.id) ?? 0);
        if (dev.failed) {
          live.failed = true;
          live.failReason = dev.failReason;
        }
        rd.pinI?.forEach((cur, j) => {
          const pinIdx = pins.indexOf(e.nodes[j]);
          if (pinIdx >= 0) pc[pinIdx] += cur;
        });
      });
      pinCurrents.set(part.id, pc);
      parts[part.id] = live;
    }
    let dmm: Snapshot['dmm'] = null;
    const nP = this.probeNodes['dmm+'];
    const nM = this.probeNodes['dmm-'];
    if (nP !== undefined && nM !== undefined) {
      const meter = sim.device('__dmm');
      dmm = { v: nodeV[nP] - nodeV[nM], i: meter ? meter.read(sim.x).pinI?.[0] ?? 0 : 0 };
    }
    const snapshot: Snapshot = { t: sim.t, nodeV, parts, wireI: wireCurrents(doc, ex, pinCurrents), vmax, dmm };
    const diagnostics = [...sim.topology, ...sim.liveDiagnostics()];
    useSim.setState({ snapshot, diagnostics, simTime: sim.t, speed: this.speedEma, traceVersion: this.trace.version + sim.steps });
    void force;
  }

  // ------------------------------------------------------------------ instruments

  serialText(partId: string): string {
    const dev = this.sim?.device(partId) as unknown as { rt?: { serial: string } } | undefined;
    return dev?.rt?.serial ?? '';
  }

  writeSerial(partId: string, text: string): void {
    const dev = this.sim?.device(partId) as unknown as { writeSerial?: (t: string) => void } | undefined;
    dev?.writeSerial?.(text);
  }

  clearSerial(partId: string): void {
    const dev = this.sim?.device(partId) as unknown as { rt?: { serial: string } } | undefined;
    if (dev?.rt) dev.rt.serial = '';
  }

  /** Ohmmeter: sources switched off, 1 mA test current between the probes. Returns Ω, Infinity = open. */
  measureOhms(doc: CircuitDoc): { ohms: number; note?: string } {
    const dp = doc.probes['dmm+'];
    const dm = doc.probes['dmm-'];
    if (!dp || !dm) return { ohms: NaN, note: 'Place both meter probes' };
    const ex = extractNetlist(doc);
    const a = ex.nodeOf.get(ptKey(dp)) ?? 0;
    const b = ex.nodeOf.get(ptKey(dm)) ?? 0;
    if (a === b) return { ohms: 0 };
    const elements: ElementSpec[] = [];
    for (const e of ex.netlist.elements) {
      if (e.type === 'I' || e.type === 'avr' || e.type === 'logic' || e.type === '555') continue;
      if (e.type === 'V') elements.push({ ...e, params: { ...e.params, wave: 'dc', v: 0 } });
      else if (e.type === 'supply') elements.push({ ...e, type: 'V', params: { v: 0, r: 0.005 } });
      else elements.push(e);
    }
    const test = 1e-3;
    elements.push({ id: '__ohm', type: 'I', nodes: [b, a], params: { v: test, i: test } });
    try {
      const sim = new Simulator({ nodeNames: ex.netlist.nodeNames, elements }, { failures: false });
      if (!sim.dcOp()) return { ohms: NaN, note: 'Could not measure' };
      const v = sim.nodeVoltage(a) - sim.nodeVoltage(b);
      const r = v / test;
      return r > 50e6 ? { ohms: Infinity } : { ohms: r, note: elements.some((e) => e.type === 'D' || e.type === 'Q') ? 'Semiconductors in the path make this reading current-dependent' : undefined };
    } catch {
      return { ohms: NaN, note: 'Could not measure' };
    }
  }

  /** Bode sweep from a function generator / AC source to the CH1 probe. */
  bode(doc: CircuitDoc, opts: { fStart: number; fStop: number }): { freqs: number[]; db: number[]; phase: number[]; input: string; output: string } {
    const src = doc.parts.find((p) => p.type === 'funcgen' || p.type === 'acsource');
    if (!src) throw new Error('Add a function generator (or AC source) to drive the circuit.');
    const out = doc.probes.ch1;
    if (!out) throw new Error('Place the CH1 scope probe on the output you want to plot.');
    const ex = extractNetlist(doc);
    const sim = new Simulator(ex.netlist, { failures: false });
    const res = sim.acSweep({ fStart: opts.fStart, fStop: opts.fStop, pointsPerDecade: 30, sourceId: src.id });
    const outNode = ex.nodeOf.get(ptKey(out)) ?? 0;
    const inPin = pinPositions(src)[0];
    const inNode = ex.nodeOf.get(ptKey(inPin)) ?? 0;
    const name = (n: number) => ex.netlist.nodeNames[n];
    const ho = sim.acNode(res, name(outNode));
    const hi = sim.acNode(res, name(inNode));
    const db = ho.mag.map((m, k) => 20 * Math.log10(Math.max(m, 1e-12) / Math.max(hi.mag[k], 1e-12)));
    const phase = ho.phase.map((p, k) => {
      let d = p - hi.phase[k];
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return d;
    });
    return { freqs: res.freqs, db, phase, input: name(inNode), output: name(outNode) };
  }

  nodeName(n: number): string {
    return this.ex?.netlist.nodeNames[n] ?? `N${n}`;
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
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

export const controller = new SimController();
