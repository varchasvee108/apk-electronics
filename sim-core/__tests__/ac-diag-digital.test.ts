import { NetlistBuilder } from '../src/builder';
import { LM741, led } from '../src/models';
import { Simulator, SimulationError } from '../src/simulator';
import { relErr } from './helpers';

describe('AC sweep', () => {
  test('RC low-pass: |H| = 1/√2 and −45° at fc = 1/(2πRC)', () => {
    const R = 1e3;
    const C = 100e-9;
    const fc = 1 / (2 * Math.PI * R * C);
    const sim = new Simulator(new NetlistBuilder().V('V1', 'in', '0', 0, { acmag: 1 }).R('R1', 'in', 'out', R).C('C1', 'out', '0', C).build());
    const res = sim.acSweep({ fStart: fc, fStop: fc * 1.0001, pointsPerDecade: 10 });
    const h = sim.acNode(res, 'out');
    expect(relErr(h.mag[0], Math.SQRT1_2)).toBeLessThan(1e-4);
    expect(Math.abs(h.phase[0] + 45)).toBeLessThan(0.01);
    const wide = sim.acSweep({ fStart: 10, fStop: 1e6, pointsPerDecade: 20 });
    const hw = sim.acNode(wide, 'out');
    expect(hw.mag[0]).toBeGreaterThan(0.999);
    // −20 dB/decade far above fc
    const last = hw.mag[hw.mag.length - 1];
    expect(relErr(last, fc / 1e6)).toBeLessThan(0.01);
  });

  test('series RLC resonance: current peaks at f0 = 1/(2π√LC)', () => {
    const L = 10e-3;
    const C = 100e-9;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const sim = new Simulator(
      new NetlistBuilder().V('V1', 'in', '0', 0, { acmag: 1 }).L('L1', 'in', 'a', L).C('C1', 'a', 'b', C).R('R1', 'b', '0', 50).build(),
    );
    const res = sim.acSweep({ fStart: f0 / 10, fStop: f0 * 10, pointsPerDecade: 400 });
    const h = sim.acNode(res, 'b');
    let best = 0;
    for (let k = 1; k < h.mag.length; k++) if (h.mag[k] > h.mag[best]) best = k;
    expect(relErr(res.freqs[best], f0)).toBeLessThan(0.01);
    expect(relErr(h.mag[best], 1)).toBeLessThan(0.01); // at resonance the full input appears across R
  });

  test('op-amp closed-loop bandwidth = GBW / noise gain', () => {
    const sim = new Simulator(
      new NetlistBuilder()
        .V('VP', 'vp', '0', 15)
        .V('VN', 'vn', '0', -15)
        .V('VIN', 'in', '0', 0, { acmag: 1 })
        .R('RG', 'm', '0', 1e3)
        .R('RF', 'm', 'out', 9e3)
        .add('opamp', 'U1', ['in', 'm', 'vp', 'vn', 'out'], LM741)
        .build(),
    );
    const res = sim.acSweep({ fStart: 1e3, fStop: 1e6, pointsPerDecade: 200 });
    const h = sim.acNode(res, 'out');
    expect(relErr(h.mag[0], 10)).toBeLessThan(0.01);
    const k3 = h.mag.findIndex((m) => m < 10 / Math.SQRT2);
    expect(relErr(res.freqs[k3], 1e6 / 10)).toBeLessThan(0.05);
  });
});

describe('diagnostics', () => {
  test('missing ground is reported and the circuit still solves', () => {
    const sim = new Simulator(new NetlistBuilder().V('B1', 'p', 'n', 9).R('R1', 'p', 'n', 1e3).build());
    expect(sim.topology.some((d) => d.code === 'no-ground')).toBe(true);
    expect(sim.dcOp()).toBe(true);
    expect(relErr(sim.v('p') - sim.v('n'), 9)).toBeLessThan(1e-6);
  });

  test('floating node behind a capacitor', () => {
    const sim = new Simulator(new NetlistBuilder().V('V1', 'a', '0', 5).C('C1', 'a', 'x', 1e-6).R('R1', 'x', 'y', 1e3).build());
    expect(sim.topology.some((d) => d.code === 'floating-node')).toBe(true);
  });

  test('shorted source', () => {
    const sim = new Simulator(new NetlistBuilder().V('V1', 'a', 'a', 5).R('R1', 'a', '0', 1e3).build());
    expect(sim.topology.some((d) => d.code === 'shorted-source')).toBe(true);
  });

  test('ideal sources in parallel → source loop + singular matrix explained', () => {
    const sim = new Simulator(new NetlistBuilder().V('V1', 'a', '0', 5).V('V2', 'a', '0', 3).R('R1', 'a', '0', 1e3).build());
    expect(sim.topology.some((d) => d.code === 'source-loop')).toBe(true);
    expect(() => sim.dcOp()).toThrow(SimulationError);
    try {
      sim.dcOp();
    } catch (e) {
      expect((e as SimulationError).diagnostic.code).toBe('singular');
    }
  });

  test('LED straight across a 9 V battery burns out; repair restores it', () => {
    const sim = new Simulator(new NetlistBuilder().V('B1', 'p', '0', 9, { r: 1.5 }).add('D', 'D1', ['p', '0'], led('red')).build());
    sim.transient(0.2, {}, { maxStep: 1e-3 });
    const d = sim.device('D1');
    expect(d?.failed).toBe(true);
    expect(sim.liveDiagnostics().some((x) => x.code === 'failed')).toBe(true);
    sim.repair('D1');
    expect(d?.failed).toBe(false);
  });

  test('LED with a 330 Ω resistor stays healthy and lights', () => {
    const sim = new Simulator(
      new NetlistBuilder().V('B1', 'p', '0', 5).R('R1', 'p', 'a', 330).add('D', 'D1', ['a', '0'], led('red')).build(),
    );
    sim.transient(0.2, {}, { maxStep: 1e-3 });
    const rd = sim.read('D1');
    expect(sim.device('D1')?.failed).toBe(false);
    expect(rd.i).toBeGreaterThan(0.008);
    expect(rd.i).toBeLessThan(0.011);
    expect(rd.extra?.brightness as number).toBeGreaterThan(0.4);
  });

  test('a 10 Ω resistor across 9 V overheats and fails open', () => {
    const sim = new Simulator(new NetlistBuilder().V('V1', 'p', '0', 9).R('R1', 'p', '0', 10).build());
    sim.transient(0.05, {}, { maxStep: 1e-3 });
    expect(sim.device('R1')?.failed).toBe(true);
    expect(Math.abs(sim.read('R1').i)).toBeLessThan(1e-6);
  });

  test('reversed electrolytic capacitor is flagged', () => {
    const sim = new Simulator(
      new NetlistBuilder().V('V1', 'p', '0', 5).R('R1', 'p', 'a', 100).C('C1', '0', 'a', 100e-6, { polarized: true, vmax: 16 }).build(),
    );
    sim.failures = false;
    sim.transient(0.1, {}, { maxStep: 1e-3 });
    expect(sim.liveDiagnostics().some((d) => d.code === 'reverse-polarity')).toBe(true);
  });
});

describe('mixed-signal logic', () => {
  const VCC = (b: NetlistBuilder) => b.V('VCC', 'vcc', '0', 5);

  test('7400 NAND truth table at the DC operating point', () => {
    for (const [a, b] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      const nb = VCC(new NetlistBuilder())
        .V('VA', 'a', '0', a * 5)
        .V('VB', 'b', '0', b * 5)
        .R('RL', 'y', '0', 10e3);
      const pins = ['a', 'b', 'y', '0', '0', 'n2', '0', 'n3', '0', '0', 'n4', '0', '0', 'vcc'];
      nb.add('logic', 'U1', pins, { chip: '7400' });
      const sim = new Simulator(nb.build());
      expect(sim.dcOp()).toBe(true);
      const y = sim.v('y');
      if (a && b) expect(y).toBeLessThan(0.1);
      else expect(y).toBeGreaterThan(4.9);
    }
  });

  test('74HC161 counts rising clock edges', () => {
    const nb = VCC(new NetlistBuilder()).V('CLK', 'clk', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.5, delay: 0.25e-3 });
    // CLR CLK A B C D ENP GND LOAD ENT QD QC QB QA RCO VCC
    nb.add('logic', 'U1', ['vcc', 'clk', '0', '0', '0', '0', 'vcc', '0', 'vcc', 'vcc', 'qd', 'qc', 'qb', 'qa', 'rco', 'vcc'], { chip: '74HC161' });
    const sim = new Simulator(nb.build());
    const read = () => (sim.v('qa') > 2.5 ? 1 : 0) + (sim.v('qb') > 2.5 ? 2 : 0) + (sim.v('qc') > 2.5 ? 4 : 0) + (sim.v('qd') > 2.5 ? 8 : 0);
    sim.maxStep = 2e-5;
    sim.startTransient();
    sim.advance(2.0e-3); // edges at 0.25 ms and 1.25 ms
    const c1 = read();
    sim.advance(6.0e-3); // 4 more edges
    const c2 = read();
    expect((c2 - c1 + 16) % 16).toBe(4);
    expect(c1).toBe(2);
  });

  test('CD4017 advances one output per clock', () => {
    const nb = VCC(new NetlistBuilder()).V('CLK', 'clk', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.5, delay: 0.25e-3 });
    const pins = ['q5', 'q1', 'q0', 'q2', 'q6', 'q7', 'q3', '0', 'q8', 'q4', 'q9', 'co', '0', 'clk', '0', 'vcc'];
    nb.add('logic', 'U1', pins, { chip: 'CD4017' });
    const sim = new Simulator(nb.build());
    sim.maxStep = 2e-5;
    sim.startTransient();
    sim.advance(3.0e-3); // 3 edges
    expect(sim.v('q3')).toBeGreaterThan(4.5);
    expect(sim.v('q2')).toBeLessThan(0.5);
    expect(sim.v('co')).toBeGreaterThan(4.5);
  });

  test('74HC595 shifts serial data and latches it', () => {
    const nb = VCC(new NetlistBuilder())
      .V('SRCLK', 'srclk', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.3, delay: 0.1e-3 })
      .V('RCLK', 'rclk', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.3, delay: 0.6e-3 });
    // QB QC QD QE QF QG QH GND QH' SRCLR SRCLK RCLK OE SER QA VCC
    nb.add('logic', 'U1', ['qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh', '0', 'qh2', 'vcc', 'srclk', 'rclk', '0', 'vcc', 'qa', 'vcc'], {
      chip: '74HC595',
    });
    const sim = new Simulator(nb.build());
    sim.maxStep = 2e-5;
    sim.startTransient();
    sim.advance(3.5e-3);
    expect(sim.v('qa')).toBeGreaterThan(4.5);
    expect(sim.v('qb')).toBeGreaterThan(4.5);
    expect(sim.v('qc')).toBeGreaterThan(4.5);
    expect(sim.v('qd')).toBeLessThan(0.5);
  });

  test('7474 captures D on the rising clock edge', () => {
    const nb = VCC(new NetlistBuilder()).V('CLK', 'clk', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.5, delay: 0.5e-3 });
    // 1CLR 1D 1CLK 1PRE 1Q 1Q̄ GND 2Q̄ 2Q 2PRE 2CLK 2D 2CLR VCC
    nb.add('logic', 'U1', ['vcc', 'vcc', 'clk', 'vcc', 'q', 'qn', '0', 'x1', 'x2', 'vcc', '0', '0', 'vcc', 'vcc'], { chip: '7474' });
    const sim = new Simulator(nb.build());
    sim.maxStep = 2e-5;
    sim.startTransient();
    sim.advance(0.4e-3);
    expect(sim.v('q')).toBeLessThan(0.5);
    sim.advance(0.7e-3);
    expect(sim.v('q')).toBeGreaterThan(4.5);
    expect(sim.v('qn')).toBeLessThan(0.5);
  });

  test('propagation delay is honoured', () => {
    const nb = VCC(new NetlistBuilder()).V('VA', 'a', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.5, delay: 1e-4 });
    nb.add('logic', 'U1', ['a', 'y', '0', 'n2', '0', 'n3', '0', 'n4', '0', 'n5', '0', 'n6', '0', 'vcc'], { chip: '7404' });
    const sim = new Simulator(nb.build());
    sim.maxStep = 1e-6;
    sim.startTransient();
    const edge = 1e-4 + 0.55e-7; // the 100 ns input edge crosses VCC/2 + 5 % hysteresis 55 ns in
    sim.advance(edge + 2e-9);
    expect(sim.v('y')).toBeGreaterThan(4.5); // not yet switched
    sim.advance(edge + 20e-9);
    expect(sim.v('y')).toBeLessThan(0.5);
  });
});
