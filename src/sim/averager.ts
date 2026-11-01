import type { Simulator } from '@sim/simulator';
import type { DeviceReading } from '@sim/types';

/**
 * Display readings are averaged over each display interval, the way real instruments (and eyes) do:
 * a DC meter shows the mean, an AC reading is RMS, a PWM-dimmed LED looks as bright as its average
 * current. Sampling instantaneous values 25 times a second instead aliases anything faster than that
 * (mains, audio, PWM) into random-looking jumps.
 */

/** Numeric extras that are meaningful to average (others, like a motor's angle, use the latest value). */
const AVERAGED_EXTRAS = new Set(['brightness', 'rpm', 'ib', 'ic', 'ie', 'vbe', 'vgs', 'vd', 'backEmf', 'vin', 'vs', 'is', 'charge', 'energy']);

interface Acc {
  v: number;
  i: number;
  p: number;
  v2: number;
  i2: number;
  vmin: number;
  vmax: number;
  imin: number;
  imax: number;
  pinI: number[] | null;
  extra: Record<string, number>;
}

export interface AveragedReading extends DeviceReading {
  /** RMS of the voltage / current over the interval. */
  vrms: number;
  irms: number;
  vmin: number;
  vmax: number;
  imin: number;
  imax: number;
}

const newAcc = (): Acc => ({ v: 0, i: 0, p: 0, v2: 0, i2: 0, vmin: Infinity, vmax: -Infinity, imin: Infinity, imax: -Infinity, pinI: null, extra: {} });

export class ReadingAverager {
  private w = 0;
  private lastT = NaN;
  private nodeSum: Float64Array;
  private nodeMin: Float64Array;
  private nodeMax: Float64Array;
  private acc = new Map<string, Acc>();
  private latest = new Map<string, DeviceReading>();
  /** Voltage between two nodes (meter probes), tracked sample by sample for true AC RMS. */
  private pair: { a: number; b: number; w: number; sum: number; sq: number; min: number; max: number } | null = null;

  /**
   * Track V(a) − V(b) (the multimeter probes); pass null to stop. The pair keeps its own time weight:
   * probes moved halfway through a display interval must not divide a fresh sum by the whole interval
   * (that read 0 V, or a fraction of the real value, right after every probe move).
   */
  trackPair(a: number | null, b: number | null): void {
    if (a === null || b === null) {
      this.pair = null;
      return;
    }
    if (this.pair && this.pair.a === a && this.pair.b === b) return;
    this.pair = { a, b, w: 0, sum: 0, sq: 0, min: Infinity, max: -Infinity };
  }

  /** Mean, RMS (of the AC part) and peak-to-peak of the tracked pair, or null. */
  pairStats(sim: Simulator): { mean: number; acRms: number; pp: number } | null {
    const p = this.pair;
    if (!p) return null;
    const now = sim.nodeVoltage(p.a) - sim.nodeVoltage(p.b);
    if (p.w <= 0) return { mean: now, acRms: 0, pp: Number.isFinite(p.max - p.min) ? p.max - p.min : 0 };
    const mean = p.sum / p.w;
    return { mean, acRms: Math.sqrt(Math.max(0, p.sq / p.w - mean * mean)), pp: p.max - p.min };
  }

  constructor(
    private ids: string[],
    private nodeCount: number,
  ) {
    this.nodeSum = new Float64Array(nodeCount);
    this.nodeMin = new Float64Array(nodeCount).fill(Infinity);
    this.nodeMax = new Float64Array(nodeCount).fill(-Infinity);
  }

  /** Total simulated time accumulated since the last reset. */
  get weight(): number {
    return this.w;
  }

  /** Record the simulator's current (accepted) solution. Returns the instantaneous readings. */
  sample(sim: Simulator): Map<string, DeviceReading> {
    const dt = Number.isNaN(this.lastT) ? 0 : Math.max(0, sim.t - this.lastT);
    this.lastT = sim.t;
    this.w += dt;
    if (this.pair) {
      const d = sim.nodeVoltage(this.pair.a) - sim.nodeVoltage(this.pair.b);
      this.pair.w += dt;
      this.pair.sum += d * dt;
      this.pair.sq += d * d * dt;
      this.pair.min = Math.min(this.pair.min, d);
      this.pair.max = Math.max(this.pair.max, d);
    }
    for (let n = 1; n < this.nodeCount; n++) {
      const v = sim.nodeVoltage(n);
      this.nodeSum[n] += v * dt;
      if (v < this.nodeMin[n]) this.nodeMin[n] = v;
      if (v > this.nodeMax[n]) this.nodeMax[n] = v;
    }
    for (const id of this.ids) {
      const dev = sim.device(id);
      if (!dev) continue;
      const r = dev.read(sim.x);
      this.latest.set(id, r);
      let a = this.acc.get(id);
      if (!a) {
        a = newAcc();
        this.acc.set(id, a);
      }
      a.v += r.v * dt;
      a.i += r.i * dt;
      a.p += r.p * dt;
      a.v2 += r.v * r.v * dt;
      a.i2 += r.i * r.i * dt;
      a.vmin = Math.min(a.vmin, r.v);
      a.vmax = Math.max(a.vmax, r.v);
      a.imin = Math.min(a.imin, r.i);
      a.imax = Math.max(a.imax, r.i);
      if (r.pinI) {
        if (!a.pinI) a.pinI = new Array(r.pinI.length).fill(0);
        for (let k = 0; k < r.pinI.length; k++) a.pinI[k] += (r.pinI[k] ?? 0) * dt;
      }
      if (r.extra)
        for (const [k, val] of Object.entries(r.extra)) if (typeof val === 'number' && AVERAGED_EXTRAS.has(k)) a.extra[k] = (a.extra[k] ?? 0) + val * dt;
    }
    return this.latest;
  }

  /** Averaged node voltages plus their min / max over the interval. */
  nodes(sim: Simulator): { mean: Float64Array; min: Float64Array; max: Float64Array } {
    const mean = new Float64Array(this.nodeCount);
    const min = new Float64Array(this.nodeCount);
    const max = new Float64Array(this.nodeCount);
    for (let n = 1; n < this.nodeCount; n++) {
      const now = sim.nodeVoltage(n);
      mean[n] = this.w > 0 ? this.nodeSum[n] / this.w : now;
      min[n] = Number.isFinite(this.nodeMin[n]) ? this.nodeMin[n] : now;
      max[n] = Number.isFinite(this.nodeMax[n]) ? this.nodeMax[n] : now;
    }
    return { mean, min, max };
  }

  /** Averaged reading of one element (falls back to the instantaneous value when nothing was accumulated). */
  reading(sim: Simulator, id: string): AveragedReading | null {
    const dev = sim.device(id);
    if (!dev) return null;
    const now = this.latest.get(id) ?? dev.read(sim.x);
    const a = this.acc.get(id);
    const w = this.w;
    if (!a || w <= 0) {
      return { ...now, vrms: Math.abs(now.v), irms: Math.abs(now.i), vmin: now.v, vmax: now.v, imin: now.i, imax: now.i };
    }
    const extra: Record<string, number | string | boolean> = { ...(now.extra ?? {}) };
    for (const [k, sum] of Object.entries(a.extra)) extra[k] = sum / w;
    return {
      v: a.v / w,
      i: a.i / w,
      p: a.p / w,
      pinI: a.pinI ? a.pinI.map((x) => x / w) : now.pinI,
      extra,
      vrms: Math.sqrt(Math.max(0, a.v2 / w)),
      irms: Math.sqrt(Math.max(0, a.i2 / w)),
      vmin: a.vmin,
      vmax: a.vmax,
      imin: a.imin,
      imax: a.imax,
    };
  }

  /** Start a new interval (the time base carries on, so the next sample is weighted correctly). */
  reset(): void {
    this.w = 0;
    this.nodeSum.fill(0);
    this.nodeMin.fill(Infinity);
    this.nodeMax.fill(-Infinity);
    this.acc.clear();
    if (this.pair) this.pair = { ...this.pair, w: 0, sum: 0, sq: 0, min: Infinity, max: -Infinity };
  }
}
