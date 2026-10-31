import { Device, StateHistory, type History, type Ratings } from '../device';
import type { ReactiveStamper, Stamper } from '../stamper';
import type { DeviceReading, ElementSpec, Method } from '../types';

/**
 * Op-amp macro model. Nodes [in+, in−, V+, V−, out].
 *  - input resistance between the inputs
 *  - gain stage: internal node p driven by a slew-limited transconductance into a capacitor,
 *    giving a single dominant pole at GBW/A0 and a maximum slew rate
 *  - output: p passed through a smooth (tanh) clamp to the rails minus headroom, with output resistance
 */
export class OpAmp extends Device {
  a0: number;
  gbw: number;
  sr: number;
  rin: number;
  rout: number;
  hHi: number;
  hLo: number;
  /** Internal-node scaling: keeps the matrix well conditioned. */
  readonly g0 = 1e-6;
  cp: number;
  ism: number;
  vPrev = 0;
  iPrev = 0;
  geq = 0;
  ieq = 0;
  hist = new StateHistory();
  constructor(spec: ElementSpec) {
    super(spec);
    this.nonlinear = true;
    this.internal = 1;
    this.branches = 1;
    this.a0 = this.num('a0', 1e5);
    this.gbw = this.num('gbw', 1e6);
    this.sr = this.num('sr', 0.5e6);
    this.rin = this.num('rin', 2e6);
    this.rout = this.num('rout', 50);
    this.hHi = this.num('hhi', 1.5);
    this.hLo = this.num('hlo', 1.5);
    const fp = this.gbw / this.a0;
    this.cp = this.g0 / (2 * Math.PI * fp);
    this.ism = this.sr * this.cp;
  }
  initTransient(x: Float64Array): void {
    this.vPrev = x[this.intBase] ?? 0;
    this.iPrev = 0;
    this.hist.reset(this.vPrev);
  }
  /** Output clamp: y ≈ p inside the rails, flattening sharply at (VCC − hHi) and (VEE + hLo). */
  private sat(pv: number, vcc: number, vee: number) {
    let hi = vcc - this.hHi;
    let lo = vee + this.hLo;
    if (hi < lo) hi = lo = (vcc + vee) / 2;
    const w = 0.02;
    const sp = (z: number) => (z > 30 ? z : Math.log1p(Math.exp(z)));
    const sg = (z: number) => 1 / (1 + Math.exp(-z));
    const zh = (pv - hi) / w;
    const zl = (lo - pv) / w;
    const y = pv - w * sp(zh) + w * sp(zl);
    const sh = sg(zh);
    const sl = sg(zl);
    return { y, dydp: 1 - sh - sl, dVcc: sh, dVee: sl };
  }
  stamp(s: Stamper): void {
    const [ip, im, vcc, vee, out] = this.nodes;
    const pn = this.intBase;
    const br = this.br0;
    s.conductance(ip, im, 1 / this.rin);
    // supply quiescent current
    s.conductance(vcc, vee, this.num('iq', 1e-3) / 10);
    // gain stage: I = ism·tanh(g0(A·vd − p)/ism) + gl·(A·vd − p), flows ground → p
    const vd = s.v(ip) - s.v(im);
    const pv = s.v(pn);
    const lin = this.g0 * (this.a0 * vd - pv);
    const th = Math.tanh(lin / this.ism);
    const sech2 = 1 - th * th;
    const gl = 1e-9;
    const I = this.ism * th + gl * (this.a0 * vd - pv);
    const dIdv = this.g0 * this.a0 * sech2 + gl * this.a0;
    const dIdp = -this.g0 * sech2 - gl;
    // current leaving p into the device = −I
    s.linCurrent(pn, -(I - dIdv * vd - dIdp * pv), [
      [ip, -dIdv],
      [im, dIdv],
      [pn, -dIdp],
    ]);
    // soft clamp keeps p near the rails so recovery from saturation is fast
    const vccv = s.v(vcc);
    const veev = s.v(vee);
    const top = vccv + 0.5;
    const bot = veev - 0.5;
    const w = 0.05;
    const Gc = 1;
    const sp = (z: number) => (z > 30 ? z : Math.log1p(Math.exp(z)));
    const sg = (z: number) => 1 / (1 + Math.exp(-z));
    const ic = Gc * w * (sp((pv - top) / w) - sp((bot - pv) / w));
    const gc = Gc * (sg((pv - top) / w) + sg((bot - pv) / w));
    s.linCurrent(pn, ic - gc * pv, [[pn, gc]]);
    // pole capacitor
    if (s.mode === 'tran') {
      if (s.method === 'be') {
        this.geq = this.cp / s.dt;
        this.ieq = -this.geq * this.vPrev;
      } else {
        this.geq = (2 * this.cp) / s.dt;
        this.ieq = -this.geq * this.vPrev - this.iPrev;
      }
      s.conductance(pn, -1, this.geq);
      s.current(pn, -1, this.ieq);
    }
    // output: V(out) − y(p, vcc, vee) − rout·i = 0 (branch current flows into out terminal of the source)
    const { y, dydp, dVcc, dVee } = this.sat(pv, vccv, veev);
    s.add(out, br, 1);
    s.add(br, out, 1);
    s.add(br, pn, -dydp);
    s.add(br, vcc, -dVcc);
    s.add(br, vee, -dVee);
    s.add(br, br, -this.rout);
    s.rhs(br, y - dydp * pv - dVcc * vccv - dVee * veev);
  }
  stampReactive(r: ReactiveStamper): void {
    r.add(this.intBase, this.intBase, this.cp);
  }
  accept(x: Float64Array): boolean {
    const v = x[this.intBase];
    this.iPrev = this.geq * v + this.ieq;
    this.vPrev = v;
    this.hist.push(v);
    return false;
  }
  lte(x: Float64Array, t: number, _dt: number, hist: History, method: Method): number {
    // the pole node swings by A0·vd; use a loose tolerance relative to rail span
    return this.hist.lteRatio(x[this.intBase], t, hist, method, 1e-3, 1e-3);
  }
  read(x: Float64Array): DeviceReading {
    const vout = this.pv(x, 4);
    const iout = -x[this.br0];
    const vcc = this.pv(x, 2);
    const vee = this.pv(x, 3);
    const vd = this.pv(x, 0) - this.pv(x, 1);
    const saturated = vout > vcc - this.hHi - 0.05 || vout < vee + this.hLo + 0.05;
    const iin = vd / this.rin;
    const iq = ((vcc - vee) * this.num('iq', 1e-3)) / 10;
    return {
      v: vout,
      i: iout,
      p: iout > 0 ? (vcc - vout) * iout : (vout - vee) * -iout,
      // output current is drawn from the rail it flows towards (the solver references it to ground)
      pinI: [iin, -iin, Math.max(iout, 0) + iq, Math.min(iout, 0) - iq, -iout],
      extra: { vd, saturated },
    };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('maxI', 0.03) };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), vPrev: this.vPrev, iPrev: this.iPrev };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { vPrev?: number; iPrev?: number };
    if (typeof st?.vPrev === 'number') {
      this.vPrev = st.vPrev;
      this.iPrev = st.iPrev ?? 0;
      this.hist.reset(st.vPrev);
    }
  }
}

/** 78xx linear regulator. Nodes [in, gnd, out]. Output current is drawn from the input pin. */
export class Regulator extends Device {
  constructor(spec: ElementSpec) {
    super(spec);
    this.nonlinear = true;
    this.branches = 1;
  }
  stamp(s: Stamper): void {
    const [nin, ng, nout] = this.nodes;
    const br = this.br0;
    const vreg = this.num('vout', 5);
    const drop = this.num('dropout', 2);
    const vin = s.v(nin) - s.v(ng);
    // smooth min(vreg, vin − drop), floored at 0
    const k = 0.05;
    const a = vreg;
    const b = vin - drop;
    const m = 0.5 * (a + b - Math.sqrt((a - b) * (a - b) + k * k));
    const dm = 0.5 * (1 + (a - b) / Math.sqrt((a - b) * (a - b) + k * k)); // d m / d b
    const softplus = (z: number) => (z > 30 ? z : Math.log1p(Math.exp(z)));
    const w = 0.02;
    const y = w * softplus(m / w);
    const dy = (1 / (1 + Math.exp(-m / w))) * dm;
    // branch: V(out) − V(gnd) − y(vin) − r·i = 0 ; i flows from in → out through the regulator
    s.add(nout, br, -1);
    s.add(nin, br, 1);
    s.add(br, nout, 1);
    s.add(br, ng, -1 + dy);
    s.add(br, nin, -dy);
    s.add(br, br, this.num('rout', 0.02));
    s.rhs(br, y - dy * vin);
    // quiescent ground current
    s.conductance(nin, ng, this.num('iq', 5e-3) / Math.max(vreg + drop, 1));
  }
  read(x: Float64Array): DeviceReading {
    const vin = this.pv(x, 0) - this.pv(x, 1);
    const vout = this.pv(x, 2) - this.pv(x, 1);
    const iout = x[this.br0];
    const dropout = vin < this.num('vout', 5) + this.num('dropout', 2) - 0.05;
    return {
      v: vout,
      i: iout,
      p: (vin - vout) * iout,
      pinI: [iout, 0, -iout],
      extra: { vin, dropout },
    };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('maxI', 1.5), maxP: this.num('maxP', 2), maxV: 35 };
  }
}

/**
 * NE555 behavioural model. Nodes [GND, TRIG, OUT, RESET, CTRL, THR, DIS, VCC].
 * Internal 3×5 kΩ divider, two ideal comparators, an SR latch evaluated at accepted time points with
 * crossing refinement, a bipolar output stage (≈1.7 V below VCC when high) and a discharge transistor.
 */
export class Timer555 extends Device {
  q = false;
  readonly rdiv = 5000;
  constructor(spec: ElementSpec) {
    super(spec);
    this.internal = 1; // lower divider tap (1/3 VCC)
  }
  initTransient(): void {
    this.q = false;
  }
  stamp(s: Stamper): void {
    const [gnd, , out, reset, ctrl, , dis, vcc] = this.nodes;
    const x13 = this.intBase;
    const g = 1 / this.rdiv;
    s.conductance(vcc, ctrl, g);
    s.conductance(ctrl, x13, g);
    s.conductance(x13, gnd, g);
    s.conductance(vcc, gnd, 1 / 3000); // ≈ 3 mA quiescent at 9 V (with the divider)
    s.conductance(reset, vcc, 1e-5); // weak pull-up (see notes)
    const gout = 1 / this.num('rout', 10);
    if (this.q) {
      // OUT ≈ VCC − 1.7 V: current gout·(V(vcc) − V(out) − 1.7) flows vcc → out
      s.conductance(vcc, out, gout);
      s.current(vcc, out, -gout * 1.7);
      s.conductance(dis, gnd, 1e-9);
    } else {
      s.conductance(out, gnd, gout);
      s.current(out, gnd, -gout * 0.1);
      s.conductance(dis, gnd, 1 / this.num('rdis', 10));
    }
  }
  /** Evaluate comparators for a solution. */
  private next(x: Float64Array, q: boolean): boolean {
    const vg = this.pv(x, 0);
    const vtrig = this.pv(x, 1) - vg;
    const vreset = this.pv(x, 3) - vg;
    const vctrl = this.pv(x, 4) - vg;
    const vthr = this.pv(x, 5) - vg;
    const vcc = this.pv(x, 7) - vg;
    const vlow = x[this.intBase] - vg;
    if (vcc < 3 || vreset < 0.7) return false;
    if (vtrig < vlow) return true; // trigger wins over threshold
    if (vthr > vctrl) return false;
    return q;
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    const g = (x: Float64Array) => {
      const vg = this.pv(x, 0);
      return {
        trig: this.pv(x, 1) - vg - (x[this.intBase] - vg),
        thr: this.pv(x, 5) - vg - (this.pv(x, 4) - vg),
        rst: this.pv(x, 3) - vg - 0.7,
      };
    };
    const a = g(xOld);
    const b = g(xNew);
    let f = 1;
    const cross = (u: number, v: number) => u / (u - v);
    if (!this.q && a.trig > 0 && b.trig < 0) f = Math.min(f, cross(a.trig, b.trig));
    if (this.q && a.thr < 0 && b.thr > 0 && b.trig >= 0) f = Math.min(f, cross(a.thr, b.thr));
    if (this.q && a.rst > 0 && b.rst < 0) f = Math.min(f, cross(a.rst, b.rst));
    return f;
  }
  accept(x: Float64Array): boolean {
    const nq = this.next(x, this.q);
    if (nq !== this.q) {
      this.q = nq;
      return true;
    }
    return false;
  }
  /** DC operating point: settle the latch from the static solution (a few passes). */
  postConverge(x: Float64Array): boolean {
    const nq = this.next(x, this.q);
    if (nq !== this.q) {
      this.q = nq;
      return true;
    }
    return false;
  }
  read(x: Float64Array): DeviceReading {
    const vg = this.pv(x, 0);
    const vout = this.pv(x, 2) - vg;
    const vcc = this.pv(x, 7) - vg;
    return { v: vout, i: 0, p: 0, extra: { q: this.q, vcc, out: this.q ? 'HIGH' : 'LOW' } };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), q: this.q };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { q?: boolean };
    if (st && typeof st.q === 'boolean') this.q = st.q;
  }
}
