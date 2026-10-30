import { Device, StateHistory, type History, type Ratings } from '../device';
import type { ReactiveStamper, Stamper } from '../stamper';
import type { DeviceReading, ElementSpec, Method } from '../types';

/**
 * Electromechanical relay. Nodes [coil+, coil−, COM, NO, NC].
 * Coil = R + L in series; contacts switch with pull-in / drop-out hysteresis on the coil current.
 */
export class Relay extends Device {
  energized = false;
  iPrev = 0;
  vPrev = 0;
  hist = new StateHistory();
  constructor(spec: ElementSpec) {
    super(spec);
    this.internal = 1;
    this.branches = 1;
  }
  initTransient(): void {
    this.iPrev = 0;
    this.vPrev = 0;
    this.energized = false;
    this.hist.reset(0);
  }
  stamp(s: Stamper): void {
    const [c1, c2, com, no, nc] = this.nodes;
    const mid = this.intBase;
    const br = this.br0;
    s.conductance(c1, mid, 1 / this.num('rcoil', 70));
    const L = this.num('lcoil', 0.02);
    s.add(mid, br, 1);
    s.add(c2, br, -1);
    s.add(br, mid, 1);
    s.add(br, c2, -1);
    if (s.mode === 'tran') {
      const req = (s.method === 'be' ? 1 : 2) * (L / s.dt);
      s.add(br, br, -req);
      s.rhs(br, -req * this.iPrev - (s.method === 'trap' ? this.vPrev : 0));
    }
    const gon = 1 / this.num('ron', 0.05);
    const goff = 1e-9;
    s.conductance(com, no, this.energized ? gon : goff);
    s.conductance(com, nc, this.energized ? goff : gon);
  }
  stampReactive(r: ReactiveStamper): void {
    r.add(this.br0, this.br0, -this.num('lcoil', 0.02));
  }
  private want(i: number): boolean {
    const a = Math.abs(i);
    if (this.energized) return a > this.num('idrop', 0.015);
    return a >= this.num('ipull', 0.05);
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    const a = Math.abs(xOld[this.br0]);
    const b = Math.abs(xNew[this.br0]);
    const th = this.energized ? this.num('idrop', 0.015) : this.num('ipull', 0.05);
    if (!this.energized && a < th && b >= th) return (th - a) / (b - a);
    if (this.energized && a > th && b <= th) return (a - th) / (a - b);
    return 1;
  }
  accept(x: Float64Array): boolean {
    this.iPrev = x[this.br0];
    this.vPrev = x[this.intBase] - this.pv(x, 1);
    this.hist.push(this.iPrev);
    const w = this.want(this.iPrev);
    if (w !== this.energized) {
      this.energized = w;
      return true;
    }
    return false;
  }
  postConverge(x: Float64Array): boolean {
    const w = this.want(x[this.br0]);
    if (w !== this.energized) {
      this.energized = w;
      return true;
    }
    return false;
  }
  lte(x: Float64Array, t: number, _dt: number, hist: History, method: Method): number {
    return this.hist.lteRatio(x[this.br0], t, hist, method, 1e-3, 1e-6);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = x[this.br0];
    return { v, i, p: v * i, pinI: [i, -i, 0, 0, 0], extra: { energized: this.energized } };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), energized: this.energized };
  }
}

/** Brushed DC motor: armature R + L + back-EMF k·ω, rotor inertia J, viscous friction b. Nodes [+, −]. */
export class DCMotor extends Device {
  omega = 0;
  theta = 0;
  iPrev = 0;
  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 1;
  }
  initTransient(): void {
    this.omega = 0;
    this.iPrev = 0;
  }
  stamp(s: Stamper): void {
    const [a, b] = this.nodes;
    const br = this.br0;
    const R = this.num('r', 2);
    const L = this.num('l', 5e-4);
    const k = this.num('k', 0.005);
    const fr = this.num('b', 1e-6);
    const load = this.num('load', 0);
    s.add(a, br, 1);
    s.add(b, br, -1);
    s.add(br, a, 1);
    s.add(br, b, -1);
    if (s.mode === 'dc') {
      s.add(br, br, -(R + (k * k) / fr));
      s.rhs(br, (-k * load) / fr);
      return;
    }
    const req = R + L / s.dt;
    s.add(br, br, -req);
    s.rhs(br, -(L / s.dt) * this.iPrev + k * this.omega);
  }
  maxStep(): number {
    const R = this.num('r', 2);
    const k = this.num('k', 0.005);
    return (this.num('j', 1e-6) * R) / (k * k) / 40;
  }
  accept(x: Float64Array, _t: number, dt: number): boolean {
    const i = x[this.br0];
    this.iPrev = i;
    const k = this.num('k', 0.005);
    const J = this.num('j', 1e-6);
    const fr = this.num('b', 1e-6);
    const load = this.num('load', 0) * Math.tanh(this.omega / 2);
    this.omega = (this.omega + (dt * (k * i - load)) / J) / (1 + (dt * fr) / J);
    this.theta = (this.theta + this.omega * dt) % (2 * Math.PI * 1000);
    return false;
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = x[this.br0];
    return {
      v,
      i,
      p: v * i,
      pinI: [i, -i],
      extra: { rpm: (this.omega * 60) / (2 * Math.PI), angle: this.theta, backEmf: this.num('k', 0.005) * this.omega },
    };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('maxI', 1.2) };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), omega: this.omega, theta: this.theta, iPrev: this.iPrev };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { omega?: number; theta?: number; iPrev?: number };
    if (st?.omega !== undefined) this.omega = st.omega;
    if (st?.theta !== undefined) this.theta = st.theta;
    if (st?.iPrev !== undefined) this.iPrev = st.iPrev;
  }
}
