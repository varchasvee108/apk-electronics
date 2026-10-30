import { NetlistBuilder } from '../src/builder';
import { DIODE_1N4148, LM741, NMOS_2N7000, NPN_2N3904, OPAMP_IDEALISH, zener } from '../src/models';
import { Simulator } from '../src/simulator';
import { VT } from '../src/units';
import { diodeSeriesCurrent, relErr } from './helpers';

describe('DC operating point', () => {
  test('voltage divider: Vout = Vin·R2/(R1+R2)', () => {
    const n = new NetlistBuilder().V('V1', 'in', '0', 9).R('R1', 'in', 'out', 10e3).R('R2', 'out', '0', 4.7e3).build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    const expected = (9 * 4.7e3) / 14.7e3;
    expect(relErr(sim.v('out'), expected)).toBeLessThan(1e-6);
    // source current = 9 / 14.7k
    expect(relErr(sim.read('V1').i, 9 / 14.7e3)).toBeLessThan(1e-6);
  });

  test('loaded divider with two sources (superposition)', () => {
    const n = new NetlistBuilder()
      .V('V1', 'a', '0', 10)
      .V('V2', 'b', '0', 5)
      .R('R1', 'a', 'm', 1e3)
      .R('R2', 'b', 'm', 2e3)
      .R('R3', 'm', '0', 3e3)
      .build();
    const sim = new Simulator(n);
    sim.dcOp();
    // Millman: Vm = (10/1k + 5/2k) / (1/1k + 1/2k + 1/3k)
    const vm = (10 / 1e3 + 5 / 2e3) / (1 / 1e3 + 1 / 2e3 + 1 / 3e3);
    expect(relErr(sim.v('m'), vm)).toBeLessThan(1e-6);
  });

  test('diode drop matches the closed-form Lambert-W solution', () => {
    const p = DIODE_1N4148;
    const n = new NetlistBuilder().V('V1', 'in', '0', 5).R('R1', 'in', 'a', 1e3).add('D', 'D1', ['a', '0'], p).build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    const i = diodeSeriesCurrent(5, 1e3 + (p.rs as number), p.is as number, p.n as number);
    expect(relErr(sim.read('D1').i, i)).toBeLessThan(1e-4);
    expect(sim.v('a')).toBeGreaterThan(0.6);
    expect(sim.v('a')).toBeLessThan(0.75);
  });

  test('Zener regulator clamps near BV', () => {
    const n = new NetlistBuilder().V('V1', 'in', '0', 12).R('R1', 'in', 'z', 1e3).add('D', 'Z1', ['0', 'z'], zener(5.1)).build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    expect(sim.v('z')).toBeGreaterThan(5.1);
    expect(sim.v('z')).toBeLessThan(5.35);
  });

  test('BJT common-emitter bias (voltage-divider bias with emitter resistor)', () => {
    const Vcc = 12;
    const R1 = 47e3;
    const R2 = 10e3;
    const RC = 2.2e3;
    const RE = 1e3;
    const p = NPN_2N3904;
    const n = new NetlistBuilder()
      .V('VCC', 'vcc', '0', Vcc)
      .R('R1', 'vcc', 'b', R1)
      .R('R2', 'b', '0', R2)
      .R('RC', 'vcc', 'c', RC)
      .R('RE', 'e', '0', RE)
      .add('Q', 'Q1', ['c', 'b', 'e'], p)
      .build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    // Analytic: Thevenin base network, Ic = Is·exp(Vbe/Vt), Ib = Ic/β
    const is = p.is as number;
    const beta = p.bf as number;
    const vth = (Vcc * R2) / (R1 + R2);
    const rth = (R1 * R2) / (R1 + R2);
    let lo = 0.3;
    let hi = 0.9;
    for (let k = 0; k < 200; k++) {
      const vbe = (lo + hi) / 2;
      const ic = is * Math.exp(vbe / VT);
      const ib = ic / beta;
      const f = vth - ib * rth - vbe - (ic + ib) * RE;
      if (f > 0) lo = vbe;
      else hi = vbe;
    }
    const icA = is * Math.exp(lo / VT);
    const rd = sim.read('Q1');
    expect(relErr(rd.i, icA)).toBeLessThan(5e-3);
    expect(relErr(sim.v('c'), Vcc - icA * RC)).toBeLessThan(5e-3);
    expect(rd.extra?.region).toBe('active');
  });

  test('MOSFET in saturation: Id = K/2·(Vgs − Vt)²·(1 + λVds)', () => {
    const p = NMOS_2N7000;
    const n = new NetlistBuilder()
      .V('VDD', 'vdd', '0', 10)
      .V('VG', 'g', '0', 3)
      .R('RD', 'vdd', 'd', 20)
      .add('M', 'M1', ['d', 'g', '0'], p)
      .build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    const K = p.kp as number;
    const lam = p.lambda as number;
    const vds = sim.v('d');
    const id = (K / 2) * (3 - (p.vto as number)) ** 2 * (1 + lam * vds);
    expect(relErr(sim.read('M1').i, id)).toBeLessThan(1e-4);
    expect(relErr((10 - vds) / 20, id)).toBeLessThan(1e-4);
  });

  test('op-amp inverting amplifier gain = −Rf/Rin', () => {
    const n = new NetlistBuilder()
      .V('VP', 'vp', '0', 15)
      .V('VN', 'vn', '0', -15)
      .V('VIN', 'in', '0', 0.5)
      .R('RIN', 'in', 'm', 10e3)
      .R('RF', 'm', 'out', 47e3)
      .add('opamp', 'U1', ['0', 'm', 'vp', 'vn', 'out'], LM741)
      .build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    expect(relErr(sim.v('out'), -0.5 * 4.7)).toBeLessThan(2e-3);
  });

  test('op-amp non-inverting amplifier gain = 1 + Rf/Rg', () => {
    const n = new NetlistBuilder()
      .V('VP', 'vp', '0', 15)
      .V('VN', 'vn', '0', -15)
      .V('VIN', 'in', '0', 1)
      .R('RG', 'm', '0', 10e3)
      .R('RF', 'm', 'out', 22e3)
      .add('opamp', 'U1', ['in', 'm', 'vp', 'vn', 'out'], OPAMP_IDEALISH)
      .build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    expect(relErr(sim.v('out'), 3.2)).toBeLessThan(1e-3);
  });

  test('op-amp saturates at the rails minus headroom', () => {
    const n = new NetlistBuilder()
      .V('VP', 'vp', '0', 15)
      .V('VN', 'vn', '0', -15)
      .V('VIN', 'in', '0', 1)
      .R('RL', 'out', '0', 10e3)
      .add('opamp', 'U1', ['in', '0', 'vp', 'vn', 'out'], LM741)
      .build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    expect(sim.v('out')).toBeGreaterThan(13.5);
    expect(sim.v('out')).toBeLessThan(14.01);
  });

  test('bench supply switches to constant-current mode', () => {
    const n = new NetlistBuilder().add('supply', 'PS', ['p', '0'], { vset: 5, ilim: 0.1 }).R('RL', 'p', '0', 10).build();
    const sim = new Simulator(n);
    expect(sim.dcOp()).toBe(true);
    expect(sim.read('PS').extra?.mode).toBe('CC');
    expect(relErr(sim.read('PS').i, 0.1)).toBeLessThan(1e-3);
    expect(relErr(sim.v('p'), 1)).toBeLessThan(1e-3);
  });

  test('7805 regulator holds 5 V and drops out at low input', () => {
    const mk = (vin: number) =>
      new NetlistBuilder().V('VIN', 'in', '0', vin).add('reg', 'U1', ['in', '0', 'out'], { vout: 5, dropout: 2 }).R('RL', 'out', '0', 100).build();
    const a = new Simulator(mk(9));
    expect(a.dcOp()).toBe(true);
    expect(Math.abs(a.v('out') - 5)).toBeLessThan(0.02);
    const b = new Simulator(mk(6));
    expect(b.dcOp()).toBe(true);
    expect(b.v('out')).toBeLessThan(4.1);
    expect(b.v('out')).toBeGreaterThan(3.8);
  });
});
