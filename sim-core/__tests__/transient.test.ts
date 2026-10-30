import { NetlistBuilder } from '../src/builder';
import { dutyCycle, frequency, maxIn, minIn, sampleAt, risingCrossings } from '../src/measure';
import { DIODE_1N4001, LM741 } from '../src/models';
import { Simulator } from '../src/simulator';
import { diodeSeriesCurrent, relErr } from './helpers';

describe('transient analysis', () => {
  test('RC charge follows V(1 − e^(−t/RC))', () => {
    const R = 10e3;
    const C = 10e-6;
    const tau = R * C;
    const sim = new Simulator(new NetlistBuilder().V('V1', 'in', '0', 5).R('R1', 'in', 'c', R).C('C1', 'c', '0', C).build());
    const w = sim.transient(5 * tau, { vc: (s) => s.v('c') }, { maxStep: tau / 20 });
    for (const k of [0.5, 1, 2, 3]) {
      const v = sampleAt(w.t, w.vc, k * tau);
      expect(relErr(v, 5 * (1 - Math.exp(-k))).valueOf()).toBeLessThan(5e-3);
    }
    // time constant: V reaches 63.2 %
    const t63 = risingCrossings(w.t, w.vc, 5 * (1 - Math.exp(-1)))[0];
    expect(relErr(t63, tau)).toBeLessThan(5e-3);
  });

  test('RC discharge from an initial voltage', () => {
    const R = 1e3;
    const C = 1e-6;
    const sim = new Simulator(new NetlistBuilder().R('R1', 'c', '0', R).C('C1', 'c', '0', C, { ic: 9 }).build());
    const w = sim.transient(5e-3, { vc: (s) => s.v('c') }, { maxStep: 5e-5 });
    expect(relErr(sampleAt(w.t, w.vc, 1e-3), 9 * Math.exp(-1))).toBeLessThan(5e-3);
    expect(relErr(sampleAt(w.t, w.vc, 2e-3), 9 * Math.exp(-2))).toBeLessThan(5e-3);
  });

  test('RL current rises with τ = L/R', () => {
    const R = 100;
    const L = 10e-3;
    const tau = L / R;
    const sim = new Simulator(new NetlistBuilder().V('V1', 'in', '0', 5).R('R1', 'in', 'a', R).L('L1', 'a', '0', L).build());
    const w = sim.transient(5 * tau, { i: (s) => s.read('L1').i }, { maxStep: tau / 20 });
    for (const k of [1, 2, 3]) {
      expect(relErr(sampleAt(w.t, w.i, k * tau), 0.05 * (1 - Math.exp(-k)))).toBeLessThan(5e-3);
    }
  });

  test('series RLC step: ringing frequency and damping', () => {
    const R = 10;
    const L = 10e-3;
    const C = 1e-6;
    const alpha = R / (2 * L);
    const w0 = 1 / Math.sqrt(L * C);
    const wd = Math.sqrt(w0 * w0 - alpha * alpha);
    const fd = wd / (2 * Math.PI);
    const sim = new Simulator(new NetlistBuilder().V('V1', 'in', '0', 5).R('R1', 'in', 'a', R).L('L1', 'a', 'b', L).C('C1', 'b', '0', C).build());
    const w = sim.transient(6e-3, { vc: (s) => s.v('b') }, { maxStep: 1 / fd / 60 });
    // ringing frequency from crossings of the final value
    const f = frequency(w.t, w.vc, 5, 0);
    expect(relErr(f, fd)).toBeLessThan(0.01);
    // first overshoot peak: 5·(1 + e^(−απ/ωd))
    const td = 1 / fd;
    const peak1 = maxIn(w.t, w.vc, 0, td);
    expect(relErr(peak1, 5 * (1 + Math.exp((-alpha * Math.PI) / wd)))).toBeLessThan(0.01);
    // damping from successive peaks: ratio e^(−α·Td)
    const peak2 = maxIn(w.t, w.vc, td, 2 * td);
    const alphaMeasured = -Math.log((peak2 - 5) / (peak1 - 5)) / td;
    expect(relErr(alphaMeasured, alpha)).toBeLessThan(0.03);
  });

  test('half-wave rectifier: peak = Vp − Vd, filter ripple ≈ Vpk/(f·R·C)', () => {
    const Vp = 10;
    const f = 50;
    const RL = 1e3;
    const p = DIODE_1N4001;
    const bare = new Simulator(
      new NetlistBuilder().V('V1', 'ac', '0', 0, { wave: 'sine', amp: Vp, freq: f }).add('D', 'D1', ['ac', 'out'], p).R('RL', 'out', '0', RL).build(),
    );
    const w = bare.transient(0.06, { vo: (s) => s.v('out'), vi: (s) => s.v('ac') }, { maxStep: 1 / f / 400 });
    const ipk = diodeSeriesCurrent(Vp, RL + (p.rs as number), p.is as number, p.n as number);
    expect(relErr(maxIn(w.t, w.vo, 0.02), ipk * RL)).toBeLessThan(5e-3);
    expect(minIn(w.t, w.vo, 0.02)).toBeGreaterThan(-0.01); // blocks negative half

    const C = 100e-6;
    const filt = new Simulator(
      new NetlistBuilder()
        .V('V1', 'ac', '0', 0, { wave: 'sine', amp: Vp, freq: f })
        .add('D', 'D1', ['ac', 'out'], p)
        .R('RL', 'out', '0', RL)
        .C('C1', 'out', '0', C)
        .build(),
    );
    const wf = filt.transient(0.2, { vo: (s) => s.v('out') });
    const vmax = maxIn(wf.t, wf.vo, 0.12);
    const ripple = vmax - minIn(wf.t, wf.vo, 0.12);
    // the textbook estimate assumes discharge for a whole period, so it is an upper bound
    const approx = vmax / (f * RL * C);
    expect(ripple).toBeLessThan(approx);
    expect(ripple).toBeGreaterThan(0.7 * approx);
    expect(vmax).toBeGreaterThan(9);
  });

  test('full-wave bridge rectifier: peak = Vp − 2Vd, ripple ≈ Vpk/(2f·R·C)', () => {
    const Vp = 12;
    const f = 50;
    const RL = 1e3;
    const p = DIODE_1N4001;
    const mk = (C: number) => {
      const b = new NetlistBuilder()
        .V('V1', 'a', 'b', 0, { wave: 'sine', amp: Vp, freq: f })
        .add('D', 'D1', ['a', 'p'], p)
        .add('D', 'D2', ['b', 'p'], p)
        .add('D', 'D3', ['0', 'a'], p)
        .add('D', 'D4', ['0', 'b'], p)
        .R('RL', 'p', '0', RL);
      if (C > 0) b.C('C1', 'p', '0', C);
      return new Simulator(b.build());
    };
    const bare = mk(0);
    const w = bare.transient(0.06, { vo: (s) => s.v('p') }, { maxStep: 1 / f / 400 });
    const ipk = diodeSeriesCurrent(Vp, RL + 2 * (p.rs as number), p.is as number, p.n as number);
    // two diode drops: solve I·RL + 2Vd = Vp numerically around the single-diode estimate
    const vdOne = Vp - ipk * RL;
    const peak = maxIn(w.t, w.vo, 0.02);
    expect(peak).toBeLessThan(Vp - 2 * vdOne * 0.9);
    expect(peak).toBeGreaterThan(Vp - 2 * vdOne * 1.15);
    // ripple frequency is 2f
    const C = 100e-6;
    const filt = mk(C);
    const wf = filt.transient(0.2, { vo: (s) => s.v('p') });
    const vmax = maxIn(wf.t, wf.vo, 0.12);
    const ripple = vmax - minIn(wf.t, wf.vo, 0.12);
    const approx = vmax / (2 * f * RL * C);
    expect(ripple).toBeLessThan(approx);
    expect(ripple).toBeGreaterThan(0.7 * approx);
  });

  test('op-amp inverting amplifier on a 1 kHz sine', () => {
    const sim = new Simulator(
      new NetlistBuilder()
        .V('VP', 'vp', '0', 15)
        .V('VN', 'vn', '0', -15)
        .V('VIN', 'in', '0', 0, { wave: 'sine', amp: 0.2, freq: 1000 })
        .R('RIN', 'in', 'm', 10e3)
        .R('RF', 'm', 'out', 47e3)
        .add('opamp', 'U1', ['0', 'm', 'vp', 'vn', 'out'], LM741)
        .build(),
    );
    const w = sim.transient(5e-3, { vo: (s) => s.v('out') }, { maxStep: 1e-5 });
    expect(relErr(maxIn(w.t, w.vo, 2e-3), 0.94)).toBeLessThan(0.01);
    expect(relErr(-minIn(w.t, w.vo, 2e-3), 0.94)).toBeLessThan(0.01);
  });

  test('555 astable: f = 1/(ln2·(R1+2R2)·C), duty = (R1+R2)/(R1+2R2)', () => {
    const R1 = 1e3;
    const R2 = 10e3;
    const C = 100e-9;
    const sim = new Simulator(
      new NetlistBuilder()
        .V('VCC', 'vcc', '0', 9)
        // GND TRIG OUT RESET CTRL THR DIS VCC
        .add('555', 'U1', ['0', 'cap', 'out', 'vcc', 'ctrl', 'cap', 'dis', 'vcc'])
        .R('R1', 'vcc', 'dis', R1)
        .R('R2', 'dis', 'cap', R2)
        .C('C1', 'cap', '0', C)
        .C('C2', 'ctrl', '0', 10e-9)
        .R('RL', 'out', '0', 10e3)
        .build(),
    );
    const w = sim.transient(15e-3, { out: (s) => s.v('out'), cap: (s) => s.v('cap') }, { maxStep: 2e-5 });
    const fExp = 1 / (Math.LN2 * (R1 + 2 * R2) * C);
    const dExp = (R1 + R2) / (R1 + 2 * R2);
    const f = frequency(w.t, w.out, 4, 3e-3);
    const d = dutyCycle(w.t, w.out, 4, 3e-3);
    expect(relErr(f, fExp)).toBeLessThan(0.02);
    expect(relErr(d, dExp)).toBeLessThan(0.02);
    // capacitor swings between 1/3 and 2/3 of VCC
    expect(relErr(maxIn(w.t, w.cap, 5e-3), 6)).toBeLessThan(0.02);
    expect(relErr(minIn(w.t, w.cap, 5e-3), 3)).toBeLessThan(0.02);
  });

  test('DC motor spins up to ω = V/k (no load, small friction)', () => {
    const sim = new Simulator(new NetlistBuilder().V('V1', 'a', '0', 3, { r: 0.1 }).add('motor', 'M1', ['a', '0'], {}).build());
    sim.transient(1, { rpm: (s) => s.read('M1').extra?.rpm as number }, { maxStep: 1e-3 });
    const rpm = sim.read('M1').extra?.rpm as number;
    // steady state: ω = k·V / (k² + b·R)
    const k = 0.005;
    const b = 1e-6;
    const R = 2.1;
    const w = (k * 3) / (k * k + b * R);
    expect(relErr(rpm, (w * 60) / (2 * Math.PI))).toBeLessThan(0.02);
  });

  test('relay pulls in above pull-in current and closes NO contact', () => {
    const sim = new Simulator(
      new NetlistBuilder()
        .V('V1', 'vcc', '0', 5)
        .add('relay', 'K1', ['vcc', '0', 'vcc', 'no', 'nc'], {})
        .R('RNO', 'no', '0', 1e3)
        .R('RNC', 'nc', '0', 1e3)
        .build(),
    );
    sim.transient(0.02, {}, { maxStep: 1e-4 });
    expect(sim.read('K1').extra?.energized).toBe(true);
    expect(sim.v('no')).toBeGreaterThan(4.9);
    expect(sim.v('nc')).toBeLessThan(0.01);
  });
});
