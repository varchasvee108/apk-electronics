import { Simulator } from '@sim/simulator';
import { exampleById } from '../examples';
import { extractNetlist } from '../netlist';
import type { CircuitDoc } from '../types';

function run(doc: CircuitDoc, maxStep = 2e-4) {
  const ex = extractNetlist(doc);
  expect(ex.errors).toEqual([]);
  const s = new Simulator(ex.netlist, { maxStep });
  expect(s.topology.filter((d) => d.severity === 'error')).toEqual([]);
  s.startTransient();
  return s;
}
const extra = (s: Simulator, id: string) => s.read(id).extra ?? {};
const doc = (id: string) => exampleById(id)!.build();
const serial = (s: Simulator) => (s.device('uno') as unknown as { rt: { serial: string } }).rt.serial;

describe('sensor and module examples', () => {
  test('a piezo plays the Arduino melody at the first note’s pitch (C5 ≈ 523 Hz)', () => {
    const s = run(doc('piezo-melody'));
    s.advance(0.2);
    expect(extra(s, 'bz1').sounding).toBe(true);
    expect(Number(extra(s, 'bz1').freq)).toBeGreaterThan(510);
    expect(Number(extra(s, 'bz1').freq)).toBeLessThan(535);
  });

  test('a 555 astable sounds a piezo near 1 kHz', () => {
    const s = run(doc('siren-555'), 2e-5);
    s.advance(0.03);
    const f = Number(extra(s, 'bz1').freq);
    expect(f).toBeGreaterThan(700);
    expect(f).toBeLessThan(1300);
  });

  test('the LCD shows the greeting and counts seconds', () => {
    const s = run(doc('lcd-hello'), 5e-4);
    s.advance(1.25);
    const e = extra(s, 'lcd1');
    expect(e.on).toBe(true);
    expect(String(e.line1).trim()).toBe('Hello, Bench!');
    expect(String(e.line2)).toMatch(/^Uptime: [01]s/);
  });

  test('the ultrasonic sketch reports the distance the slider sets', () => {
    const d = doc('ultrasonic');
    d.parts.find((p) => p.id === 'us1')!.props.dist = 15;
    const s = run(d, 5e-4);
    s.advance(0.35);
    const out = serial(s);
    const m = /Distance: (\d+) cm/.exec(out);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(14);
    expect(Number(m![1])).toBeLessThanOrEqual(16);
    // closer than 20 cm: the LED on pin 13 is lit
    expect(Number(extra(s, 'd1').brightness)).toBeGreaterThan(0.2);
  });

  test('the stepper turns forward through the ULN2003', () => {
    const s = run(doc('stepper-uln2003'), 5e-4);
    s.advance(1);
    const a = Number(extra(s, 'm1').angle);
    // 2 ms per full step → ≈500 steps in a second ≈ 88° of shaft rotation
    expect(a).toBeGreaterThan(60);
    expect(a).toBeLessThan(100);
  });

  test('the L293D runs the motor forwards, then backwards', () => {
    const s = run(doc('motor-l293d'), 5e-4);
    s.advance(1.5);
    const fwd = Number(extra(s, 'm1').rpm);
    expect(Math.abs(fwd)).toBeGreaterThan(1000);
    s.advance(4.5);
    const rev = Number(extra(s, 'm1').rpm);
    expect(Math.sign(rev)).toBe(-Math.sign(fwd));
    expect(Math.abs(rev)).toBeGreaterThan(1000);
  });

  test('a PIR keeps its LED on for the hold time after motion stops', () => {
    const d = doc('pir-light');
    d.parts.find((p) => p.id === 'pir1')!.props.motion = true;
    const s = run(d, 1e-3);
    s.advance(0.1);
    expect(Number(extra(s, 'd1').brightness)).toBeGreaterThan(0.2);
    s.device('pir1')!.setParam('active', false);
    s.advance(1.5); // (absolute time) still within the 2 s hold
    expect(Number(extra(s, 'd1').brightness)).toBeGreaterThan(0.2);
    s.advance(3);
    expect(Number(extra(s, 'd1').brightness)).toBeLessThan(0.05);
  });

  test('the Hall switch lights the Uno LED only near a magnet', () => {
    const d = doc('hall-detector');
    const s = run(d, 5e-4);
    s.advance(0.05);
    expect(String(extra(s, 'uno').pins)[13]).toBe('L');
    s.device('h1')!.setParam('active', true);
    s.advance(0.1); // advance() takes an absolute time
    expect(String(extra(s, 'uno').pins)[13]).toBe('H');
  });

  test('a battery that runs down loses charge and voltage', () => {
    const s = run(doc('battery-drain'), 5e-3);
    s.advance(1);
    const q1 = Number(extra(s, 'src').charge);
    const v1 = s.read('src').v;
    s.advance(60);
    const q2 = Number(extra(s, 'src').charge);
    expect(q1).toBeLessThan(1);
    expect(q2).toBeLessThan(q1 - 0.2);
    expect(s.read('src').v).toBeLessThan(v1);
  });

  test('the joystick X axis moves the servo', () => {
    const d = doc('joystick-servo');
    d.parts.find((p) => p.id === 'j1')!.props.x = 1;
    const s = run(d, 5e-4);
    s.advance(0.6);
    expect(Number(extra(s, 'sv1').angle)).toBeGreaterThan(150);
  });

  test('soil moisture changes the A0 reading', () => {
    const dry = doc('soil-monitor');
    dry.parts.find((p) => p.id === 'sm1')!.props.moisture = 0;
    const s = run(dry, 5e-4);
    s.advance(0.25);
    const values = serial(s).trim().split(/\s+/).map(Number).filter(Number.isFinite);
    expect(values.length).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBeGreaterThan(850);
  });
});
