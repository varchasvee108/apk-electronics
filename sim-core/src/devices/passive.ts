import { Device, StateHistory, type History, type Ratings } from '../device';
import type { ReactiveStamper, Stamper } from '../stamper';
import type { DeviceReading, ElementSpec, Method } from '../types';

const OPEN_G = 1e-10;

export class Resistor extends Device {
  r: number;
  constructor(spec: ElementSpec) {
    super(spec);
    this.r = Math.max(this.num('r', 1000), 1e-6);
  }
  protected onParamsChanged(): void {
    this.r = Math.max(this.num('r', 1000), 1e-6);
  }
  stamp(s: Stamper): void {
    s.conductance(this.nodes[0], this.nodes[1], this.failed ? OPEN_G : 1 / this.r);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = this.failed ? v * OPEN_G : v / this.r;
    return { v, i, p: v * i, pinI: [i, -i] };
  }
  ratings(): Ratings | null {
    const maxP = this.num('maxP', 0.25);
    return maxP > 0 ? { maxP, tau: 0.4, failAt: 2.5, instantFail: 12 } : null;
  }
}

export class Capacitor extends Device {
  c: number;
  vPrev = 0;
  iPrev = 0;
  geq = 0;
  ieq = 0;
  hist = new StateHistory();
  constructor(spec: ElementSpec) {
    super(spec);
    this.c = Math.max(this.num('c', 1e-6), 1e-18);
    this.vPrev = this.num('ic', 0);
  }
  protected onParamsChanged(): void {
    this.c = Math.max(this.num('c', 1e-6), 1e-18);
  }
  initTransient(): void {
    this.vPrev = this.num('ic', 0);
    this.iPrev = 0;
    this.hist.reset(this.vPrev);
  }
  stamp(s: Stamper): void {
    const [a, b] = this.nodes;
    if (this.failed) {
      s.conductance(a, b, OPEN_G);
      return;
    }
    if (s.mode === 'dc') return;
    if (s.method === 'be') {
      this.geq = this.c / s.dt;
      this.ieq = -this.geq * this.vPrev;
    } else {
      this.geq = (2 * this.c) / s.dt;
      this.ieq = -this.geq * this.vPrev - this.iPrev;
    }
    s.conductance(a, b, this.geq);
    s.current(a, b, this.ieq);
  }
  stampReactive(r: ReactiveStamper): void {
    if (!this.failed) r.capacitance(this.nodes[0], this.nodes[1], this.c);
  }
  accept(x: Float64Array): boolean {
    const v = this.pv(x, 0) - this.pv(x, 1);
    this.iPrev = this.geq * v + this.ieq;
    this.vPrev = v;
    this.hist.push(v);
    return false;
  }
  lte(x: Float64Array, t: number, _dt: number, hist: History, method: Method): number {
    const v = this.pv(x, 0) - this.pv(x, 1);
    return this.hist.lteRatio(v, t, hist, method, 1e-3, 1e-5);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = this.iPrev;
    return {
      v,
      i,
      p: v * i,
      pinI: [i, -i],
      extra: { charge: this.c * v, energy: 0.5 * this.c * v * v },
    };
  }
  ratings(): Ratings | null {
    const polar = this.bool('polarized', false);
    return {
      maxV: this.num('vmax', 50),
      maxReverse: polar ? 1.0 : undefined,
      tau: 0.05,
      failAt: 1.6,
      instantFail: polar ? 4 : 3,
    };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), vPrev: this.vPrev };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { vPrev?: number };
    if (st && typeof st.vPrev === 'number') {
      this.params.ic = st.vPrev;
      this.vPrev = st.vPrev;
    }
  }
}

/** Ideal inductor using a branch current unknown. Winding resistance is a separate resistor. */
export class Inductor extends Device {
  l: number;
  iPrev = 0;
  vPrev = 0;
  hist = new StateHistory();
  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 1;
    this.l = Math.max(this.num('l', 1e-3), 1e-12);
    this.iPrev = this.num('ic', 0);
  }
  protected onParamsChanged(): void {
    this.l = Math.max(this.num('l', 1e-3), 1e-12);
  }
  initTransient(): void {
    this.iPrev = this.num('ic', 0);
    this.vPrev = 0;
    this.hist.reset(this.iPrev);
  }
  stamp(s: Stamper): void {
    const [a, b] = this.nodes;
    const br = this.br0;
    s.add(a, br, 1);
    s.add(b, br, -1);
    s.add(br, a, 1);
    s.add(br, b, -1);
    if (s.mode === 'dc') return; // short circuit
    if (s.method === 'be') {
      const req = this.l / s.dt;
      s.add(br, br, -req);
      s.rhs(br, -req * this.iPrev);
    } else {
      const req = (2 * this.l) / s.dt;
      s.add(br, br, -req);
      s.rhs(br, -req * this.iPrev - this.vPrev);
    }
  }
  stampReactive(r: ReactiveStamper): void {
    r.add(this.br0, this.br0, -this.l);
  }
  accept(x: Float64Array): boolean {
    this.iPrev = x[this.br0];
    this.vPrev = this.pv(x, 0) - this.pv(x, 1);
    this.hist.push(this.iPrev);
    return false;
  }
  lte(x: Float64Array, t: number, _dt: number, hist: History, method: Method): number {
    return this.hist.lteRatio(x[this.br0], t, hist, method, 1e-3, 1e-7);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = x[this.br0];
    return { v, i, p: v * i, pinI: [i, -i], extra: { energy: 0.5 * this.l * i * i } };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), iPrev: this.iPrev };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { iPrev?: number };
    if (st && typeof st.iPrev === 'number') {
      this.params.ic = st.iPrev;
      this.iPrev = st.iPrev;
    }
  }
}

/** Two coupled inductors. Nodes: [p1, p2, s1, s2]. */
export class Transformer extends Device {
  l1 = 1;
  l2 = 1;
  m = 1;
  i1p = 0;
  i2p = 0;
  v1p = 0;
  v2p = 0;
  h1 = new StateHistory();
  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 2;
    this.onParamsChanged();
  }
  protected onParamsChanged(): void {
    this.l1 = Math.max(this.num('l1', 1), 1e-9);
    const n = this.num('n', 0.1);
    this.l2 = this.l1 * n * n;
    const k = Math.min(Math.max(this.num('k', 0.999), 0), 0.99999);
    this.m = k * Math.sqrt(this.l1 * this.l2);
  }
  initTransient(): void {
    this.i1p = this.i2p = this.v1p = this.v2p = 0;
    this.h1.reset(0);
  }
  stamp(s: Stamper): void {
    const [p1, p2, s1, s2] = this.nodes;
    const b1 = this.br0;
    const b2 = this.br0 + 1;
    s.add(p1, b1, 1);
    s.add(p2, b1, -1);
    s.add(b1, p1, 1);
    s.add(b1, p2, -1);
    s.add(s1, b2, 1);
    s.add(s2, b2, -1);
    s.add(b2, s1, 1);
    s.add(b2, s2, -1);
    if (s.mode === 'dc') return;
    const h = s.method === 'be' ? 1 / s.dt : 2 / s.dt;
    s.add(b1, b1, -h * this.l1);
    s.add(b1, b2, -h * this.m);
    s.add(b2, b1, -h * this.m);
    s.add(b2, b2, -h * this.l2);
    let r1 = -h * (this.l1 * this.i1p + this.m * this.i2p);
    let r2 = -h * (this.m * this.i1p + this.l2 * this.i2p);
    if (s.method === 'trap') {
      r1 -= this.v1p;
      r2 -= this.v2p;
    }
    s.rhs(b1, r1);
    s.rhs(b2, r2);
  }
  stampReactive(r: ReactiveStamper): void {
    const b1 = this.br0;
    const b2 = this.br0 + 1;
    r.add(b1, b1, -this.l1);
    r.add(b1, b2, -this.m);
    r.add(b2, b1, -this.m);
    r.add(b2, b2, -this.l2);
  }
  accept(x: Float64Array): boolean {
    this.i1p = x[this.br0];
    this.i2p = x[this.br0 + 1];
    this.v1p = this.pv(x, 0) - this.pv(x, 1);
    this.v2p = this.pv(x, 2) - this.pv(x, 3);
    this.h1.push(this.i1p);
    return false;
  }
  lte(x: Float64Array, t: number, _dt: number, hist: History, method: Method): number {
    return this.h1.lteRatio(x[this.br0], t, hist, method, 1e-3, 1e-7);
  }
  read(x: Float64Array): DeviceReading {
    const v1 = this.pv(x, 0) - this.pv(x, 1);
    const v2 = this.pv(x, 2) - this.pv(x, 3);
    const i1 = x[this.br0];
    const i2 = x[this.br0 + 1];
    return { v: v1, i: i1, p: v1 * i1 + v2 * i2, pinI: [i1, -i1, i2, -i2], extra: { vs: v2, is: -i2 } };
  }
}

/** Ideal-ish switch: a small resistance when closed, a huge one when open. */
export class Switch extends Device {
  g(): number {
    return this.bool('closed', false) ? 1 / this.num('ron', 0.02) : 1 / this.num('roff', 1e9);
  }
  stamp(s: Stamper): void {
    s.conductance(this.nodes[0], this.nodes[1], this.g());
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = v * this.g();
    return { v, i, p: v * i, pinI: [i, -i], extra: { closed: this.bool('closed', false) } };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('maxI', 3), tau: 0.5, failAt: 3, instantFail: 20 };
  }
}
