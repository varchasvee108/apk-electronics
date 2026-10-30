import { assemble } from '@sim/avr/assembler';
import { STARTER_PROGRAMS } from '@sim/avr/programs';
import { DocBuilder, WIRE, addRails, dipHole, railNear } from './build';
import type { CircuitDoc } from './types';

export interface Example {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  build(): CircuitDoc;
}

export function arduinoProgram(id: string): { hex: string; program: string; source: string } {
  const p = STARTER_PROGRAMS.find((q) => q.id === id) ?? STARTER_PROGRAMS[0];
  return { hex: assemble(p.asm).hex, program: p.id, source: p.asm };
}

/** 555 astable on the breadboard with pin 1 in column `col`; returns the OUT strip column. */
export function astable555(b: DocBuilder, col: number, opts: { r1?: number; r2?: number; c?: number; led?: boolean } = {}): number {
  const u = b.part('ne555', `e${col}`, { id: 'u555' });
  void u;
  const T = (k: number, row = 0) => dipHole(col, 8, k, row);
  b.wire(railNear('top', '+', col), T(8, 0), WIRE.red); // VCC
  b.part('resistor', `b${col - 3}`, { props: { r: opts.r1 ?? 10e3 }, id: 'r555a' }); // VCC strip → DIS (col+1)
  b.wire(railNear('top', '+', col - 3), `a${col - 3}`, WIRE.red);
  b.part('resistor', `c${col + 1}`, { props: { r: opts.r2 ?? 68e3 }, id: 'r555b' }); // DIS → col+5
  b.wire(`d${col + 5}`, `d${col + 2}`, WIRE.yellow); // → THR
  b.wire(`h${col + 1}`, `a${col + 2}`, WIRE.yellow); // TRIG ↔ THR
  b.part('ecap', `i${col - 3}`, { props: { c: opts.c ?? 10e-6 }, id: 'c555' });
  b.wire(`g${col - 3}`, `g${col + 1}`, WIRE.yellow); // cap + → TRIG
  b.wire(`j${col - 1}`, railNear('bottom', '-', col - 1), WIRE.black); // cap −
  b.wire(T(1, 0), railNear('bottom', '-', col), WIRE.black); // GND
  b.wire(T(4, 0), railNear('bottom', '+', col + 3), WIRE.red); // RESET
  if (opts.led !== false) {
    b.part('resistor', `h${col + 2}`, { props: { r: 470 }, id: 'r555led' });
    b.part('led', `i${col + 6}`, { props: { color: 'red' }, id: 'd555' });
    b.wire(`j${col + 7}`, railNear('bottom', '-', col + 7), WIRE.black);
  }
  return col + 2;
}

export const EXAMPLES: Example[] = [
  {
    id: 'led-resistor',
    title: 'LED with current-limiting resistor',
    summary: '9 V battery, 470 Ω and a red LED: about 15 mA. Change the resistor and watch brightness and current.',
    tags: ['basics', 'LED'],
    build() {
      const b = new DocBuilder('LED + resistor');
      addRails(b);
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('resistor', 'c10', { props: { r: 470 }, id: 'r1' });
      b.part('led', 'd14', { id: 'd1' });
      b.wire('a15', railNear('top', '-', 15), WIRE.black);
      b.probe('dmm+', 'e14').probe('dmm-', 'e15');
      return b.build('example');
    },
  },
  {
    id: 'divider',
    title: 'Voltage dividers',
    summary: 'A fixed 10 k / 10 k divider and an adjustable potentiometer divider. Turn the knob while running.',
    tags: ['basics', 'divider'],
    build() {
      const b = new DocBuilder('Voltage dividers');
      addRails(b);
      b.part('pot', 'c20', { id: 'rv1' });
      b.wire('a20', railNear('top', '-', 20), WIRE.black);
      b.wire(railNear('top', '+', 22), 'a22', WIRE.red);
      b.part('resistor', 'c30', { props: { r: 10e3 }, id: 'r1' });
      b.part('resistor', 'd34', { props: { r: 10e3 }, id: 'r2' });
      b.wire(railNear('top', '+', 30), 'a30', WIRE.red);
      b.wire('a38', railNear('top', '-', 38), WIRE.black);
      b.probe('dmm+', 'b21').probe('dmm-', railNear('top', '-', 26)).probe('ch1', 'b34');
      return b.build('example');
    },
  },
  {
    id: 'rc-charge',
    title: 'RC charging',
    summary: 'Hold the button to charge 100 µF through 10 kΩ (τ = 1 s); release and a 100 kΩ resistor discharges it. Watch CH1.',
    tags: ['capacitor', 'RC'],
    build() {
      const b = new DocBuilder('RC charging');
      addRails(b);
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('button', 'c10', { id: 'sw1' });
      b.part('resistor', 'd12', { props: { r: 10e3 }, id: 'r1' });
      b.part('ecap', 'e16', { props: { c: 100e-6 }, id: 'c1' });
      b.wire('a18', railNear('top', '-', 18), WIRE.black);
      b.part('resistor', 'b16', { props: { r: 100e3 }, id: 'r2' });
      b.wire('a20', railNear('top', '-', 20), WIRE.black);
      b.probe('ch1', 'c16');
      return b.build('example');
    },
  },
  {
    id: 'rc-lowpass',
    title: 'RC low-pass filter',
    summary: '1 kΩ + 100 nF (fc ≈ 1.6 kHz) driven by a 1 kHz square wave. CH1 = input, CH2 = output. Try the Bode tab.',
    tags: ['filter', 'AC', 'scope'],
    build() {
      const b = new DocBuilder('RC low-pass filter');
      b.part('funcgen', { x: 20, y: -9 }, { props: { wave: 'square', freq: 1000, amp: 1 }, id: 'fg1' });
      b.wire({ x: 20, y: -9 }, 'a20', WIRE.yellow);
      b.wire({ x: 23, y: -9 }, railNear('top', '-', 23), WIRE.black);
      b.part('ground', railNear('top', '-', 28), { id: 'gnd' });
      b.part('resistor', 'c20', { props: { r: 1000 }, id: 'r1' });
      b.part('cap', 'd24', { props: { c: 100e-9 }, id: 'c1' });
      b.wire('a26', railNear('top', '-', 26), WIRE.black);
      b.probe('ch1', 'e20').probe('ch2', 'e24');
      return b.build('example');
    },
  },
  {
    id: 'half-wave',
    title: 'Half-wave rectifier with filter',
    summary: '12 V peak, 50 Hz through a 1N4001 into 100 µF ‖ 1 kΩ. CH1 = AC in, CH2 = DC out with ripple.',
    tags: ['diode', 'rectifier', 'power'],
    build() {
      const b = new DocBuilder('Half-wave rectifier');
      b.part('acsource', { x: 20, y: -9 }, { id: 'ac1' });
      b.wire({ x: 20, y: -9 }, 'a20', WIRE.yellow);
      b.wire({ x: 23, y: -9 }, railNear('top', '-', 23), WIRE.black);
      b.part('ground', railNear('top', '-', 30), { id: 'gnd' });
      b.part('diode', 'c20', { props: { model: '1N4001' }, id: 'd1' });
      b.part('ecap', 'd24', { props: { c: 100e-6 }, id: 'c1' });
      b.wire('a26', railNear('top', '-', 26), WIRE.black);
      b.part('resistor', 'b24', { props: { r: 1000 }, id: 'r1' });
      b.wire('a28', railNear('top', '-', 28), WIRE.black);
      b.probe('ch1', 'e20').probe('ch2', 'e24');
      return b.build('example');
    },
  },
  {
    id: 'bridge',
    title: 'Full-wave bridge rectifier',
    summary: 'Four diodes turn both half-cycles into positive output; ripple is at 100 Hz and half as large.',
    tags: ['diode', 'rectifier', 'power'],
    build() {
      const b = new DocBuilder('Bridge rectifier');
      b.part('acsource', { x: 20, y: -9 }, { id: 'ac1' });
      b.wire({ x: 20, y: -9 }, 'a20', WIRE.yellow);
      b.wire({ x: 23, y: -9 }, 'a30', WIRE.blue);
      b.part('diode', 'c20', { props: { model: '1N4001' }, id: 'd1' });
      b.part('diode', 'c30', { props: { model: '1N4001' }, id: 'd2' });
      b.part('diode', 'b16', { props: { model: '1N4001' }, id: 'd3' });
      b.part('diode', 'b26', { props: { model: '1N4001' }, id: 'd4' });
      b.wire('a16', railNear('top', '-', 16), WIRE.black);
      b.wire('a26', railNear('top', '-', 26), WIRE.black);
      b.wire('d24', 'd34', WIRE.red);
      b.part('ecap', 'b34', { props: { c: 100e-6 }, id: 'c1' });
      b.wire('a36', railNear('top', '-', 36), WIRE.black);
      b.part('resistor', 'e34', { props: { r: 1000 }, id: 'r1' });
      b.wire('a38', railNear('top', '-', 38), WIRE.black);
      b.wire({ x: 32, y: 3 }, { x: 34, y: 3 }, WIRE.black);
      b.part('ground', railNear('top', '-', 44), { id: 'gnd' });
      b.probe('ch1', 'e24');
      return b.build('example');
    },
  },
  {
    id: 'transistor-switch',
    title: 'Transistor switch',
    summary: 'Hold the button: 0.8 mA of base current lets the 2N3904 sink ~15 mA through the LED.',
    tags: ['BJT', 'switch'],
    build() {
      const b = new DocBuilder('Transistor switch');
      addRails(b);
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('button', 'c10', { id: 'sw1' });
      b.part('resistor', 'd12', { props: { r: 10e3 }, id: 'rb' });
      b.part('npn', 'e15', { id: 'q1' });
      b.wire('a15', railNear('top', '-', 15), WIRE.black);
      b.wire(railNear('top', '+', 20), 'a20', WIRE.red);
      b.part('resistor', 'b20', { props: { r: 470 }, id: 'rc' });
      b.part('led', 'c24', { props: { color: 'green' }, id: 'd1' });
      b.wire('d25', 'd17', WIRE.blue);
      b.probe('dmm+', 'b17').probe('dmm-', railNear('top', '-', 18));
      return b.build('example');
    },
  },
  {
    id: 'opamp-inverting',
    title: 'Op-amp inverting amplifier',
    summary: 'Gain = −Rf/Rin = −4.7 on ±9 V supplies. CH1 = input, CH2 = output (inverted and 4.7× larger).',
    tags: ['op-amp', 'amplifier', 'scope'],
    build() {
      const b = new DocBuilder('Inverting amplifier');
      b.part('battery', { x: 4, y: -9 }, { props: { v: 9 }, id: 'bp' });
      b.part('battery', { x: 12, y: -9 }, { props: { v: 9 }, id: 'bn' });
      b.wire({ x: 4, y: -9 }, { x: 4, y: 2 }, WIRE.red);
      b.wire({ x: 7, y: -9 }, { x: 8, y: 3 }, WIRE.black);
      b.wire({ x: 12, y: -9 }, { x: 11, y: 3 }, WIRE.black);
      b.wire({ x: 15, y: -9 }, { x: 16, y: 21 }, WIRE.blue);
      b.wire({ x: 32, y: 2 }, { x: 34, y: 2 }, WIRE.red);
      b.wire({ x: 32, y: 3 }, { x: 34, y: 3 }, WIRE.black);
      b.wire({ x: 32, y: 21 }, { x: 34, y: 21 }, WIRE.blue);
      b.part('ground', { x: 10, y: 3 }, { id: 'gnd' });
      b.part('opamp', 'e30', { id: 'u1' });
      b.wire(railNear('top', '+', 31), 'a31', WIRE.red); // V+
      b.wire('j33', railNear('bottom', '-', 33), WIRE.blue); // V−
      b.part('ground', 'i32', { id: 'gnd2' }); // IN+ to ground
      b.part('funcgen', { x: 44, y: -9 }, { props: { wave: 'sine', freq: 500, amp: 1 }, id: 'fg1' });
      b.wire({ x: 44, y: -9 }, 'g27', WIRE.yellow);
      b.wire({ x: 47, y: -9 }, railNear('top', '-', 46), WIRE.black);
      b.part('resistor', 'h27', { props: { r: 10e3 }, id: 'rin' });
      b.part('resistor', 'g31', { props: { r: 47e3 }, id: 'rf' });
      b.wire('h35', 'b32', WIRE.green);
      b.part('resistor', 'c32', { props: { r: 10e3 }, id: 'rl' });
      b.wire('a36', railNear('top', '-', 36), WIRE.black);
      b.probe('ch1', 'i27').probe('ch2', 'd32');
      return b.build('example');
    },
  },
  {
    id: '555-blinker',
    title: '555 astable LED blinker',
    summary: 'R1 = 10 kΩ, R2 = 68 kΩ, C = 10 µF: f = 1.44/((R1+2R2)C) ≈ 1 Hz. CH1 = capacitor, CH2 = output.',
    tags: ['555', 'timer', 'LED'],
    build() {
      const b = new DocBuilder('555 LED blinker');
      addRails(b, { bottom: true });
      const out = astable555(b, 20);
      b.probe('ch1', 'c22').probe('ch2', `g${out}`);
      return b.build('example');
    },
  },
  {
    id: 'traffic-light',
    title: 'Traffic light (555 + CD4017)',
    summary: 'The 555 clocks a CD4017 decade counter; Q0/Q1/Q2 light red, yellow and green, and Q3 resets the count.',
    tags: ['555', 'counter', 'digital'],
    build() {
      const b = new DocBuilder('Traffic light with counter');
      addRails(b, { bottom: true });
      const out = astable555(b, 20, { r2: 33e3 });
      b.part('cd4017', 'e40', { id: 'u2' });
      b.wire(railNear('top', '+', 40), 'a40', WIRE.red); // VDD
      b.wire('j47', railNear('bottom', '-', 47), WIRE.black); // VSS
      b.wire('a43', railNear('top', '-', 43), WIRE.black); // INH low
      b.wire(`j${out}`, 'a42', WIRE.yellow); // CLK
      b.wire('g46', 'b41', WIRE.purple); // Q3 → RST
      b.part('led', 'i50', { props: { color: 'red' }, id: 'dr' });
      b.part('led', 'i53', { props: { color: 'yellow' }, id: 'dy' });
      b.part('led', 'i56', { props: { color: 'green' }, id: 'dg' });
      b.wire('h42', 'h50', WIRE.red); // Q0
      b.wire('i41', 'h53', WIRE.yellow); // Q1
      b.wire('g43', 'h56', WIRE.green); // Q2
      b.part('resistor', 'g51', { props: { r: 330 }, id: 'rr' });
      b.part('resistor', 'g54', { props: { r: 330 }, id: 'ry' });
      b.part('resistor', 'g57', { props: { r: 330 }, id: 'rg' });
      b.wire('j55', railNear('bottom', '-', 55), WIRE.black);
      b.wire('j58', railNear('bottom', '-', 58), WIRE.black);
      b.wire('j61', railNear('bottom', '-', 60), WIRE.black);
      b.probe('ch1', `g${out}`);
      return b.build('example');
    },
  },
  {
    id: 'and-gate',
    title: 'AND gate with two switches',
    summary: 'A 7408 lights the LED only when both slide switches are on. Unused inputs are tied low, as they must be.',
    tags: ['digital', 'logic'],
    build() {
      const b = new DocBuilder('AND gate');
      addRails(b, { supply: true, v: 5, bottom: true });
      b.part('ic7408', 'e30', { id: 'u1' });
      b.wire(railNear('top', '+', 30), 'a30', WIRE.red); // VCC
      b.wire('j36', railNear('bottom', '-', 36), WIRE.black); // GND
      for (const k of [4, 5]) b.wire(dipHole(30, 14, k, 0), railNear('bottom', '-', 30 + k), WIRE.black);
      for (const k of [9, 10, 12, 13]) b.wire(dipHole(30, 14, k, 0), railNear('top', '-', 30 + (14 - k)), WIRE.black);
      b.part('toggle', 'i18', { id: 's1' });
      b.wire('j18', railNear('bottom', '-', 18), WIRE.black);
      b.wire('j20', railNear('bottom', '+', 20), WIRE.red);
      b.wire('h19', 'j30', WIRE.yellow);
      b.part('toggle', 'i23', { id: 's2' });
      b.wire('j23', railNear('bottom', '-', 23), WIRE.black);
      b.wire('j25', railNear('bottom', '+', 25), WIRE.red);
      b.wire('h24', 'j31', WIRE.yellow);
      b.wire('g32', 'g40', WIRE.green);
      b.part('resistor', 'h40', { props: { r: 330 }, id: 'r1' });
      b.part('led', 'i44', { props: { color: 'green' }, id: 'd1' });
      b.wire('j45', railNear('bottom', '-', 45), WIRE.black);
      return b.build('example');
    },
  },
  {
    id: 'zener',
    title: 'Zener shunt regulator',
    summary: '9 V → 470 Ω → 5.1 V Zener, loaded by 1 kΩ. The Zener soaks up the extra current to hold the voltage.',
    tags: ['diode', 'regulator', 'power'],
    build() {
      const b = new DocBuilder('Zener regulator');
      addRails(b);
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('resistor', 'c10', { props: { r: 470 }, id: 'r1' });
      b.part('zener', 'd18', { rot: 2, props: { bv: 5.1 }, id: 'z1' });
      b.wire('a18', railNear('top', '-', 18), WIRE.black);
      b.part('resistor', 'e14', { props: { r: 1000 }, id: 'rl' });
      b.probe('dmm+', 'b14').probe('dmm-', railNear('top', '-', 20));
      return b.build('example');
    },
  },
  {
    id: '7805',
    title: '7805 5 V regulator',
    summary: '9 V in, steady 5 V out powering an LED. Inspect the regulator to see how much power it wastes as heat.',
    tags: ['regulator', 'power'],
    build() {
      const b = new DocBuilder('7805 regulator');
      addRails(b);
      b.part('lm7805', 'd30', { id: 'u1' });
      b.wire(railNear('top', '+', 30), 'a30', WIRE.red);
      b.wire('a31', railNear('top', '-', 31), WIRE.black);
      b.part('resistor', 'c32', { props: { r: 220 }, id: 'r1' });
      b.part('led', 'b36', { props: { color: 'blue' }, id: 'd1' });
      b.wire('a37', railNear('top', '-', 37), WIRE.black);
      b.probe('dmm+', 'b32').probe('dmm-', railNear('top', '-', 34));
      return b.build('example');
    },
  },
  {
    id: 'arduino-blink',
    title: 'Arduino Blink',
    summary: 'The emulated Uno toggles pin 13 every 0.5 s; the on-board L LED and an LED on the breadboard blink together.',
    tags: ['Arduino'],
    build() {
      const b = new DocBuilder('Arduino Blink');
      b.part('arduino', { x: 20, y: 28 }, { props: arduinoProgram('blink'), id: 'uno' });
      b.wire({ x: 30, y: 28 }, 'j30', WIRE.yellow); // D13
      b.part('resistor', 'h30', { props: { r: 220 }, id: 'r1' });
      b.part('led', 'i34', { id: 'd1' });
      b.wire('j35', railNear('bottom', '-', 35), WIRE.black);
      b.wire(railNear('bottom', '-', 28), { x: 29, y: 28 }, WIRE.black); // GND
      b.wire({ x: 32, y: 21 }, { x: 34, y: 21 }, WIRE.black);
      b.part('ground', railNear('bottom', '-', 40), { id: 'gnd' });
      b.probe('ch1', 'g30');
      return b.build('example');
    },
  },
  {
    id: 'arduino-analog',
    title: 'Arduino analog read',
    summary: 'A potentiometer on A0; the sketch prints 0–1023 to the Serial Monitor. Turn the knob while running.',
    tags: ['Arduino', 'ADC'],
    build() {
      const b = new DocBuilder('Arduino analog read');
      b.part('arduino', { x: 20, y: 28 }, { props: arduinoProgram('analog-read'), id: 'uno' });
      b.part('pot', { x: 36, y: 52 }, { id: 'rv1' });
      b.wire({ x: 36, y: 52 }, { x: 34, y: 47 }, WIRE.black); // GND
      b.wire({ x: 38, y: 52 }, { x: 33, y: 47 }, WIRE.red); // 5V
      b.wire({ x: 37, y: 52 }, { x: 38, y: 47 }, WIRE.yellow); // A0
      b.part('ground', { x: 35, y: 47 }, { id: 'gnd' });
      return b.build('example');
    },
  },
  {
    id: 'counter',
    title: 'Binary counter on an LED bar',
    summary: 'A 555 clock drives a 74HC161; QA–QD count 0–15 in binary on a 4-segment LED bar.',
    tags: ['digital', 'counter', '555'],
    build() {
      const b = new DocBuilder('Binary counter');
      addRails(b, { supply: true, v: 5, bottom: true });
      const out = astable555(b, 20, { r2: 33e3, led: false });
      b.part('ic161', 'e40', { id: 'u2' });
      const H = (k: number, row = 0) => dipHole(40, 16, k, row);
      b.wire(railNear('top', '+', 40), H(16), WIRE.red); // VCC
      b.wire(H(1), railNear('bottom', '+', 40), WIRE.red); // CLR high
      b.wire(`j${out}`, H(2, 1), WIRE.yellow); // CLK
      for (const k of [3, 4, 5, 6]) b.wire(H(k), railNear('bottom', '-', 40 + k), WIRE.black); // A–D low
      b.wire(H(7), railNear('bottom', '+', 46), WIRE.red); // ENP
      b.wire(H(8), railNear('bottom', '-', 47), WIRE.black); // GND
      b.wire(H(9), railNear('top', '+', 47), WIRE.red); // LOAD high
      b.wire(H(10), railNear('top', '+', 46), WIRE.red); // ENT
      b.part('ledbar4', 'e50', { props: { color: 'green' }, id: 'bar' });
      b.wire(H(14, 1), 'b50', WIRE.green); // QA
      b.wire(H(13, 1), 'b51', WIRE.green); // QB
      b.wire(H(12, 1), 'b52', WIRE.green); // QC
      b.wire(H(11, 1), 'b53', WIRE.green); // QD
      b.part('resistor', 'g50', { props: { r: 220 }, id: 'r1' });
      b.part('resistor', 'h51', { props: { r: 220 }, id: 'r2' });
      b.part('resistor', 'i52', { props: { r: 220 }, id: 'r3' });
      b.part('resistor', 'j53', { props: { r: 220 }, id: 'r4' });
      b.wire('j54', railNear('bottom', '-', 54), WIRE.black);
      b.wire('j55', railNear('bottom', '-', 55), WIRE.black);
      b.wire('j56', railNear('bottom', '-', 56), WIRE.black);
      b.wire('i57', railNear('bottom', '-', 57), WIRE.black);
      return b.build('example');
    },
  },
  {
    id: 'relay-motor',
    title: 'Relay driving a motor',
    summary: 'Button → transistor → relay coil (with flyback diode) → contacts switch a DC motor. Watch the coil current and rpm.',
    tags: ['relay', 'motor', 'BJT'],
    build() {
      const b = new DocBuilder('Relay and motor');
      addRails(b, { supply: true, v: 5, bottom: true });
      b.part('relay', 'e30', { id: 'k1' });
      b.wire('j30', railNear('bottom', '+', 30), WIRE.red); // coil +
      b.part('npn', 'g31', { id: 'q1' });
      b.wire('j31', railNear('bottom', '-', 31), WIRE.black); // emitter
      b.part('resistor', 'h28', { props: { r: 1000 }, id: 'rb' });
      b.part('button', 'i26', { id: 'sw1' });
      b.wire('j26', railNear('bottom', '+', 26), WIRE.red);
      b.part('diode', 'i34', { rot: 2, id: 'dfly' });
      b.wire('j34', 'j33', WIRE.blue);
      b.wire(railNear('top', '+', 30), 'a30', WIRE.red); // COM
      b.part('motor', { x: 44, y: -9 }, { id: 'm1' });
      b.wire('a33', { x: 44, y: -9 }, WIRE.orange);
      b.wire({ x: 47, y: -9 }, railNear('top', '-', 46), WIRE.black);
      b.probe('ch1', 'h33');
      return b.build('example');
    },
  },
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
