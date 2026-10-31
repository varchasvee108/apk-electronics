import type { PartInstance } from '@/model/types';
import { partDef } from '@/model/parts';
import { traceCurves } from '../curveTracer';

const part = (type: string, props: Record<string, number | string | boolean> = {}): PartInstance => ({
  id: 'x1',
  type,
  x: 0,
  y: 0,
  rot: 0,
  props: { ...partDef(type).defaults, ...props },
});

/** Current on a curve at voltage v (linear interpolation). */
function at(c: { v: number[]; i: number[] }, v: number): number {
  for (let k = 1; k < c.v.length; k++) {
    const [a, b] = [c.v[k - 1], c.v[k]];
    if ((a - v) * (b - v) <= 0 && a !== b) return c.i[k - 1] + ((c.i[k] - c.i[k - 1]) * (v - a)) / (b - a);
  }
  return NaN;
}

describe('curve tracer', () => {
  test('a resistor is a straight line with slope 1/R', () => {
    const r = traceCurves(part('resistor', { r: 1000 }));
    const c = r.curves[0];
    expect(at(c, 4)).toBeCloseTo(4e-3, 5);
    expect(at(c, -3)).toBeCloseTo(-3e-3, 5);
  });

  test('a red LED conducts 20 mA at about 1.9 V and blocks reverse voltage', () => {
    const c = traceCurves(part('led', { color: 'red' })).curves[0];
    // voltage at which the current reaches 20 mA
    let v20 = NaN;
    for (let k = 1; k < c.i.length; k++) if (c.i[k - 1] < 0.02 && c.i[k] >= 0.02) v20 = c.v[k];
    expect(v20).toBeGreaterThan(1.8);
    expect(v20).toBeLessThan(2.05);
    expect(Math.abs(at(c, -4))).toBeLessThan(1e-6);
  });

  test('a Zener breaks down at its rated voltage', () => {
    const c = traceCurves(part('zener', { bv: 5.1 })).curves[0];
    expect(Math.abs(at(c, -4.5))).toBeLessThan(1e-4);
    // tens of milliamps flow in reverse, yet the voltage stays clamped just past 5.1 V
    expect(Math.min(...c.i)).toBeLessThan(-0.03);
    expect(Math.min(...c.v)).toBeGreaterThan(-5.6);
  });

  test('NPN output curves are spaced by β × ΔI_B', () => {
    const r = traceCurves(part('npn', { bf: 150 }));
    expect(r.curves).toHaveLength(5);
    const ic1 = at(r.curves[0], 5);
    const ic5 = at(r.curves[4], 5);
    expect(ic1).toBeGreaterThan(1.2e-3); // ≈ 150 × 10 µA
    expect(ic1).toBeLessThan(1.9e-3);
    expect(ic5 / ic1).toBeGreaterThan(4.5);
    expect(ic5 / ic1).toBeLessThan(5.5);
  });

  test('PNP curves come out positive (magnitudes)', () => {
    const r = traceCurves(part('pnp', { bf: 150 }));
    expect(at(r.curves[2], 5)).toBeGreaterThan(3e-3);
  });

  test('MOSFET: no current below threshold, more with higher V_GS', () => {
    const r = traceCurves(part('nmos'));
    const lo = at(r.curves[0], 8); // V_GS 2.5 V
    const hi = at(r.curves[4], 8); // V_GS 5 V
    expect(hi).toBeGreaterThan(lo * 5);
    expect(lo).toBeGreaterThan(0);
  });

  test('TIP120 needs only a fraction of a milliamp of base current for amps', () => {
    const r = traceCurves(part('tip120'));
    expect(at(r.curves[4], 4)).toBeGreaterThan(0.5);
    expect(at(r.curves[0], 0.3)).toBeLessThan(0.05); // below about one V_BE nothing flows
  });

  test('a bulb’s curve bends over as the filament heats up', () => {
    const c = traceCurves(part('lamp', { type: '6:0.2' })).curves[0];
    const i6 = at(c, 6);
    const i3 = at(c, 3);
    expect(i6).toBeGreaterThan(0.18);
    expect(i6).toBeLessThan(0.22);
    expect(i6 / i3).toBeGreaterThan(1.35); // ≈ 2^0.6 = 1.52, not 2
    expect(i6 / i3).toBeLessThan(1.7);
  });

  test('unsupported parts explain themselves', () => {
    expect(() => traceCurves(part('ne555'))).toThrow(/two-terminal/);
  });
});
