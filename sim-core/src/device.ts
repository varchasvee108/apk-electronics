import type { ReactiveStamper, Stamper } from './stamper';
import type { DeviceReading, ElementSpec, Method, Params, ParamValue } from './types';

export interface Ratings {
  /** Max continuous power (W). */
  maxP?: number;
  /** Max continuous current magnitude (A). */
  maxI?: number;
  /** Max voltage magnitude across the main terminals (V). */
  maxV?: number;
  /** Max reverse voltage for polarised parts (V, positive number). */
  maxReverse?: number;
  /** Thermal time constant (s) for the heat model. */
  tau?: number;
  /** Sustained load (×rating) at which the part fails. */
  failAt?: number;
  /** Instantaneous load (×rating) at which the part fails immediately. */
  instantFail?: number;
}

export interface History {
  /** Accepted times, newest last (up to 4). */
  times: number[];
}

export abstract class Device {
  readonly id: string;
  readonly type: string;
  readonly partId?: string;
  params: Params;
  /** Unknown indices for the external pins (−1 = ground). */
  nodes: number[];
  /** Number of internal nodes requested and index of the first one. */
  internal = 0;
  intBase = -1;
  /** Number of branch-current unknowns requested and index of the first one. */
  branches = 0;
  br0 = -1;
  nonlinear = false;
  /** Set when the part has been destroyed by over-stress; stamps as an open circuit. */
  failed = false;
  failReason = '';
  /** Normalised heat (1 = sustained full rating). */
  heat = 0;

  constructor(spec: ElementSpec) {
    this.id = spec.id;
    this.type = spec.type;
    this.partId = spec.partId;
    this.params = { ...spec.params };
    this.nodes = spec.nodes.map((n) => n - 1);
  }

  num(name: string, fallback: number): number {
    const v = this.params[name];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return fallback;
  }
  str(name: string, fallback: string): string {
    const v = this.params[name];
    return typeof v === 'string' ? v : fallback;
  }
  bool(name: string, fallback: boolean): boolean {
    const v = this.params[name];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return fallback;
  }

  /** Update a parameter in place (pot position, switch state, light level…). */
  setParam(name: string, value: ParamValue): void {
    this.params[name] = value;
    this.onParamsChanged();
  }
  protected onParamsChanged(): void {}

  /** Voltage of pin k for solution x. */
  pv(x: Float64Array, k: number): number {
    const i = this.nodes[k];
    return i === undefined || i < 0 ? 0 : x[i];
  }

  abstract stamp(s: Stamper): void;
  /** Frequency-proportional terms for AC analysis. */
  stampReactive?(r: ReactiveStamper): void;
  /** Called before the transient run (UIC: capacitors discharged, inductors at rest). */
  initTransient(_x: Float64Array): void {}
  /** Commit state after an accepted time step. Return true if a discontinuity happened. */
  accept(_x: Float64Array, _t: number, _dt: number, _method: Method): boolean {
    return false;
  }
  /** Fraction (0..1] of the step at which this device changes discrete state, or 1 if none. */
  crossing?(xOld: Float64Array, xNew: Float64Array): number;
  /** Next time > t at which a source waveform has a corner. */
  nextBreakpoint?(t: number): number;
  /** Largest step the device tolerates (e.g. period / 40 for a sine). */
  maxStep?(): number;
  /** Ask the device how far it may advance (used by the AVR co-simulation). Returns allowed dt. */
  preStep?(t: number, dt: number): number;
  /** Local truncation error ratio (err / tol) for the proposed solution; ≤ 1 is acceptable. */
  lte?(x: Float64Array, t: number, dt: number, hist: History, method: Method): number;
  /** After NR converged: switch discrete modes. Return true when the solve must be repeated. */
  postConverge?(x: Float64Array): boolean;
  /** Live values for the UI. */
  abstract read(x: Float64Array): DeviceReading;
  ratings(): Ratings | null {
    return null;
  }
  /** Small-signal source value for AC analysis (only sources). */
  acValue?(): number;
  saveState(): unknown {
    return { failed: this.failed, failReason: this.failReason, heat: this.heat };
  }
  loadState(s: unknown): void {
    const st = s as { failed?: boolean; failReason?: string; heat?: number } | null;
    if (!st) return;
    this.failed = !!st.failed;
    this.failReason = st.failReason ?? '';
    this.heat = st.heat ?? 0;
  }
}

/** Keeps the last few accepted values of a state variable to estimate truncation error. */
export class StateHistory {
  vals: number[] = [];
  push(v: number): void {
    this.vals.push(v);
    if (this.vals.length > 3) this.vals.shift();
  }
  reset(v: number): void {
    this.vals = [v];
  }
  /**
   * Ratio err/tol of a new value for the integration method, using divided differences.
   * Trapezoidal LTE ≈ dt³·|x'''|/12, backward Euler ≈ dt²·|x''|/2.
   */
  lteRatio(xNew: number, tNew: number, hist: History, method: Method, reltol: number, abstol: number): number {
    const ts = hist.times;
    const need = method === 'trap' ? 3 : 2;
    if (this.vals.length < need || ts.length < need) return 0;
    const T = [...ts.slice(ts.length - need), tNew];
    const X = [...this.vals.slice(this.vals.length - need), xNew];
    // Newton divided differences.
    const dd = X.slice();
    for (let lvl = 1; lvl <= need; lvl++) {
      for (let i = need; i >= lvl; i--) {
        const den = T[i] - T[i - lvl];
        if (den <= 0) return 0;
        dd[i] = (dd[i] - dd[i - 1]) / den;
      }
    }
    const dt = tNew - ts[ts.length - 1];
    const deriv = Math.abs(dd[need]) * (method === 'trap' ? 6 : 2);
    const err = method === 'trap' ? (dt * dt * dt * deriv) / 12 : (dt * dt * deriv) / 2;
    const tol = reltol * Math.max(Math.abs(xNew), Math.abs(X[need - 1])) + abstol;
    return err / tol;
  }
}
