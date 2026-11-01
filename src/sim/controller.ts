import { analyzeTopology } from '@sim/diagnostics';
import { Simulator, SimulationError } from '@sim/simulator';
import type { Diagnostic, ElementSpec, Netlist } from '@sim/types';
import { extractNetlist, nodeAt, topologyKey, type Extraction } from '@/model/netlist';
import { partLabel, pinPositions } from '@/model/parts';
import { ptKey, type CircuitDoc, type ProbeKind } from '@/model/types';
import { ReadingAverager } from './averager';
import { buildSnapshot, partPinCurrents, wireCurrents } from './snapshot';
import { resetDamping } from './smooth';
import { useSim } from './store';

export type { PartLive, Snapshot } from './snapshot';
export { wireCurrents } from './snapshot';

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

export type DmmMode = 'V' | 'V~' | 'A' | 'Ω';

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
  /** Number of mounted views (scope, logic analyzer) that need fine time resolution. */
  private viewers = 0;
  dmmMode: DmmMode = 'V';
  failures = true;
  trace = new TraceBuffer();
  private probeNodes: Partial<Record<ProbeKind, number>> = {};
  private owner = 0;
  private avg: ReadingAverager | null = null;
  private lastAcc = -Infinity;
  private accCount = 0;
  private wireSq = new Map<string, number>();
  private wireN = 0;

  /** A workbench screen takes ownership of the simulator while it is mounted. */
  claim(): number {
    this.owner++;
    return this.owner;
  }

  /** Release ownership; powers off only if no newer screen has claimed the simulator since. */
  release(token: number): void {
    if (token === this.owner) this.powerOff();
  }

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
    this.ex = ex;
    useSim.setState({ ex });
    return { ex, netlist: { nodeNames: ex.netlist.nodeNames, elements } };
  }

  /** Called on every document change. Re-extracts the netlist and updates a running simulation in place. */
  setDoc(doc: CircuitDoc): void {
    this.doc = doc;
    const prevEx = this.ex;
    const { ex, netlist } = this.build(doc);
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
      this.trackMeter();
      this.publish(true);
      return;
    }
    try {
      const next = new Simulator(netlist, { failures: this.failures, maxStep: this.maxStep() });
      if (sim) {
        // match nets by where they physically are, not by their (index-based) names
        next.adoptFrom(sim, (n) => {
          for (const p of ex.netPoints[n] ?? []) {
            const j = prevEx ? nodeAt(prevEx, p) : undefined;
            if (j !== undefined) return j;
          }
          const byName = sim.netlist.nodeNames.indexOf(netlist.nodeNames[n]);
          return byName > 0 ? byName : undefined;
        });
      } else next.startTransient();
      this.sim = next;
      this.key = key;
      this.applyStepLimits();
      this.newAverager();
      if (useSim.getState().status === 'error') useSim.setState({ status: 'running', error: null });
    } catch (e) {
      this.fail(e);
    }
    this.publish(true);
  }

  private maxStep(): number {
    const traceLimit = this.viewers > 0 ? this.timePerDiv / 15 : Infinity;
    return Math.max(1e-9, Math.min(0.01, this.timeScale / 240, traceLimit));
  }

  /** Scope / logic analyzer mounted: sample finely. Returns the matching release function. */
  attachViewer(): () => void {
    this.viewers++;
    this.applyStepLimits();
    return () => {
      this.viewers--;
      this.applyStepLimits();
    };
  }

  /** Fine steps while a scope or logic analyzer is showing; coarser (still accurate) steps for meters. */
  private applyStepLimits(): void {
    if (!this.sim) return;
    this.sim.maxStep = this.maxStep();
    this.sim.wavePoints = this.viewers > 0 ? 50 : 20;
  }

  // ------------------------------------------------------------------ run control

  powerOn(): void {
    if (!this.doc) return;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    const { netlist } = this.build(this.doc);
    this.trace.reset();
    this.lastSample = -Infinity;
    try {
      this.sim = new Simulator(netlist, { failures: this.failures, maxStep: this.maxStep() });
      this.sim.startTransient();
      this.key = topologyKey(netlist);
      this.applyStepLimits();
      this.newAverager();
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
    resetDamping();
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
      this.accumulate(sim, true);
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
      sim.advance(sim.t + this.timePerDiv, { budgetMs: 500, onStep: (s) => (this.sample(s), this.accumulate(s)) });
    } catch (e) {
      this.fail(e);
    }
    this.publish(true);
  }

  setTimeScale(s: number): void {
    this.timeScale = s;
    this.applyStepLimits();
    useSim.setState({ timeScale: s });
  }

  setTimePerDiv(t: number): void {
    this.timePerDiv = t;
    this.applyStepLimits();
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
      sim.advance(t0 + wall * this.timeScale, { budgetMs: 10, onStep: (s) => (this.sample(s), this.accumulate(s)) });
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

  private newAverager(): void {
    const sim = this.sim;
    if (!sim) return;
    this.avg = new ReadingAverager(
      sim.devices.map((d) => d.id),
      sim.nodeCount,
    );
    this.trackMeter();
    this.avg.sample(sim);
    this.lastAcc = sim.t;
    this.wireSq.clear();
    this.wireN = 0;
  }

  private trackMeter(): void {
    const p = this.probeNodes['dmm+'];
    const m = this.probeNodes['dmm-'];
    this.avg?.trackPair(p ?? null, m ?? null);
  }

  /** Feed the display averager (about 40 sub-samples per frame, whatever the solver's step count). */
  private accumulate(sim: Simulator, force = false): void {
    const avg = this.avg;
    if (!avg) return;
    // Every accepted step is integrated: sub-sampling steps can lock onto a periodic signal's phase
    // (PWM sampled once per period always reads the same level) and bias the averages.
    void force;
    this.lastAcc = sim.t;
    const latest = avg.sample(sim);
    // every few steps, record each wire's instantaneous current for its AC (RMS) amplitude
    if (++this.accCount % 7 === 0 && this.doc && this.ex) {
      const wi = wireCurrents(this.doc, this.ex, partPinCurrents(this.doc, this.ex, (id) => latest.get(id) ?? null));
      for (const [id, val] of Object.entries(wi)) this.wireSq.set(id, (this.wireSq.get(id) ?? 0) + val * val);
      this.wireN++;
    }
  }

  // ------------------------------------------------------------------ snapshots

  private publishStatic(): void {
    useSim.setState({ diagnostics: this.named(this.staticDiagnostics()) });
  }

  /** Parts are named by their label (R1, D2…) in messages, never by internal ids. */
  private named(ds: Diagnostic[]): Diagnostic[] {
    const doc = this.doc;
    if (!doc) return ds;
    return ds.map((d) => {
      const part = d.partId ? doc.parts.find((p) => p.id === d.partId) : undefined;
      if (!part) return d;
      const lbl = partLabel(part, doc.parts);
      if (lbl === part.id) return d;
      const re = new RegExp(`\\b${part.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const swap = (t: string) => t.replace(re, lbl);
      return { ...d, title: swap(d.title), message: swap(d.message) };
    });
  }

  private staticDiagnostics(): Diagnostic[] {
    const ex = this.ex;
    if (!ex) return [];
    const out: Diagnostic[] = ex.errors.map((e) => ({ severity: 'error', code: 'note', title: 'Part error', message: e.message, partId: e.partId }));
    if (ex.netlist.elements.length) out.push(...analyzeTopology(ex.netlist));
    return out;
  }

  publish(force = false): void {
    const sim = this.sim;
    const ex = this.ex;
    const doc = this.doc;
    this.lastPublish = performanceNow();
    if (!sim || !ex || !doc) return;
    if (!this.avg) this.newAverager();
    const avg = this.avg as ReadingAverager;
    if (avg.weight <= 0) avg.sample(sim);
    const wireAc: Record<string, number> = {};
    if (this.wireN > 0) for (const [id, sq] of this.wireSq) wireAc[id] = Math.sqrt(sq / this.wireN);
    const snapshot = buildSnapshot(sim, doc, ex, avg, wireAc);
    avg.reset();
    this.wireSq.clear();
    this.wireN = 0;
    const diagnostics = this.named([...sim.topology, ...sim.liveDiagnostics()]);
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
      else if (e.type === 'supply' || e.type === 'cell') elements.push({ ...e, type: 'V', params: { v: 0, r: 0.005 } });
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
  /**
   * Small-signal sweep from the generator to a scope probe. With no channel given, the first placed
   * scope probe that is not sitting on the generator output itself is plotted (CH1 is often the input).
   */
  bode(
    doc: CircuitDoc,
    opts: { fStart: number; fStop: number; channel?: ProbeKind },
  ): { freqs: number[]; db: number[]; phase: number[]; input: string; output: string; channel: ProbeKind } {
    const src = doc.parts.find((p) => p.type === 'funcgen' || p.type === 'acsource');
    if (!src) throw new Error('Add a function generator (or AC source) to drive the circuit.');
    const ex = extractNetlist(doc);
    const inPin = pinPositions(src)[0];
    const inNode = ex.nodeOf.get(ptKey(inPin)) ?? 0;
    const nodeOfProbe = (k: ProbeKind) => {
      const pt = doc.probes[k];
      return pt ? ex.nodeOf.get(ptKey(pt)) ?? 0 : -1;
    };
    const placed = SCOPE_CHANNELS.filter((k) => doc.probes[k]);
    const channel = opts.channel && doc.probes[opts.channel] ? opts.channel : placed.find((k) => nodeOfProbe(k) !== inNode) ?? placed[0];
    if (!channel) throw new Error('Place a scope probe (CH1–CH4) on the output you want to plot.');
    const outNode = nodeOfProbe(channel);
    const sim = new Simulator(ex.netlist, { failures: false });
    const res = sim.acSweep({ fStart: opts.fStart, fStop: opts.fStop, pointsPerDecade: 30, sourceId: src.id });
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
    return { freqs: res.freqs, db, phase, input: name(inNode), output: name(outNode), channel };
  }

  nodeName(n: number): string {
    return this.ex?.netlist.nodeNames[n] ?? `N${n}`;
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export const controller = new SimController();
