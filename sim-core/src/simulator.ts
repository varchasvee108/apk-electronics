import { Device, type History } from './device';
import { analyzeTopology, explainSingular } from './diagnostics';
import { ComplexSolver } from './linalg';
import { createDevice } from './registry';
import { ReactiveStamper, Stamper } from './stamper';
import type { DeviceReading, Diagnostic, Method, Netlist } from './types';
import { formatEng } from './units';

export interface SimOptions {
  reltol?: number;
  vntol?: number;
  abstol?: number;
  /** Upper bound on the transient step (s). */
  maxStep?: number;
  /** Allow parts to fail from over-stress. */
  failures?: boolean;
}

export interface StepInfo {
  dt: number;
  method: Method;
  iterations: number;
  rejected: number;
}

export class SimulationError extends Error {
  diagnostic: Diagnostic;
  constructor(d: Diagnostic) {
    super(d.message);
    this.diagnostic = d;
  }
}

export interface AcResult {
  freqs: number[];
  /** complex solution per frequency: [re, im] arrays over unknowns */
  re: Float64Array[];
  im: Float64Array[];
}

export class Simulator {
  readonly netlist: Netlist;
  readonly devices: Device[];
  readonly byId = new Map<string, Device>();
  readonly nodeCount: number;
  readonly size: number;
  readonly unknownNames: string[];
  readonly s: Stamper;
  readonly topology: Diagnostic[];
  private xNew: Float64Array;
  x: Float64Array;
  t = 0;
  hist: History = { times: [0] };
  dtNext = 1e-9;
  maxStep: number;
  beSteps = 1;
  stepsSinceDisc = 0;
  failures: boolean;
  reltol: number;
  vntol: number;
  abstol: number;
  hasNonlinear: boolean;
  /** True when some device carries integrated state (capacitors, inductors, op-amp poles…). */
  hasReactive: boolean;
  /** Most recent runtime failure (stops the transient). */
  error: Diagnostic | null = null;
  /** Load (fraction of rating) per device id, refreshed every accepted step. */
  load = new Map<string, number>();
  /** Total accepted steps. */
  steps = 0;
  private autoGround: number | null = null;

  constructor(netlist: Netlist, opts: SimOptions = {}) {
    this.netlist = netlist;
    this.reltol = opts.reltol ?? 1e-3;
    this.vntol = opts.vntol ?? 1e-6;
    this.abstol = opts.abstol ?? 1e-12;
    this.maxStep = opts.maxStep ?? 1e-3;
    this.failures = opts.failures ?? true;
    this.nodeCount = netlist.nodeNames.length;
    this.devices = netlist.elements.map((e) => createDevice(e));
    this.unknownNames = netlist.nodeNames.slice(1);
    let next = this.nodeCount - 1;
    for (const d of this.devices) {
      this.byId.set(d.id, d);
      if (d.internal > 0) {
        d.intBase = next;
        for (let k = 0; k < d.internal; k++) this.unknownNames.push(`${d.id}·int${k}`);
        next += d.internal;
      }
    }
    for (const d of this.devices) {
      if (d.branches > 0) {
        d.br0 = next;
        for (let k = 0; k < d.branches; k++) this.unknownNames.push(`${d.id}·i${k}`);
        next += d.branches;
      }
    }
    this.size = next;
    this.s = new Stamper(next);
    this.x = this.s.x;
    this.xNew = new Float64Array(next);
    this.hasNonlinear = this.devices.some((d) => d.nonlinear);
    this.hasReactive = this.devices.some((d) => d.lte !== undefined || d.type === 'motor');
    this.topology = analyzeTopology(netlist);
    const noGround = this.topology.find((d) => d.code === 'no-ground');
    if (noGround && noGround.node !== undefined) this.autoGround = noGround.node - 1;
  }

  device(id: string): Device | undefined {
    return this.byId.get(id);
  }

  /** Voltage of netlist node index (0 = ground). */
  nodeVoltage(node: number, x: Float64Array = this.x): number {
    return node <= 0 ? 0 : x[node - 1];
  }

  nodeIndex(name: string): number {
    return this.netlist.nodeNames.indexOf(name);
  }

  v(name: string): number {
    const i = this.nodeIndex(name);
    if (i < 0) throw new Error(`no node ${name}`);
    return this.nodeVoltage(i);
  }

  read(id: string): DeviceReading {
    const d = this.byId.get(id);
    if (!d) throw new Error(`no device ${id}`);
    return d.read(this.x);
  }

  private maxStepEff(): number {
    let m = this.maxStep;
    for (const d of this.devices) {
      if (d.maxStep) m = Math.min(m, d.maxStep());
    }
    return m;
  }

  private get dtMin(): number {
    return Math.max(1e-15, this.maxStepEff() * 1e-10);
  }

  // ------------------------------------------------------------------ Newton–Raphson

  private assemble(): void {
    const s = this.s;
    s.solver.clear();
    s.limited = false;
    for (const d of this.devices) d.stamp(s);
    const nn = this.nodeCount - 1;
    const g = 1e-12 + (s.gmin > 1e-12 ? s.gmin : 0);
    const A = s.solver.A;
    for (let i = 0; i < nn; i++) A[i * this.size + i] += g;
    if (this.autoGround !== null && this.autoGround >= 0) A[this.autoGround * this.size + this.autoGround] += 1;
  }

  /** Returns iterations used, −1 on non-convergence, or throws on a singular matrix. */
  private newton(maxIter: number): number {
    const s = this.s;
    const n = this.size;
    const nn = this.nodeCount - 1;
    for (let iter = 0; iter < maxIter; iter++) {
      s.iter = iter;
      this.assemble();
      const ok = s.solver.solve(this.xNew);
      if (!ok) {
        throw new SimulationError(explainSingular(this, s.solver.singularIndex));
      }
      let converged = !s.limited;
      for (let i = 0; i < n; i++) {
        const a = this.xNew[i];
        const b = s.x[i];
        if (!Number.isFinite(a)) return -1;
        const tol = this.reltol * Math.max(Math.abs(a), Math.abs(b)) + (i < nn ? this.vntol : this.abstol + 1e-9);
        if (Math.abs(a - b) > tol) converged = false;
      }
      s.x.set(this.xNew);
      if (!this.hasNonlinear) return iter + 1;
      if (converged && iter > 0) return iter + 1;
    }
    return -1;
  }

  private settleModes(maxIter: number): boolean {
    for (let k = 0; k < 12; k++) {
      let changed = false;
      for (const d of this.devices) if (d.postConverge && d.postConverge(this.s.x)) changed = true;
      if (!changed) return true;
      if (this.newton(maxIter) < 0) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ DC operating point

  /** DC operating point: plain Newton, then gmin stepping, then source stepping. */
  dcOp(): boolean {
    const s = this.s;
    s.mode = 'dc';
    s.t = 0;
    s.srcScale = 1;
    s.gmin = 1e-12;
    const save = Float64Array.from(s.x);
    if (this.newton(150) >= 0 && this.settleModes(150)) return true;
    // gmin stepping
    s.x.set(save);
    let ok = true;
    for (let g = 1e-2; g >= 1e-12; g /= 10) {
      s.gmin = g;
      if (this.newton(100) < 0) {
        ok = false;
        break;
      }
    }
    s.gmin = 1e-12;
    if (ok && this.newton(100) >= 0 && this.settleModes(100)) return true;
    // source stepping
    s.x.fill(0);
    let scale = 0;
    let step = 0.1;
    while (scale < 1) {
      const next = Math.min(1, scale + step);
      s.srcScale = next;
      const prev = Float64Array.from(s.x);
      if (this.newton(100) >= 0) {
        scale = next;
        step = Math.min(step * 1.5, 0.25);
      } else {
        s.x.set(prev);
        step /= 4;
        if (step < 1e-4) {
          s.srcScale = 1;
          this.error = {
            severity: 'error',
            code: 'no-convergence',
            title: 'The circuit could not be solved',
            message:
              'The solver could not find a consistent set of voltages. This usually means a part is driven far outside its normal range (for example a transistor or LED connected straight across a supply), or two sources fight each other.',
          };
          return false;
        }
      }
    }
    s.srcScale = 1;
    return this.newton(100) >= 0 && this.settleModes(100);
  }

  // ------------------------------------------------------------------ transient

  /** Start a transient from rest: capacitors discharged, inductors at zero current ("power on"). */
  startTransient(opts: { fromOp?: boolean } = {}): void {
    this.t = 0;
    this.error = null;
    if (opts.fromOp) this.dcOp();
    else this.s.x.fill(0);
    for (const d of this.devices) d.initTransient(this.s.x);
    this.hist = { times: [0] };
    this.beSteps = 2;
    this.stepsSinceDisc = 0;
    this.dtNext = Math.min(this.maxStepEff() * 1e-3, 1e-6);
    this.steps = 0;
  }

  /** Re-start the integration history after an external change (part edited, switch flipped). */
  markDiscontinuity(): void {
    this.beSteps = 2;
    this.stepsSinceDisc = 0;
    this.dtNext = Math.min(this.dtNext, this.maxStepEff() * 1e-3);
  }

  private nextBreakpoint(): number {
    let bp = Infinity;
    for (const d of this.devices) {
      if (d.nextBreakpoint) bp = Math.min(bp, d.nextBreakpoint(this.t));
    }
    return bp;
  }

  /** Take one accepted time step, never past `limit`. */
  step(limit = Infinity): StepInfo {
    const s = this.s;
    const dtMin = this.dtMin;
    let dt = Math.min(this.dtNext, this.maxStepEff());
    const bp = this.nextBreakpoint();
    let landed = false;
    if (bp - this.t <= dt * 1.0001) {
      dt = bp - this.t;
      landed = true;
    }
    if (limit - this.t < dt) {
      dt = limit - this.t;
      landed = false;
    }
    dt = Math.max(dt, dtMin);
    for (const d of this.devices) if (d.preStep) dt = Math.max(dtMin, Math.min(dt, d.preStep(this.t, dt)));
    const xOld = Float64Array.from(s.x);
    let rejected = 0;
    let iterations = 0;
    let ratio = 0;
    let method: Method = 'trap';
    for (let attempt = 0; ; attempt++) {
      method = this.beSteps > 0 ? 'be' : 'trap';
      s.mode = 'tran';
      s.t = this.t + dt;
      s.dt = dt;
      s.method = method;
      s.gmin = 1e-12;
      s.srcScale = 1;
      s.x.set(xOld);
      let iters: number;
      try {
        iters = this.newton(60);
        if (iters >= 0) {
          for (let k = 0; k < 6; k++) {
            let changed = false;
            for (const d of this.devices) if (d.type === 'supply' && d.postConverge && d.postConverge(s.x)) changed = true;
            if (!changed) break;
            iters = this.newton(60);
            if (iters < 0) break;
          }
        }
      } catch (e) {
        s.x.set(xOld);
        if (e instanceof SimulationError) this.error = e.diagnostic;
        throw e;
      }
      iterations += Math.max(iters, 0);
      if (iters < 0) {
        rejected++;
        dt /= 8;
        this.beSteps = Math.max(this.beSteps, 1);
        landed = false;
        if (dt < dtMin || attempt > 40) {
          s.x.set(xOld);
          this.error = {
            severity: 'error',
            code: 'no-convergence',
            title: 'Simulation stalled',
            message: `The solver could not take a time step at t = ${formatEng(this.t, 's')}. A part is probably switching violently or is driven far outside its range.`,
          };
          throw new SimulationError(this.error);
        }
        continue;
      }
      // event location (comparators, logic thresholds, relays)
      let f = 1;
      for (const d of this.devices) if (d.crossing) f = Math.min(f, d.crossing(xOld, s.x));
      if (f < 0.995 && attempt < 30) {
        const ndt = Math.max(dt * f * 1.0005, dtMin * 2);
        if (ndt < dt * 0.995) {
          dt = ndt;
          landed = false;
          rejected++;
          continue;
        }
      }
      // local truncation error
      ratio = 0;
      if (this.stepsSinceDisc >= 3) {
        for (const d of this.devices) if (d.lte) ratio = Math.max(ratio, d.lte(s.x, this.t + dt, dt, this.hist, method));
      }
      if (ratio > 1 && dt > dtMin * 10 && attempt < 30) {
        const order = method === 'trap' ? 3 : 2;
        dt = dt * Math.max(0.1, Math.min(0.9, 0.9 * Math.pow(ratio, -1 / order)));
        landed = false;
        rejected++;
        continue;
      }
      break;
    }
    // accept
    this.t += dt;
    let disc = false;
    for (const d of this.devices) if (d.accept(s.x, this.t, dt, method)) disc = true;
    this.hist.times.push(this.t);
    if (this.hist.times.length > 4) this.hist.times.shift();
    const order = method === 'trap' ? 3 : 2;
    const grow = ratio > 0 ? Math.min(2, Math.max(0.3, 0.9 * Math.pow(ratio, -1 / order))) : 2;
    this.dtNext = Math.min(dt * grow, this.maxStepEff());
    if (this.updateStress(dt)) disc = true;
    if (disc || landed) {
      this.beSteps = 2;
      this.stepsSinceDisc = 0;
      // Restart cautiously only when there is reactive state whose derivative may have jumped.
      if (this.hasReactive) this.dtNext = Math.min(this.dtNext, Math.max(this.maxStepEff() * 0.02, dtMin * 10));
    } else {
      if (this.beSteps > 0) this.beSteps--;
      this.stepsSinceDisc++;
    }
    this.steps++;
    return { dt, method, iterations, rejected };
  }

  /** Advance to time tEnd (or until the wall-clock budget runs out). Returns false if stopped early. */
  advance(tEnd: number, opts: { budgetMs?: number; onStep?: (sim: Simulator) => void } = {}): boolean {
    const t0 = opts.budgetMs !== undefined ? Date.now() : 0;
    while (this.t < tEnd - 1e-15) {
      this.step(tEnd);
      opts.onStep?.(this);
      if (opts.budgetMs !== undefined && Date.now() - t0 > opts.budgetMs) return false;
    }
    return true;
  }

  /** Run a full transient and sample the given node / device probes at every accepted step. */
  transient(
    tStop: number,
    probes: Record<string, (sim: Simulator) => number>,
    opts: { maxStep?: number; fromOp?: boolean } = {},
  ): { t: number[]; [k: string]: number[] } {
    if (opts.maxStep) this.maxStep = opts.maxStep;
    this.startTransient({ fromOp: opts.fromOp });
    const out: { t: number[]; [k: string]: number[] } = { t: [0] };
    for (const k of Object.keys(probes)) out[k] = [probes[k](this)];
    this.advance(tStop, {
      onStep: (sim) => {
        out.t.push(sim.t);
        for (const k of Object.keys(probes)) out[k].push(probes[k](sim));
      },
    });
    return out;
  }

  // ------------------------------------------------------------------ stress & failure

  private updateStress(dt: number): boolean {
    let failed = false;
    for (const d of this.devices) {
      const r = d.ratings();
      if (!r) continue;
      if (d.failed) {
        this.load.set(d.id, 0);
        continue;
      }
      const rd = d.read(this.s.x);
      let load = 0;
      if (r.maxP) load = Math.max(load, Math.abs(rd.p) / r.maxP);
      if (r.maxI) load = Math.max(load, Math.abs(rd.i) / r.maxI);
      if (r.maxV) load = Math.max(load, Math.abs(rd.v) / r.maxV);
      if (r.maxReverse && rd.v < 0) load = Math.max(load, -rd.v / r.maxReverse);
      this.load.set(d.id, load);
      if (r.tau) d.heat += (load - d.heat) * Math.min(1, dt / r.tau);
      if (!this.failures) continue;
      const instant = r.instantFail !== undefined && load > r.instantFail;
      const sustained = r.failAt !== undefined && d.heat > r.failAt;
      if (instant || sustained) {
        d.failed = true;
        d.failReason =
          r.maxReverse && rd.v < 0 && -rd.v / r.maxReverse >= load * 0.999
            ? 'reverse voltage'
            : r.maxP && Math.abs(rd.p) / r.maxP >= load * 0.999
              ? 'over-power'
              : r.maxV && Math.abs(rd.v) / r.maxV >= load * 0.999
                ? 'over-voltage'
                : 'over-current';
        failed = true;
      }
    }
    return failed;
  }

  repair(id: string): void {
    const d = this.byId.get(id);
    if (!d) return;
    d.failed = false;
    d.heat = 0;
    d.failReason = '';
    this.markDiscontinuity();
  }

  // ------------------------------------------------------------------ AC analysis

  /**
   * Small-signal AC sweep around the DC operating point. The excitation is the `acmag` of each source,
   * or 1 V on `sourceId` when given.
   */
  acSweep(opts: { fStart: number; fStop: number; pointsPerDecade?: number; sourceId?: string }): AcResult {
    if (!this.dcOp()) throw new SimulationError(this.error ?? (this.topology[0] as Diagnostic));
    const s = this.s;
    const n = this.size;
    // Jacobian at the operating point (DC mode stamps: caps open, inductors short)
    s.mode = 'dc';
    this.assemble();
    const G = Float64Array.from(s.solver.A);
    const rs = new ReactiveStamper(n);
    for (const d of this.devices) d.stampReactive?.(rs);
    const rhs = new Float64Array(n);
    for (const d of this.devices) {
      if (!d.acValue) continue;
      const mag = opts.sourceId ? (d.id === opts.sourceId ? 1 : 0) : d.acValue();
      if (!mag) continue;
      if (d.branches > 0) rhs[d.br0] += mag;
      else {
        const [a, b] = d.nodes;
        if (a >= 0) rhs[a] -= mag;
        if (b >= 0) rhs[b] += mag;
      }
    }
    const ppd = opts.pointsPerDecade ?? 40;
    const decades = Math.log10(opts.fStop / opts.fStart);
    const count = Math.max(2, Math.round(decades * ppd) + 1);
    const cs = new ComplexSolver(n);
    const res: AcResult = { freqs: [], re: [], im: [] };
    for (let k = 0; k < count; k++) {
      const f = opts.fStart * Math.pow(10, (decades * k) / (count - 1));
      const w = 2 * Math.PI * f;
      cs.re.set(G);
      for (let i = 0; i < n * n; i++) cs.im[i] = w * rs.B[i];
      cs.bre.set(rhs);
      cs.bim.fill(0);
      const xr = new Float64Array(n);
      const xi = new Float64Array(n);
      if (!cs.solve(xr, xi)) throw new SimulationError(explainSingular(this, -1));
      res.freqs.push(f);
      res.re.push(xr);
      res.im.push(xi);
    }
    return res;
  }

  /** Magnitude (linear) and phase (deg) of node `name` across an AC result. */
  acNode(res: AcResult, name: string, ref?: string): { mag: number[]; phase: number[] } {
    const i = this.nodeIndex(name) - 1;
    const j = ref ? this.nodeIndex(ref) - 1 : -1;
    const mag: number[] = [];
    const phase: number[] = [];
    for (let k = 0; k < res.freqs.length; k++) {
      const re = (i >= 0 ? res.re[k][i] : 0) - (j >= 0 ? res.re[k][j] : 0);
      const im = (i >= 0 ? res.im[k][i] : 0) - (j >= 0 ? res.im[k][j] : 0);
      mag.push(Math.hypot(re, im));
      phase.push((Math.atan2(im, re) * 180) / Math.PI);
    }
    return { mag, phase };
  }

  // ------------------------------------------------------------------ state transfer (live editing)

  saveStates(): Map<string, unknown> {
    const m = new Map<string, unknown>();
    for (const d of this.devices) m.set(d.id, d.saveState());
    return m;
  }

  /** Continue from another simulator's state after the netlist changed. */
  adoptFrom(prev: Simulator): void {
    const states = prev.saveStates();
    this.startTransient();
    // carry node voltages by name for a good first guess
    for (let i = 1; i < this.nodeCount; i++) {
      const j = prev.netlist.nodeNames.indexOf(this.netlist.nodeNames[i]);
      if (j > 0) this.s.x[i - 1] = prev.s.x[j - 1];
    }
    for (const d of this.devices) {
      const st = states.get(d.id);
      if (st !== undefined) d.loadState(st);
    }
    this.t = prev.t;
    this.hist = { times: [prev.t] };
    this.maxStep = prev.maxStep;
    this.failures = prev.failures;
    this.markDiscontinuity();
  }

  /** Live diagnostics: stress warnings, failures, unpowered chips. */
  liveDiagnostics(): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of this.devices) {
      const name = d.partId ?? d.id;
      if (d.failed) {
        out.push({
          severity: 'error',
          code: 'failed',
          title: `${name} is damaged`,
          message: `${name} failed from ${d.failReason}. Fix the cause, then tap "Repair" to replace it.`,
          elementId: d.id,
          partId: d.partId,
        });
        continue;
      }
      const load = this.load.get(d.id) ?? 0;
      const r = d.ratings();
      if (r && load > 1.0) {
        const rd = d.read(this.s.x);
        const reverse = r.maxReverse && rd.v < 0 && -rd.v / r.maxReverse >= load * 0.999;
        const overP = r.maxP && Math.abs(rd.p) / r.maxP >= load * 0.999;
        const overV = r.maxV && Math.abs(rd.v) / r.maxV >= load * 0.999;
        out.push(
          reverse
            ? {
                severity: 'warning',
                code: 'reverse-polarity',
                title: `${name} is connected backwards`,
                message: `${name} sees ${formatEng(rd.v, 'V')} in the reverse direction; its limit is ${formatEng(-(r.maxReverse ?? 0), 'V')}. Swap its leads.`,
                elementId: d.id,
                partId: d.partId,
              }
            : overP
              ? {
                  severity: 'warning',
                  code: 'over-power',
                  title: `${name} is overheating`,
                  message: `${name} dissipates ${formatEng(Math.abs(rd.p), 'W')} but is rated for ${formatEng(r.maxP ?? 0, 'W')}. Use a larger resistance or a higher-wattage part.`,
                  elementId: d.id,
                  partId: d.partId,
                }
              : overV
                ? {
                    severity: 'warning',
                    code: 'over-voltage',
                    title: `${name} is over its voltage rating`,
                    message: `${name} has ${formatEng(Math.abs(rd.v), 'V')} across it; its rating is ${formatEng(r.maxV ?? 0, 'V')}.`,
                    elementId: d.id,
                    partId: d.partId,
                  }
                : {
                    severity: 'warning',
                    code: 'over-current',
                    title: `Too much current through ${name}`,
                    message: `${name} carries ${formatEng(Math.abs(rd.i), 'A')}; its limit is ${formatEng(r.maxI ?? 0, 'A')}. Add or increase a series resistor.`,
                    elementId: d.id,
                    partId: d.partId,
                  },
        );
      }
      if (d.type === 'logic') {
        const rd = d.read(this.s.x);
        if (!rd.extra?.powered && this.t > 1e-6) {
          out.push({
            severity: 'warning',
            code: 'unpowered-chip',
            title: `${name} has no power`,
            message: `${name} needs its VCC pin at +2 to +6 V relative to its GND pin (it sees ${formatEng(rd.v, 'V')}). Wire VCC and GND to the power rails.`,
            elementId: d.id,
            partId: d.partId,
          });
        }
      }
    }
    return out;
  }
}
