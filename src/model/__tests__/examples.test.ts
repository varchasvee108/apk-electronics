import { Simulator } from '@sim/simulator';
import { EXAMPLES, exampleById } from '../examples';
import { extractNetlist } from '../netlist';
import { ptKey, type CircuitDoc } from '../types';
import { hole } from '../breadboard';

function sim(doc: CircuitDoc, maxStep = 1e-3) {
  const ex = extractNetlist(doc);
  expect(ex.errors).toEqual([]);
  const s = new Simulator(ex.netlist, { maxStep });
  return { s, ex };
}

const bright = (s: Simulator, id: string) => Number(s.read(id).extra?.brightness ?? 0);

describe('example circuits', () => {
  test.each(EXAMPLES.map((e) => [e.id]))('%s builds, has no errors and simulates', (id) => {
    const doc = (exampleById(id) as (typeof EXAMPLES)[number]).build();
    const { s } = sim(doc, 2e-4);
    expect(s.topology.filter((d) => d.severity === 'error')).toEqual([]);
    s.startTransient();
    expect(() => s.advance(0.05)).not.toThrow();
    expect(s.liveDiagnostics().filter((d) => d.code === 'failed')).toEqual([]);
  });

  test('LED example draws about 15 mA', () => {
    const { s } = sim(exampleById('led-resistor')!.build());
    s.startTransient();
    s.advance(0.05);
    const i = s.read('d1').i;
    expect(i).toBeGreaterThan(0.0135);
    expect(i).toBeLessThan(0.0165);
  });

  test('555 blinker blinks at about 1 Hz', () => {
    const { s } = sim(exampleById('555-blinker')!.build(), 2e-3);
    s.startTransient();
    let last = false;
    let edges = 0;
    s.advance(4.2, {
      onStep: (x) => {
        const on = bright(x, 'd555') > 0.3;
        if (on && !last) edges++;
        last = on;
      },
    });
    // first cycle is longer (cap charges from 0 V), then ~1 Hz
    expect(edges).toBeGreaterThanOrEqual(3);
    expect(edges).toBeLessThanOrEqual(5);
  });

  test('traffic light cycles red → yellow → green', () => {
    const { s } = sim(exampleById('traffic-light')!.build(), 2e-3);
    s.startTransient();
    const seen = new Set<string>();
    s.advance(4, {
      onStep: (x) => {
        for (const id of ['dr', 'dy', 'dg']) if (bright(x, id) > 0.3) seen.add(id);
      },
    });
    expect([...seen].sort()).toEqual(['dg', 'dr', 'dy']);
  });

  test('AND gate: LED only with both switches on', () => {
    const run = (a: boolean, b: boolean) => {
      const doc = exampleById('and-gate')!.build();
      doc.parts.find((p) => p.id === 's1')!.props.pos = a;
      doc.parts.find((p) => p.id === 's2')!.props.pos = b;
      const { s } = sim(doc, 1e-4);
      s.startTransient();
      s.advance(0.01);
      return bright(s, 'd1') > 0.3;
    };
    expect(run(false, false)).toBe(false);
    expect(run(true, false)).toBe(false);
    expect(run(false, true)).toBe(false);
    expect(run(true, true)).toBe(true);
  });

  test('Zener and 7805 regulate', () => {
    const z = sim(exampleById('zener')!.build());
    z.s.dcOp();
    const vz = z.s.nodeVoltage(z.ex.nodeOf.get(ptKey(hole('b14'))) ?? 0);
    expect(vz).toBeGreaterThan(5.0);
    expect(vz).toBeLessThan(5.4);
    const r = sim(exampleById('7805')!.build());
    r.s.dcOp();
    const v5 = r.s.nodeVoltage(r.ex.nodeOf.get(ptKey(hole('b32'))) ?? 0);
    expect(Math.abs(v5 - 5)).toBeLessThan(0.05);
  });

  test('inverting amplifier output is −4.7 × input', () => {
    const { s, ex } = sim(exampleById('opamp-inverting')!.build(), 2e-5);
    const nin = ex.nodeOf.get(ptKey(hole('i27'))) ?? 0;
    const nout = ex.nodeOf.get(ptKey(hole('d32'))) ?? 0;
    s.startTransient();
    let maxIn = 0;
    let maxOut = 0;
    s.advance(0.006, {
      onStep: (x) => {
        if (x.t < 0.002) return;
        maxIn = Math.max(maxIn, x.nodeVoltage(nin));
        maxOut = Math.max(maxOut, -x.nodeVoltage(nout));
      },
    });
    // the generator has 50 Ω output impedance, so compare to the measured input
    expect(Math.abs(maxOut / maxIn - 4.7)).toBeLessThan(0.1);
  });

  test('Arduino Blink lights the breadboard LED on and off', () => {
    const { s } = sim(exampleById('arduino-blink')!.build());
    s.startTransient();
    const states = new Set<boolean>();
    s.advance(1.2, { onStep: (x) => states.add(bright(x, 'd1') > 0.3) });
    expect(states).toEqual(new Set([true, false]));
  });

  test('binary counter advances', () => {
    const { s } = sim(exampleById('counter')!.build(), 2e-3);
    s.startTransient();
    const patterns = new Set<string>();
    s.advance(4, {
      onStep: (x) => {
        const els = ['0', '1', '2', '3'].map((k) => (Number(x.read(`bar.${k}`).extra?.brightness ?? 0) > 0.3 ? '1' : '0'));
        patterns.add(els.join(''));
      },
    });
    expect(patterns.size).toBeGreaterThanOrEqual(4);
  });

  test('relay example: pressing the button spins the motor', () => {
    const doc = exampleById('relay-motor')!.build();
    doc.parts.find((p) => p.id === 'sw1')!.props.pressed = true;
    const { s } = sim(doc, 1e-3);
    s.startTransient();
    s.advance(0.4);
    expect(s.read('k1').extra?.energized).toBe(true);
    expect(Number(s.read('m1').extra?.rpm)).toBeGreaterThan(1000);
  });
});
