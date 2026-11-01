import { CALCULATORS, calculate } from '../learning/calculators';
import { GPIO_PINS } from '../learning/gpio';
import { GATE_INFO, logicOutput, truthRows, type LogicGate } from '../learning/logic';
import { parseEng } from '@sim/units';

describe('mobile engineering tools', () => {
  test.each(CALCULATORS.map((c) => [c.id]))('%s has finite, explained default results', (id) => {
    const c = CALCULATORS.find((c) => c.id === id)!;
    const values = Object.fromEntries(c.fields.map((f) => [f.key, parseEng(f.value)]));
    const outputs = calculate(id, values);
    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) {
      expect(Number.isFinite(output.value)).toBe(true);
      expect(output.why.length).toBeGreaterThan(20);
    }
  });
  test('Ohm, loaded divider, ADC, RC and heat agree with analytic predictions', () => {
    expect(calculate('ohm', { v: 9, r: 1000 })[0].value).toBeCloseTo(0.009);
    expect(calculate('divider', { vin: 9, top: 10000, bottom: 10000, load: 1000, tolerance: 5 })[0].value).toBeCloseTo(0.75);
    expect(calculate('adc', { vin: 2.5, ref: 5, bits: 10 })[0].value).toBe(512);
    expect(calculate('rc', { r: 10000, c: 100e-6 })[0].value).toBeCloseTo(1);
    expect(calculate('regulator', { vin: 12, vout: 5, i: 0.1 })[0].value).toBeCloseTo(0.7);
  });
  test('invalid and unsafe assumptions produce an explanation, not misleading numbers', () => {
    expect(() => calculate('ohm', { v: 9, r: 0 })).toThrow();
    expect(() => calculate('led', { vs: 1, vf: 2, i: 0.004 })).toThrow();
    expect(() => calculate('adc', { vin: 6, ref: 5, bits: 10 })).toThrow();
    expect(() => calculate('rc', { r: Infinity, c: 1 })).toThrow();
  });
  test('GPIO contains every header pin and separates BCM from power positions', () => {
    expect(GPIO_PINS).toHaveLength(40);
    expect(new Set(GPIO_PINS.map((p) => p.physical)).size).toBe(40);
    expect(GPIO_PINS[10].bcm).toBe(17);
    expect(GPIO_PINS[16].kind).toBe('power3');
    expect(GPIO_PINS[1].kind).toBe('power5');
    expect(GPIO_PINS[25].bcm).toBe(7);
    expect(GPIO_PINS.filter((p) => p.kind === 'ground')).toHaveLength(8);
  });
  test.each(Object.keys(GATE_INFO) as LogicGate[])('%s truth table matches the Boolean model', (gate) => {
    const rows = truthRows(gate);
    expect(rows).toHaveLength(gate === 'not' ? 2 : 4);
    for (const row of rows) expect(row.y).toBe(logicOutput(gate, row.a, row.b));
  });
  test('NAND/XOR/NOT teach the correct states', () => {
    expect(logicOutput('nand', true, true)).toBe(false);
    expect(logicOutput('xor', true, false)).toBe(true);
    expect(logicOutput('xor', true, true)).toBe(false);
    expect(logicOutput('not', false, false)).toBe(true);
  });
});
