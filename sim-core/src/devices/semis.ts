import { Device, type Ratings } from '../device';
import { fetlim, pnjlim, safeExp, type Stamper } from '../stamper';
import type { DeviceReading, ElementSpec } from '../types';
import { VT } from '../units';

const OPEN_G = 1e-10;

/**
 * Junction diode (Shockley) with series resistance, optional reverse breakdown (Zener) and photocurrent.
 * Nodes [anode, cathode]. LEDs, Zeners, Schottkys and photodiodes are parameter sets of this model.
 */
export class Diode extends Device {
  is: number;
  n: number;
  rs: number;
  bv: number;
  ibv: number;
  nbv: number;
  vdOld = 0;
  constructor(spec: ElementSpec) {
    super(spec);
    this.nonlinear = true;
    this.is = this.num('is', 2.52e-9);
    this.n = this.num('n', 1.752);
    this.rs = this.num('rs', 0.5);
    this.bv = this.num('bv', 0);
    this.ibv = this.num('ibv', 1e-3);
    this.nbv = this.num('nbv', 1);
    this.internal = this.rs > 0 ? 1 : 0;
  }
  private junction(): number {
    return this.rs > 0 ? this.intBase : this.nodes[0];
  }
  /** Junction current and conductance at junction voltage vd. */
  iv(vd: number): [number, number] {
    const nvt = this.n * VT;
    const [e, de] = safeExp(vd / nvt);
    let id = this.is * (e - 1);
    let gd = (this.is * de) / nvt;
    if (this.bv > 0) {
      const nb = this.nbv * VT;
      const [eb, deb] = safeExp(-(vd + this.bv) / nb);
      id -= this.ibv * eb;
      gd += (this.ibv * deb) / nb;
    }
    const lux = this.num('lux', 0);
    if (lux > 0) id -= lux * this.num('resp', 7e-8);
    return [id, gd];
  }
  stamp(s: Stamper): void {
    const a = this.nodes[0];
    const c = this.nodes[1];
    const j = this.junction();
    if (this.rs > 0) s.conductance(a, j, 1 / this.rs);
    if (this.failed) {
      s.conductance(j, c, OPEN_G);
      return;
    }
    let vd = s.v(j) - s.v(c);
    const nvt = this.n * VT;
    const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * this.is));
    let lim = false;
    if (this.bv > 0 && vd < Math.min(0, -this.bv + 10 * this.nbv * VT)) {
      const nb = this.nbv * VT;
      const vcb = nb * Math.log(nb / (Math.SQRT2 * this.ibv));
      const [vt, l] = pnjlim(-(vd + this.bv), -(this.vdOld + this.bv), nb, vcb);
      vd = -(vt + this.bv);
      lim = l;
    } else {
      [vd, lim] = pnjlim(vd, this.vdOld, nvt, vcrit);
    }
    if (lim) s.limited = true;
    this.vdOld = vd;
    const [id, gd0] = this.iv(vd);
    const gd = gd0 + s.gmin;
    s.conductance(j, c, gd);
    s.current(j, c, id + s.gmin * vd - gd * vd);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    if (this.failed) return { v, i: v * OPEN_G, p: 0, pinI: [0, 0], extra: { brightness: 0 } };
    const jv = this.rs > 0 ? x[this.intBase] : this.pv(x, 0);
    const [i] = this.iv(jv - this.pv(x, 1));
    const rated = this.num('irated', 0.02);
    return {
      v,
      i,
      p: v * i,
      pinI: [i, -i],
      extra: { brightness: Math.max(0, Math.min(1.6, i / rated)) },
    };
  }
  ratings(): Ratings | null {
    const kind = this.str('kind', 'diode');
    if (kind === 'led')
      return { maxI: this.num('maxI', 0.03), maxReverse: 5, tau: 0.03, failAt: 1.7, instantFail: 5 };
    if (kind === 'zener') return { maxP: this.num('maxP', 1), tau: 0.2, failAt: 2, instantFail: 8 };
    return {
      maxI: this.num('maxI', 0.3),
      maxReverse: this.bv > 0 ? undefined : this.num('vrrm', 100),
      tau: 0.1,
      failAt: 2.5,
      instantFail: 10,
    };
  }
}

/** Bipolar transistor, Ebers–Moll transport model. Nodes [C, B, E]. */
export class BJT extends Device {
  p: number;
  is: number;
  bf: number;
  br: number;
  vbeOld = 0;
  vbcOld = 0;
  constructor(spec: ElementSpec) {
    super(spec);
    this.nonlinear = true;
    this.p = this.str('polarity', 'npn') === 'pnp' ? -1 : 1;
    this.is = this.num('is', 6.7e-15);
    this.bf = this.num('bf', 150);
    this.br = this.num('br', 0.74);
  }
  currents(vbe: number, vbc: number) {
    const [ef, def] = safeExp(vbe / VT);
    const [er, der] = safeExp(vbc / VT);
    const iF = this.is * (ef - 1);
    const iR = this.is * (er - 1);
    const gF = (this.is * def) / VT;
    const gR = (this.is * der) / VT;
    const ic = iF - iR * (1 + 1 / this.br);
    const ib = iF / this.bf + iR / this.br;
    return { ic, ib, gF, gR };
  }
  stamp(s: Stamper): void {
    const [nc, nb, ne] = this.nodes;
    const p = this.p;
    if (this.failed) {
      s.conductance(nc, ne, OPEN_G);
      s.conductance(nb, ne, OPEN_G);
      return;
    }
    let vbe = p * (s.v(nb) - s.v(ne));
    let vbc = p * (s.v(nb) - s.v(nc));
    const vcrit = VT * Math.log(VT / (Math.SQRT2 * this.is));
    let l1: boolean;
    let l2: boolean;
    [vbe, l1] = pnjlim(vbe, this.vbeOld, VT, vcrit);
    [vbc, l2] = pnjlim(vbc, this.vbcOld, VT, vcrit);
    if (l1 || l2) s.limited = true;
    this.vbeOld = vbe;
    this.vbcOld = vbc;
    const { ic, ib, gF, gR } = this.currents(vbe, vbc);
    const g = s.gmin;
    // collector current into device
    const a1 = gF;
    const a2 = -gR * (1 + 1 / this.br) - g;
    const icT = ic - g * vbc;
    // base current into device
    const b1 = gF / this.bf + g;
    const b2 = gR / this.br + g;
    const ibT = ib + g * vbe + g * vbc;
    const icEq = p * (icT - a1 * vbe - a2 * vbc);
    const ibEq = p * (ibT - b1 * vbe - b2 * vbc);
    s.linCurrent(nc, icEq, [
      [nb, a1 + a2],
      [ne, -a1],
      [nc, -a2],
    ]);
    s.linCurrent(nb, ibEq, [
      [nb, b1 + b2],
      [ne, -b1],
      [nc, -b2],
    ]);
    s.linCurrent(ne, -(icEq + ibEq), [
      [nb, -(a1 + a2 + b1 + b2)],
      [ne, a1 + b1],
      [nc, a2 + b2],
    ]);
  }
  read(x: Float64Array): DeviceReading {
    const vc = this.pv(x, 0);
    const vb = this.pv(x, 1);
    const ve = this.pv(x, 2);
    const p = this.p;
    if (this.failed) return { v: vc - ve, i: 0, p: 0, pinI: [0, 0, 0], extra: { region: 'damaged' } };
    const vbe = p * (vb - ve);
    const vbc = p * (vb - vc);
    const { ic, ib } = this.currents(vbe, vbc);
    const Ic = p * ic;
    const Ib = p * ib;
    const vce = vc - ve;
    let region = 'cut-off';
    if (vbe > 0.5) region = vbc > 0.4 ? 'saturation' : 'active';
    return {
      v: vce,
      i: Ic,
      p: vce * Ic + (vb - ve) * Ib,
      pinI: [Ic, Ib, -(Ic + Ib)],
      extra: { ib: Ib, ic: Ic, ie: -(Ic + Ib), vbe: vb - ve, beta: Math.abs(ib) > 1e-15 ? ic / ib : 0, region },
    };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('maxI', 0.2), maxP: this.num('maxP', 0.625), tau: 0.15, failAt: 2, instantFail: 8 };
  }
}

/** Level-1 (Shichman–Hodges) MOSFET with channel-length modulation. Nodes [D, G, S]. */
export class MOSFET extends Device {
  p: number;
  vto: number;
  kp: number;
  lambda: number;
  vgsOld = 0;
  vdsOld = 0;
  constructor(spec: ElementSpec) {
    super(spec);
    this.nonlinear = true;
    this.p = this.str('polarity', 'n') === 'p' ? -1 : 1;
    this.vto = Math.abs(this.num('vto', 2));
    this.kp = this.num('kp', 0.1);
    this.lambda = this.num('lambda', 0.01);
  }
  /** Drain current (effective drain → effective source) and its partials. */
  ids(vgs: number, vds: number) {
    const vov = vgs - this.vto;
    const K = this.kp;
    const lam = this.lambda;
    if (vov <= 0) return { id: 0, gm: 0, gds: 0, region: 'cut-off' };
    if (vds < vov) {
      const core = vov * vds - (vds * vds) / 2;
      return {
        id: K * core * (1 + lam * vds),
        gm: K * vds * (1 + lam * vds),
        gds: K * (vov - vds) * (1 + lam * vds) + K * core * lam,
        region: 'triode',
      };
    }
    return {
      id: (K / 2) * vov * vov * (1 + lam * vds),
      gm: K * vov * (1 + lam * vds),
      gds: (K / 2) * vov * vov * lam,
      region: 'saturation',
    };
  }
  stamp(s: Stamper): void {
    const [nd, ng, ns] = this.nodes;
    const p = this.p;
    if (this.failed) {
      s.conductance(nd, ns, OPEN_G);
      return;
    }
    let vds = p * (s.v(nd) - s.v(ns));
    const reverse = vds < 0;
    const de = reverse ? ns : nd;
    const se = reverse ? nd : ns;
    let vgs = p * (s.v(ng) - s.v(se));
    vds = Math.abs(vds);
    let l1: boolean;
    [vgs, l1] = fetlim(vgs, this.vgsOld, this.vto);
    let l2 = false;
    if (Math.abs(vds - this.vdsOld) > 4) {
      vds = this.vdsOld + Math.sign(vds - this.vdsOld) * 4;
      l2 = true;
    }
    if (l1 || l2) s.limited = true;
    this.vgsOld = vgs;
    this.vdsOld = vds;
    const { id, gm, gds } = this.ids(vgs, vds);
    const g = gds + s.gmin;
    const ieq = p * (id - gm * vgs - gds * vds);
    // current into effective drain
    s.linCurrent(de, ieq, [
      [ng, gm],
      [de, g],
      [se, -(gm + g)],
    ]);
    s.linCurrent(se, -ieq, [
      [ng, -gm],
      [de, -g],
      [se, gm + g],
    ]);
    s.conductance(ng, ns, s.gmin);
  }
  read(x: Float64Array): DeviceReading {
    const vd = this.pv(x, 0);
    const vg = this.pv(x, 1);
    const vs = this.pv(x, 2);
    const p = this.p;
    if (this.failed) return { v: vd - vs, i: 0, p: 0, pinI: [0, 0, 0], extra: { region: 'damaged' } };
    let vds = p * (vd - vs);
    const reverse = vds < 0;
    const vgs = p * (vg - (reverse ? vd : vs));
    vds = Math.abs(vds);
    const { id, region } = this.ids(vgs, vds);
    const Id = p * (reverse ? -id : id);
    return {
      v: vd - vs,
      i: Id,
      p: (vd - vs) * Id,
      pinI: [Id, 0, -Id],
      extra: { vgs: vg - vs, region, rds: Math.abs(Id) > 1e-12 ? (vd - vs) / Id : Infinity },
    };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('maxI', 0.2), maxP: this.num('maxP', 0.4), tau: 0.15, failAt: 2, instantFail: 8 };
  }
}
