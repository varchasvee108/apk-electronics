import { NetlistBuilder } from '../src/builder';
import { Simulator } from '../src/simulator';

describe('fuse', () => {
  test('carries its rated load and blows on an overload', () => {
    const ok = new Simulator(new NetlistBuilder().V('B1', 'p', '0', 9).add('fuse', 'F1', ['p', 'a'], { rating: 0.5, r: 0.4 }).add('R', 'R1', ['a', '0'], { r: 100, maxP: 0 }).build());
    ok.maxStep = 1e-3;
    ok.startTransient();
    ok.advance(1);
    expect(ok.device('F1')?.failed).toBe(false);
    expect(ok.read('F1').i).toBeCloseTo(9 / 100.4, 3);

    const bad = new Simulator(new NetlistBuilder().V('B1', 'p', '0', 9, { r: 0.5 }).add('fuse', 'F1', ['p', 'a'], { rating: 0.5, r: 0.4 }).add('R', 'R1', ['a', '0'], { r: 9, maxP: 0 }).build());
    bad.maxStep = 1e-3;
    bad.startTransient();
    bad.advance(0.05);
    expect(bad.device('F1')?.failed).toBe(false); // 2× the rating takes ~0.1 s
    bad.advance(0.5);
    expect(bad.device('F1')?.failed).toBe(true);
    expect(Math.abs(bad.read('F1').i)).toBeLessThan(1e-6);
    expect(bad.liveDiagnostics().find((d) => d.code === 'failed')?.title).toMatch(/blown/);
  });
});

describe('incandescent lamp', () => {
  const run = (v: number) => {
    const sim = new Simulator(new NetlistBuilder().V('B1', 'p', '0', v).add('lamp', 'L1', ['p', '0'], { vrated: 6, prated: 1.2 }).build());
    sim.maxStep = 1e-3;
    sim.startTransient();
    let peak = 0;
    sim.advance(1.5, { onStep: (s) => (peak = Math.max(peak, s.read('L1').i)) });
    return { i: sim.read('L1').i, peak, b: Number(sim.read('L1').extra?.brightness) };
  };

  test('settles at its rated current with a large cold-start inrush', () => {
    const r = run(6);
    expect(r.i).toBeGreaterThan(0.19);
    expect(r.i).toBeLessThan(0.21);
    expect(r.peak).toBeGreaterThan(1.2); // cold filament ≈ 1/10 of the hot resistance
    expect(r.b).toBeGreaterThan(0.9);
  });

  test('current rises roughly as V^0.6 and light much faster', () => {
    const half = run(3);
    expect(half.i / 0.2).toBeGreaterThan(0.6);
    expect(half.i / 0.2).toBeLessThan(0.72);
    expect(half.b).toBeLessThan(0.2);
  });
});

describe('servo', () => {
  const run = (pulseMs: number, tEnd = 0.6) => {
    const nb = new NetlistBuilder()
      .V('VS', 'vp', '0', 5)
      .V('SIG', 'sig', '0', 0, { wave: 'pulse', amp: 5, freq: 50, duty: (pulseMs * 1e-3) * 50 })
      .add('servo', 'S1', ['0', 'vp', 'sig'], {});
    const sim = new Simulator(nb.build());
    sim.maxStep = 1e-3;
    sim.startTransient();
    sim.advance(tEnd);
    return sim.read('S1').extra ?? {};
  };

  test('pulse width sets the angle', () => {
    expect(Number(run(1.5).angle)).toBeCloseTo(90, 0);
    expect(Number(run(2).angle)).toBeGreaterThan(178);
    expect(Number(run(1).angle)).toBeLessThan(2);
    expect(Number(run(1.25).pw)).toBeCloseTo(1.25e-3, 5);
  });

  test('turns at a finite speed', () => {
    // 0° → 180° at 600 °/s takes 0.3 s
    expect(Number(run(2, 0.08).angle)).toBeLessThan(150);
  });
});

describe('new logic chips', () => {
  test('74HC14 RC oscillator runs at about 1.1 / RC', () => {
    // 1A ← cap node, 1Y → R → cap node
    const nb = new NetlistBuilder().V('VCC', 'vcc', '0', 5).R('R1', 'y', 'c', 10e3).C('C1', 'c', '0', 1e-6);
    nb.add('logic', 'U1', ['c', 'y', '0', 'n2', '0', 'n3', '0', 'n4', '0', 'n5', '0', 'n6', '0', 'vcc'], { chip: '74HC14' });
    const sim = new Simulator(nb.build());
    sim.maxStep = 2e-5;
    sim.startTransient();
    sim.advance(0.02);
    let rises = 0;
    let last = sim.v('y') > 2.5;
    let first = -1;
    let lastT = -1;
    sim.advance(0.12, {
      onStep: (s) => {
        const hi = s.v('y') > 2.5;
        if (hi && !last) {
          if (first < 0) first = s.t;
          lastT = s.t;
          rises++;
        }
        last = hi;
      },
    });
    const f = (rises - 1) / (lastT - first);
    expect(f).toBeGreaterThan(95);
    expect(f).toBeLessThan(125);
  });

  test('CD4511 decodes BCD to segments, with lamp test and blanking', () => {
    const seg = (code: number, lt = 1, bi = 1) => {
      const bit = (k: number) => ((code >> k) & 1) * 5;
      const nb = new NetlistBuilder()
        .V('VCC', 'vcc', '0', 5)
        .V('A', 'a', '0', bit(0))
        .V('B', 'b', '0', bit(1))
        .V('C', 'c', '0', bit(2))
        .V('D', 'd', '0', bit(3))
        .V('LT', 'lt', '0', lt * 5)
        .V('BI', 'bi', '0', bi * 5);
      const outs = ['se', 'sd', 'sc', 'sb', 'sa', 'sg', 'sf'];
      for (const o of outs) nb.R(`R${o}`, o, '0', 1e3);
      nb.add('logic', 'U1', ['b', 'c', 'lt', 'bi', '0', 'd', 'a', '0', 'se', 'sd', 'sc', 'sb', 'sa', 'sg', 'sf', 'vcc'], { chip: 'CD4511' });
      const sim = new Simulator(nb.build());
      expect(sim.dcOp()).toBe(true);
      return ['sa', 'sb', 'sc', 'sd', 'se', 'sf', 'sg'].map((o) => (sim.v(o) > 2.5 ? o[1] : '')).join('');
    };
    expect(seg(0)).toBe('abcdef');
    expect(seg(1)).toBe('bc');
    expect(seg(5)).toBe('acdfg');
    expect(seg(8)).toBe('abcdefg');
    expect(seg(12)).toBe(''); // invalid BCD blanks
    expect(seg(1, 0)).toBe('abcdefg');
    expect(seg(8, 1, 0)).toBe('');
  });

  test('74HC283 adds two 4-bit numbers with carry', () => {
    const add = (a: number, b: number, cin: number) => {
      const nb = new NetlistBuilder().V('VCC', 'vcc', '0', 5);
      const lv = (v: number, k: number) => (((v >> k) & 1) === 1 ? 'vcc' : '0');
      // Σ2 B2 A2 Σ1 A1 B1 C0 GND C4 Σ4 B4 A4 Σ3 A3 B3 VCC
      const pins = ['s2', lv(b, 1), lv(a, 1), 's1', lv(a, 0), lv(b, 0), cin ? 'vcc' : '0', '0', 'c4', 's4', lv(b, 3), lv(a, 3), 's3', lv(a, 2), lv(b, 2), 'vcc'];
      nb.add('logic', 'U1', pins, { chip: '74HC283' });
      for (const o of ['s1', 's2', 's3', 's4', 'c4']) nb.R(`R${o}`, o, '0', 10e3);
      const sim = new Simulator(nb.build());
      expect(sim.dcOp()).toBe(true);
      return ['s1', 's2', 's3', 's4', 'c4'].reduce((acc, o, k) => acc + (sim.v(o) > 2.5 ? 1 << k : 0), 0);
    };
    expect(add(3, 4, 0)).toBe(7);
    expect(add(9, 7, 0)).toBe(16);
    expect(add(15, 15, 1)).toBe(31);
  });
});
