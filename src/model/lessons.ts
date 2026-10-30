import { DocBuilder, WIRE, addRails, dipHole, railNear } from './build';
import { arduinoProgram, astable555 } from './examples';
import type { CircuitDoc } from './types';

export type Check =
  | { kind: 'current'; part?: string; type?: string; min: number; max: number; count?: number; label: string }
  | { kind: 'voltage'; at: string; min: number; max: number; label: string }
  | { kind: 'partVoltage'; part?: string; type?: string; min: number; max: number; label: string }
  | { kind: 'ledOn'; part?: string; count?: number; label: string }
  | { kind: 'blinks'; part: string; min: number; label: string }
  | { kind: 'patterns'; parts: string[]; min: number; label: string }
  | { kind: 'seenAll'; parts: string[]; label: string }
  | { kind: 'prop'; part?: string; type?: string; key: string; min?: number; max?: number; equals?: string | number | boolean; label: string }
  | { kind: 'rcCutoff'; min: number; max: number; label: string }
  | { kind: 'f555'; min: number; max: number; label: string }
  | { kind: 'scopeFreq'; ch: 'ch1' | 'ch2'; min: number; max: number; label: string }
  | { kind: 'freqRatio'; min: number; max: number; label: string }
  | { kind: 'dmm'; min: number; max: number; label: string }
  | { kind: 'segments'; part: string; on: string[]; label: string }
  | { kind: 'serialAbove'; part: string; value: number; label: string }
  | { kind: 'nightLight'; label: string }
  | { kind: 'hasPart'; type: string; count?: number; label: string }
  | { kind: 'probe'; probe: string; label: string }
  | { kind: 'noDamage'; label: string };

export interface Lesson {
  id: string;
  unit: string;
  title: string;
  minutes: number;
  goal: string;
  intro: string[];
  hints: string[];
  checks: Check[];
  build(): CircuitDoc;
  challenge?: boolean;
}

export interface Unit {
  id: string;
  title: string;
  summary: string;
}

const noDamage: Check = { kind: 'noDamage', label: 'Nothing is damaged' };

export const UNITS: Unit[] = [
  { id: 'u1', title: 'Voltage, current & resistance', summary: 'Ohm’s law, your first circuit, using the meter.' },
  { id: 'u2', title: 'Series & parallel', summary: 'How resistances add up.' },
  { id: 'u3', title: 'Voltage dividers', summary: 'Making a smaller voltage from a bigger one.' },
  { id: 'u4', title: 'Capacitors & RC', summary: 'Storing charge and the RC time constant.' },
  { id: 'u5', title: 'Inductors', summary: 'Magnetic energy and the RL time constant.' },
  { id: 'u6', title: 'Diodes & rectifiers', summary: 'One-way current and turning AC into DC.' },
  { id: 'u7', title: 'LEDs & current limiting', summary: 'Choosing the right resistor.' },
  { id: 'u8', title: 'BJT: switch & amplifier', summary: 'Small base current, big collector current.' },
  { id: 'u9', title: 'MOSFET switching', summary: 'Voltage-controlled switches.' },
  { id: 'u10', title: 'Op-amp circuits', summary: 'Negative feedback and gain.' },
  { id: 'u11', title: 'Filters', summary: 'Frequency-dependent circuits and Bode plots.' },
  { id: 'u12', title: '555 timer circuits', summary: 'Oscillators from a classic chip.' },
  { id: 'u13', title: 'Logic gates & truth tables', summary: 'Digital decisions.' },
  { id: 'u14', title: 'Flip-flops, counters & shift registers', summary: 'Circuits with memory.' },
  { id: 'u15', title: '7-segment displays', summary: 'Showing numbers.' },
  { id: 'u16', title: 'Arduino basics', summary: 'Code meets circuit.' },
];

const rails = (name: string, opts: Parameters<typeof addRails>[1] = {}) => {
  const b = new DocBuilder(name);
  addRails(b, opts);
  return b;
};

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ U1
  {
    id: 'first-circuit',
    unit: 'u1',
    title: 'Your first circuit',
    minutes: 5,
    goal: 'Complete the loop so 9 mA flows through the 1 kΩ resistor.',
    intro: [
      'A circuit is a closed loop: current leaves the + terminal of the battery, flows through the parts and returns to −.',
      'The battery is already wired to the top power rails (red + and blue −). The resistor sits in columns 10 and 14. Each column’s five holes (a–e) are connected inside the breadboard.',
      'Use the Wire tool to connect the + rail to column 10 and column 14 to the − rail, then press Power.',
    ],
    hints: ['Select the Wire tool, then drag from a hole on the red + rail to hole a10.', 'Drag a second wire from hole a14 to the blue − rail.', 'I = V / R = 9 V / 1000 Ω = 9 mA.'],
    checks: [{ kind: 'current', part: 'r1', min: 0.0085, max: 0.0095, label: 'R1 current is 9 mA (±5 %)' }, noDamage],
    build() {
      const b = rails('First circuit');
      b.part('resistor', 'c10', { props: { r: 1000 }, id: 'r1' });
      return b.build('lesson');
    },
  },
  {
    id: 'ohms-law',
    unit: 'u1',
    title: "Ohm's law",
    minutes: 5,
    goal: 'Choose a resistor value so the current is 2 mA (±10 %).',
    intro: [
      "Ohm's law links voltage, current and resistance: V = I × R. Rearranged, R = V / I.",
      'Tap the resistor and type a new value. You can write 4.7k or 4k7 for 4.7 kΩ. Its colour bands update to match.',
    ],
    hints: ['R = 9 V / 0.002 A = 4500 Ω.', 'The nearest standard value is 4.7 kΩ (yellow, violet, red).'],
    checks: [{ kind: 'current', part: 'r1', min: 0.0018, max: 0.0022, label: 'Current is 2 mA ± 10 %' }],
    build() {
      const b = rails("Ohm's law");
      b.part('resistor', 'c10', { props: { r: 1000 }, id: 'r1' });
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.wire('a14', railNear('top', '-', 14), WIRE.black);
      b.probe('dmm+', 'b10').probe('dmm-', 'b14');
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U2
  {
    id: 'series',
    unit: 'u2',
    title: 'Resistors in series',
    minutes: 5,
    goal: 'Join the two resistors in series. The battery current should be 3 mA.',
    intro: ['In series the same current flows through each part, and resistances add: R = R1 + R2.', 'R1 (1 kΩ) is connected to +, R2 (2 kΩ) to −. Join the free ends.'],
    hints: ['Connect column 14 (R1’s right lead) to column 20 (R2’s left lead) with one wire.', 'I = 9 V / 3 kΩ = 3 mA.'],
    checks: [{ kind: 'current', part: 'src', min: 0.0029, max: 0.0031, label: 'Battery delivers 3 mA' }],
    build() {
      const b = rails('Series');
      b.part('resistor', 'c10', { props: { r: 1000 }, id: 'r1' });
      b.part('resistor', 'c20', { props: { r: 2000 }, id: 'r2' });
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.wire('a24', railNear('top', '-', 24), WIRE.black);
      return b.build('lesson');
    },
  },
  {
    id: 'parallel',
    unit: 'u2',
    title: 'Resistors in parallel',
    minutes: 5,
    goal: 'Put the two 1 kΩ resistors in parallel across the battery: 18 mA in total.',
    intro: ['In parallel each resistor gets the full voltage, and the currents add. Two equal resistors in parallel act like half the resistance: 1/R = 1/R1 + 1/R2.'],
    hints: ['Connect the left ends of both resistors to +, and both right ends to −.', 'Each draws 9 mA, so 18 mA in total.'],
    checks: [{ kind: 'current', part: 'src', min: 0.017, max: 0.019, label: 'Battery delivers ≈ 18 mA' }, { kind: 'current', type: 'resistor', count: 2, min: 0.0085, max: 0.0095, label: 'Each resistor carries 9 mA' }],
    build() {
      const b = rails('Parallel');
      b.part('resistor', 'c10', { props: { r: 1000 }, id: 'r1' });
      b.part('resistor', 'c20', { props: { r: 1000 }, id: 'r2' });
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U3
  {
    id: 'divider',
    unit: 'u3',
    title: 'Make 3 V from 9 V',
    minutes: 6,
    goal: 'Change R2 so the divider output (column 20) is 3 V ± 5 %.',
    intro: ['A voltage divider: Vout = Vin × R2 / (R1 + R2).', 'R1 is 2 kΩ. Pick R2 so Vout = 3 V. Use the multimeter (already probing column 20) to watch it.'],
    hints: ['3 = 9 × R2 / (2k + R2)  ⇒  R2 = 1 kΩ.'],
    checks: [{ kind: 'voltage', at: 'b20', min: 2.85, max: 3.15, label: 'Output is 3 V ± 5 %' }],
    build() {
      const b = rails('Voltage divider');
      b.part('resistor', 'c16', { props: { r: 2000 }, id: 'r1' });
      b.part('resistor', 'd20', { props: { r: 10e3 }, id: 'r2' });
      b.wire(railNear('top', '+', 16), 'a16', WIRE.red);
      b.wire('a24', railNear('top', '-', 24), WIRE.black);
      b.probe('dmm+', 'b20').probe('dmm-', railNear('top', '-', 28));
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U4
  {
    id: 'rc',
    unit: 'u4',
    title: 'The RC time constant',
    minutes: 8,
    goal: 'Make the charging time constant τ = 0.47 s, then let the capacitor charge above 8 V.',
    intro: [
      'Through a resistor, a capacitor charges along a curve: after τ = R·C seconds it reaches 63 % of the supply.',
      'Now R = 10 kΩ and C = 100 µF, so τ = 1 s. Power on and watch CH1, then change R to get τ = 0.47 s.',
    ],
    hints: ['τ = R × C ⇒ R = 0.47 s / 100 µF = 4.7 kΩ.', 'Power off and on again to restart from an empty capacitor.'],
    checks: [
      { kind: 'prop', part: 'r1', key: 'r', min: 4500, max: 4900, label: 'R gives τ ≈ 0.47 s' },
      { kind: 'partVoltage', part: 'c1', min: 8, max: 9.1, label: 'Capacitor charged above 8 V' },
    ],
    build() {
      const b = rails('RC time constant');
      b.wire(railNear('top', '+', 12), 'a12', WIRE.red);
      b.part('resistor', 'c12', { props: { r: 10e3 }, id: 'r1' });
      b.part('ecap', 'd16', { props: { c: 100e-6 }, id: 'c1' });
      b.wire('a18', railNear('top', '-', 18), WIRE.black);
      b.probe('ch1', 'e16');
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U5
  {
    id: 'rl',
    unit: 'u5',
    title: 'Inductors resist change',
    minutes: 6,
    goal: 'Place the CH1 probe on the resistor–inductor junction and let the current settle at 50 mA.',
    intro: [
      'An inductor opposes changes in current (V = L·dI/dt). When power is applied the current ramps up with τ = L/R.',
      'Here L = 100 mH and R = 100 Ω, so τ = 1 ms. Slow the time scale to see the ramp.',
    ],
    hints: ['The final current is 5 V / 100 Ω = 50 mA (the coil’s 1 Ω barely matters).', 'Choose the CH1 probe in the Scope tab, then tap a hole in column 14.'],
    checks: [
      { kind: 'probe', probe: 'ch1', label: 'CH1 probe placed' },
      { kind: 'current', part: 'l1', min: 0.045, max: 0.0505, label: 'Coil current settles near 50 mA' },
    ],
    build() {
      const b = rails('RL circuit', { supply: true, v: 5 });
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('resistor', 'c10', { props: { r: 100, maxP: 0.5 }, id: 'r1' });
      b.part('inductor', 'd14', { props: { l: 0.1, rdc: 1 }, id: 'l1' });
      b.wire('a18', railNear('top', '-', 18), WIRE.black);
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U6
  {
    id: 'diode-direction',
    unit: 'u6',
    title: 'A one-way street',
    minutes: 4,
    goal: 'The diode is in backwards. Turn it around so about 8 mA flows.',
    intro: ['A diode conducts only from anode to cathode (the banded end). It drops about 0.65 V when on.'],
    hints: ['Select the diode and tap Rotate twice (180°).', 'I = (9 − 0.65) V / 1 kΩ ≈ 8.3 mA.'],
    checks: [{ kind: 'current', part: 'd1', min: 0.0075, max: 0.009, label: 'Diode conducts ≈ 8 mA' }],
    build() {
      const b = rails('Diode direction');
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('resistor', 'c10', { props: { r: 1000 }, id: 'r1' });
      b.part('diode', 'd18', { rot: 2, id: 'd1' });
      b.wire('a18', railNear('top', '-', 18), WIRE.black);
      return b.build('lesson');
    },
  },
  {
    id: 'rectifier-filter',
    unit: 'u6',
    title: 'Smoothing a rectifier',
    minutes: 8,
    goal: 'Add an electrolytic capacitor (≥ 47 µF, + to the output) so the output stays above 9 V.',
    intro: [
      'A half-wave rectifier passes only the positive half-cycles: CH2 shows bumps from 0 to 11 V.',
      'A reservoir capacitor charges at each peak and supplies the load in between, leaving only a small ripple ≈ I / (f·C).',
    ],
    hints: ['Place an electrolytic capacitor with + in column 24 and − on the − rail side (column 26 is wired to −).', 'Check its polarity: the stripe goes to the − side.'],
    checks: [
      { kind: 'hasPart', type: 'ecap', label: 'Electrolytic capacitor added' },
      { kind: 'partVoltage', type: 'ecap', min: 9, max: 12, label: 'Output held above 9 V' },
      noDamage,
    ],
    build() {
      const b = new DocBuilder('Rectifier filter');
      b.part('acsource', { x: 20, y: -9 }, { id: 'ac1' });
      b.wire({ x: 20, y: -9 }, 'a20', WIRE.yellow);
      b.wire({ x: 23, y: -9 }, railNear('top', '-', 23), WIRE.black);
      b.part('ground', railNear('top', '-', 30), { id: 'gnd' });
      b.part('diode', 'c20', { props: { model: '1N4001' }, id: 'd1' });
      b.wire('a26', railNear('top', '-', 26), WIRE.black);
      b.part('resistor', 'b24', { props: { r: 1000 }, id: 'r1' });
      b.wire('a28', railNear('top', '-', 28), WIRE.black);
      b.probe('ch1', 'e20').probe('ch2', 'e24');
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U7
  {
    id: 'led-resistor',
    unit: 'u7',
    title: 'Light an LED safely',
    minutes: 6,
    goal: 'Add a resistor from column 14 to column 20 so the LED current is 15 mA ± 10 %.',
    intro: [
      'An LED’s voltage stays near its forward voltage (≈1.9 V for red), so the resistor must set the current: R = (Vs − Vf) / I.',
      'Without a resistor the LED takes far too much current and burns out. Try it if you like, then repair it!',
    ],
    hints: ['R = (9 − 1.9) V / 0.015 A ≈ 473 Ω → use 470 Ω.', 'Place a resistor in row c starting at column 14; it ends in column 18, so add a wire from 18 to 20, or start it at column 16.'],
    checks: [{ kind: 'current', part: 'd1', min: 0.0135, max: 0.0165, label: 'LED current 15 mA ± 10 %' }, noDamage],
    build() {
      const b = rails('LED current limiting');
      b.wire(railNear('top', '+', 14), 'a14', WIRE.red);
      b.part('led', 'd20', { id: 'd1' });
      b.wire('a21', railNear('top', '-', 21), WIRE.black);
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U8
  {
    id: 'bjt-switch',
    unit: 'u8',
    title: 'Transistor as a switch',
    minutes: 8,
    goal: 'Add a 10 kΩ base resistor from column 12 to the base (column 16), then hold the button to light the LED.',
    intro: [
      'A small base current (I_B) lets a much larger collector current flow (I_C ≈ β·I_B).',
      'Never connect the base straight to the supply: the base–emitter junction is a diode and would take a huge current. A resistor limits it.',
    ],
    hints: ['Place a resistor in row d from column 12 to column 16.', 'I_B ≈ (9 − 0.7) / 10 kΩ ≈ 0.8 mA → enough to saturate for 15 mA of LED current.', 'While running, press and hold the button on the canvas.'],
    checks: [
      { kind: 'ledOn', part: 'd1', label: 'LED is lit' },
      { kind: 'current', part: 'q1', min: 0.01, max: 0.02, label: 'Collector current 10–20 mA' },
      noDamage,
    ],
    build() {
      const b = rails('Transistor switch');
      b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
      b.part('button', 'c10', { id: 'sw1' });
      b.part('npn', 'e15', { id: 'q1' });
      b.wire('a15', railNear('top', '-', 15), WIRE.black);
      b.wire(railNear('top', '+', 20), 'a20', WIRE.red);
      b.part('resistor', 'b20', { props: { r: 470 }, id: 'rc' });
      b.part('led', 'c24', { props: { color: 'green' }, id: 'd1' });
      b.wire('d25', 'd17', WIRE.blue);
      return b.build('lesson');
    },
  },
  {
    id: 'bjt-bias',
    unit: 'u8',
    title: 'Biasing an amplifier',
    minutes: 10,
    goal: 'Choose R1 so the collector sits at mid-supply: 4.0–5.0 V.',
    intro: [
      'A common-emitter amplifier must be biased so the collector can swing both up and down. The divider R1/R2 sets the base voltage; the emitter resistor stabilises the current.',
      'With R1 = 47 kΩ the transistor barely conducts and the collector is near 9 V.',
    ],
    hints: ['Target I_C ≈ (9 − 4.5) / 2.2 kΩ ≈ 2 mA ⇒ V_E ≈ 2 V ⇒ V_B ≈ 2.7 V.', 'With R2 = 10 kΩ that needs R1 ≈ 22 kΩ.'],
    checks: [{ kind: 'voltage', at: 'b32', min: 4.0, max: 5.0, label: 'Collector at 4–5 V' }],
    build() {
      const b = rails('CE bias');
      b.part('npn', 'e30', { id: 'q1' });
      b.part('resistor', 'b27', { props: { r: 47e3 }, id: 'r1' });
      b.wire(railNear('top', '+', 27), 'a27', WIRE.red);
      b.part('resistor', 'c31', { props: { r: 10e3 }, id: 'r2' });
      b.wire('a35', railNear('top', '-', 35), WIRE.black);
      b.part('resistor', 'd32', { props: { r: 2200 }, id: 'rc' });
      b.wire('a36', railNear('top', '+', 36), WIRE.red);
      b.part('resistor', 'c26', { props: { r: 1000 }, id: 're' });
      b.wire('a26', railNear('top', '-', 26), WIRE.black);
      b.probe('dmm+', 'b32').probe('dmm-', railNear('top', '-', 40));
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U9
  {
    id: 'mosfet',
    unit: 'u9',
    title: 'MOSFET switching',
    minutes: 6,
    goal: 'Connect the slide switch’s middle pin (column 19) to the gate (column 31), then switch it to B.',
    intro: [
      'A MOSFET is controlled by gate voltage, not current. Above the threshold (~2 V) the channel conducts.',
      'The 100 kΩ pull-down keeps the gate at 0 V when nothing drives it, so the MOSFET never floats half-on.',
    ],
    hints: ['Wire from hole a19 to hole a31.', 'While running, tap the switch to move it to B (+5 V).'],
    checks: [
      { kind: 'prop', part: 's1', key: 'pos', equals: true, label: 'Switch at B (+5 V)' },
      { kind: 'ledOn', part: 'd1', label: 'LED is lit' },
    ],
    build() {
      const b = rails('MOSFET switch', { supply: true, v: 5 });
      b.part('nmos', 'e30', { id: 'm1' });
      b.wire('a30', railNear('top', '-', 30), WIRE.black);
      b.part('resistor', 'd31', { props: { r: 100e3 }, id: 'rg' });
      b.wire('a35', railNear('top', '-', 35), WIRE.black);
      b.wire(railNear('top', '+', 40), 'a40', WIRE.red);
      b.part('resistor', 'b40', { props: { r: 220 }, id: 'rd' });
      b.part('led', 'c44', { props: { color: 'blue' }, id: 'd1' });
      b.wire('d45', 'b32', WIRE.blue);
      b.part('toggle', 'c18', { id: 's1' });
      b.wire('a18', railNear('top', '-', 18), WIRE.black);
      b.wire('a20', railNear('top', '+', 20), WIRE.red);
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U10
  {
    id: 'opamp-gain',
    unit: 'u10',
    title: 'Non-inverting amplifier',
    minutes: 10,
    goal: 'Add the feedback resistor Rf so the LM358 output is 3 V (gain 3) for the 1 V input.',
    intro: [
      'With negative feedback an op-amp drives its output until IN− equals IN+. For the non-inverting amplifier the gain is 1 + Rf/Rg.',
      'The input divider gives ≈1 V on IN+ (column 32, lower half). Rg = 10 kΩ goes from IN− (column 31) to ground. The second op-amp in the package is safely tied off.',
    ],
    hints: ['Gain 3 = 1 + Rf/10 kΩ ⇒ Rf = 20 kΩ.', 'Place Rf from h31 to h35, then wire column 35 to the output, column 30 (lower half).'],
    checks: [{ kind: 'voltage', at: 'g30', min: 2.8, max: 3.2, label: 'Output is 3 V ± 0.2 V' }],
    build() {
      const b = rails('Non-inverting amplifier', { bottom: true });
      b.part('lm358', 'e30', { id: 'u1' });
      b.wire(railNear('top', '+', 30), 'a30', WIRE.red); // VCC
      b.wire('j33', railNear('bottom', '-', 33), WIRE.black); // GND
      b.wire('a33', railNear('top', '-', 33), WIRE.black); // IN+B to ground
      b.wire('b32', 'b31', WIRE.green); // IN−B to OUTB (follower)
      b.part('resistor', 'h14', { props: { r: 8200 }, id: 'ra' });
      b.wire('j14', railNear('bottom', '+', 14), WIRE.red);
      b.part('resistor', 'i18', { props: { r: 1000 }, id: 'rb' });
      b.wire('j22', railNear('bottom', '-', 22), WIRE.black);
      b.wire('g18', 'g32', WIRE.yellow); // into IN+A
      b.part('resistor', 'i27', { props: { r: 10e3 }, id: 'rg' });
      b.wire('j27', railNear('bottom', '-', 27), WIRE.black);
      b.probe('ch1', 'h32').probe('ch2', 'g30');
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U11
  {
    id: 'lowpass',
    unit: 'u11',
    title: 'Design a low-pass filter',
    minutes: 8,
    goal: 'Change R and/or C so the cut-off frequency is 1 kHz ± 10 %.',
    intro: [
      'An RC low-pass passes low frequencies and attenuates high ones. At the cut-off fc = 1/(2πRC) the output is 0.707 × input (−3 dB) and lags by 45°.',
      'Now R = 10 kΩ and C = 100 nF: fc ≈ 159 Hz. Use the Bode tab to see the response.',
    ],
    hints: ['Keep C = 100 nF and use R = 1/(2π·1000·100 nF) ≈ 1.6 kΩ.', 'Run the Bode sweep to confirm the −3 dB point.'],
    checks: [{ kind: 'rcCutoff', min: 900, max: 1100, label: 'fc = 1 kHz ± 10 %' }],
    build() {
      const b = new DocBuilder('Low-pass filter');
      b.part('funcgen', { x: 20, y: -9 }, { props: { wave: 'sine', freq: 1000, amp: 1 }, id: 'fg1' });
      b.wire({ x: 20, y: -9 }, 'a20', WIRE.yellow);
      b.wire({ x: 23, y: -9 }, railNear('top', '-', 23), WIRE.black);
      b.part('ground', railNear('top', '-', 28), { id: 'gnd' });
      b.part('resistor', 'c20', { props: { r: 10e3 }, id: 'r1' });
      b.part('cap', 'd24', { props: { c: 100e-9 }, id: 'c1' });
      b.wire('a26', railNear('top', '-', 26), WIRE.black);
      b.probe('ch1', 'e24');
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U12
  {
    id: '555-1hz',
    unit: 'u12',
    title: 'Blink at 1 Hz',
    minutes: 8,
    goal: 'Change R2 so the 555 blinks at about once per second (0.8–1.2 Hz).',
    intro: [
      'In astable mode the capacitor charges through R1 + R2 to ⅔ VCC, then discharges through R2 to ⅓ VCC. f = 1.44 / ((R1 + 2R2)·C).',
      'With R1 = 10 kΩ, R2 = 220 kΩ and C = 10 µF it blinks about every 3 seconds.',
    ],
    hints: ['1 Hz ⇒ R1 + 2R2 = 1.44 / 10 µF = 144 kΩ ⇒ R2 ≈ 67 kΩ → use 68 kΩ.'],
    checks: [
      { kind: 'f555', min: 0.8, max: 1.2, label: 'Component values give 0.8–1.2 Hz' },
      { kind: 'blinks', part: 'd555', min: 2, label: 'LED seen blinking' },
    ],
    build() {
      const b = rails('555 blinker', { bottom: true });
      astable555(b, 20, { r2: 220e3 });
      b.probe('ch1', 'c22');
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U13
  {
    id: 'and-gate',
    unit: 'u13',
    title: 'AND gate truth table',
    minutes: 8,
    goal: 'Wire gate 1’s output (pin 3, column 32) to the LED circuit (column 40), then set both switches to B.',
    intro: [
      'An AND gate outputs 1 only when both inputs are 1. The two slide switches give 0 (A) or 1 (B) to inputs 1A and 1B.',
      'Try all four combinations and fill in the truth table in your head: 00→0, 01→0, 10→0, 11→1.',
    ],
    hints: ['Wire from hole g32 to hole g40.', 'Tap each switch while running to move it to B.'],
    checks: [
      { kind: 'prop', part: 's1', key: 'pos', equals: true, label: 'Switch 1 at B' },
      { kind: 'prop', part: 's2', key: 'pos', equals: true, label: 'Switch 2 at B' },
      { kind: 'ledOn', part: 'd1', label: 'LED lit (1 AND 1 = 1)' },
    ],
    build() {
      const b = rails('AND gate', { supply: true, v: 5, bottom: true });
      b.part('ic7408', 'e30', { id: 'u1' });
      b.wire(railNear('top', '+', 30), 'a30', WIRE.red);
      b.wire('j36', railNear('bottom', '-', 36), WIRE.black);
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
      b.part('resistor', 'h40', { props: { r: 330 }, id: 'r1' });
      b.part('led', 'i44', { props: { color: 'green' }, id: 'd1' });
      b.wire('j45', railNear('bottom', '-', 45), WIRE.black);
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U14
  {
    id: 'counter',
    unit: 'u14',
    title: 'A binary counter',
    minutes: 8,
    goal: 'Connect the 555 output (column 22, lower half) to the counter’s CLK input (pin 2, column 41).',
    intro: [
      'A counter is a row of flip-flops: each rising clock edge adds one. The 74HC161’s outputs QA–QD show the count in binary on the LED bar.',
      'The 555 provides about two clock pulses per second.',
    ],
    hints: ['Wire from hole j22 to hole i41.', 'Watch the bar: 0001, 0010, 0011, 0100…'],
    checks: [{ kind: 'patterns', parts: ['bar.0', 'bar.1', 'bar.2', 'bar.3'], min: 4, label: 'Counted through at least 4 values' }],
    build() {
      const b = rails('Binary counter', { supply: true, v: 5, bottom: true });
      astable555(b, 20, { r2: 33e3, led: false });
      b.part('ic161', 'e40', { id: 'u2' });
      const H = (k: number, row = 0) => dipHole(40, 16, k, row);
      b.wire(railNear('top', '+', 40), H(16), WIRE.red);
      b.wire(H(1), railNear('bottom', '+', 40), WIRE.red);
      for (const k of [3, 4, 5, 6]) b.wire(H(k), railNear('bottom', '-', 40 + k), WIRE.black);
      b.wire(H(7), railNear('bottom', '+', 46), WIRE.red);
      b.wire(H(8), railNear('bottom', '-', 47), WIRE.black);
      b.wire(H(9), railNear('top', '+', 47), WIRE.red);
      b.wire(H(10), railNear('top', '+', 46), WIRE.red);
      b.part('ledbar4', 'e50', { props: { color: 'green' }, id: 'bar' });
      b.wire(H(14, 1), 'b50', WIRE.green);
      b.wire(H(13, 1), 'b51', WIRE.green);
      b.wire(H(12, 1), 'b52', WIRE.green);
      b.wire(H(11, 1), 'b53', WIRE.green);
      b.part('resistor', 'g50', { props: { r: 220 }, id: 'r1' });
      b.part('resistor', 'h51', { props: { r: 220 }, id: 'r2' });
      b.part('resistor', 'i52', { props: { r: 220 }, id: 'r3' });
      b.part('resistor', 'j53', { props: { r: 220 }, id: 'r4' });
      b.wire('j54', railNear('bottom', '-', 54), WIRE.black);
      b.wire('j55', railNear('bottom', '-', 55), WIRE.black);
      b.wire('j56', railNear('bottom', '-', 56), WIRE.black);
      b.wire('i57', railNear('bottom', '-', 57), WIRE.black);
      return b.build('lesson');
    },
  },
  {
    id: 'sequencer',
    unit: 'u14',
    title: 'A three-step sequencer',
    minutes: 8,
    goal: 'Feed the 555 clock into the CD4017 (CLK, pin 14, column 42) and watch red → yellow → green.',
    intro: ['The CD4017 decade counter has ten outputs and exactly one is high at a time. Q3 is wired back to RESET, so it counts 0, 1, 2 and repeats: a traffic-light sequencer.'],
    hints: ['Wire from hole j22 (555 output) to hole a42.'],
    checks: [{ kind: 'seenAll', parts: ['dr', 'dy', 'dg'], label: 'Red, yellow and green each lit in turn' }],
    build() {
      const b = rails('Sequencer', { bottom: true });
      astable555(b, 20, { r2: 33e3 });
      b.part('cd4017', 'e40', { id: 'u2' });
      b.wire(railNear('top', '+', 40), 'a40', WIRE.red);
      b.wire('j47', railNear('bottom', '-', 47), WIRE.black);
      b.wire('a43', railNear('top', '-', 43), WIRE.black);
      b.wire('g46', 'b41', WIRE.purple);
      b.part('led', 'i50', { props: { color: 'red' }, id: 'dr' });
      b.part('led', 'i53', { props: { color: 'yellow' }, id: 'dy' });
      b.part('led', 'i56', { props: { color: 'green' }, id: 'dg' });
      b.wire('h42', 'h50', WIRE.red);
      b.wire('i41', 'h53', WIRE.yellow);
      b.wire('g43', 'h56', WIRE.green);
      b.part('resistor', 'g51', { props: { r: 330 }, id: 'rr' });
      b.part('resistor', 'g54', { props: { r: 330 }, id: 'ry' });
      b.part('resistor', 'g57', { props: { r: 330 }, id: 'rg' });
      b.wire('j55', railNear('bottom', '-', 55), WIRE.black);
      b.wire('j58', railNear('bottom', '-', 58), WIRE.black);
      b.wire('j61', railNear('bottom', '-', 60), WIRE.black);
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U15
  {
    id: 'seven-seg',
    unit: 'u15',
    title: 'Show the digit 7',
    minutes: 8,
    goal: 'Wire the three resistors to segments a, b and c so the display shows 7.',
    intro: [
      'A common-cathode display lights a segment when its pin is driven high through a resistor; COM goes to ground.',
      'Top row (left → right): g f COM a b. Bottom row: e d COM c dp. A "7" uses segments a, b and c.',
    ],
    hints: ['Segment a is column 33 (top), b is column 34 (top), c is column 33 (bottom).', 'Wire d44 → d33, d49 → d34 and i44 → i33.'],
    checks: [{ kind: 'segments', part: 'ds1', on: ['a', 'b', 'c'], label: 'Display shows 7' }],
    build() {
      const b = rails('Seven segment', { bottom: true });
      b.part('sevenseg', 'e30', { id: 'ds1' });
      b.wire('j32', railNear('bottom', '-', 32), WIRE.black);
      b.part('resistor', 'b40', { props: { r: 330 }, id: 'ra' });
      b.wire(railNear('top', '+', 40), 'a40', WIRE.red);
      b.part('resistor', 'c45', { props: { r: 330 }, id: 'rb' });
      b.wire(railNear('top', '+', 45), 'a45', WIRE.red);
      b.part('resistor', 'h40', { props: { r: 330 }, id: 'rc' });
      b.wire('j40', railNear('bottom', '+', 40), WIRE.red);
      return b.build('lesson');
    },
  },
  // ------------------------------------------------------------------ U16
  {
    id: 'arduino-blink',
    unit: 'u16',
    title: 'Blink an external LED',
    minutes: 6,
    goal: 'Connect Arduino pin 13 to the resistor in column 30 so the breadboard LED blinks.',
    intro: [
      'The Arduino runs the Blink program: pin 13 goes HIGH (5 V) for 0.5 s, then LOW for 0.5 s.',
      'Select the board to see the code. The C++ is shown for reference; the program that runs is the equivalent AVR assembly, assembled on your device.',
    ],
    hints: ['Wire from the D13 header pin (top header, label 13) to hole j30.'],
    checks: [{ kind: 'blinks', part: 'd1', min: 2, label: 'Breadboard LED blinks' }],
    build() {
      const b = new DocBuilder('Arduino Blink');
      b.part('arduino', { x: 20, y: 28 }, { props: arduinoProgram('blink'), id: 'uno' });
      b.part('resistor', 'h30', { props: { r: 220 }, id: 'r1' });
      b.part('led', 'i34', { id: 'd1' });
      b.wire('j35', railNear('bottom', '-', 35), WIRE.black);
      b.wire(railNear('bottom', '-', 28), { x: 29, y: 28 }, WIRE.black);
      b.wire({ x: 32, y: 21 }, { x: 34, y: 21 }, WIRE.black);
      b.part('ground', railNear('bottom', '-', 40), { id: 'gnd' });
      return b.build('lesson');
    },
  },
  {
    id: 'arduino-pot',
    unit: 'u16',
    title: 'Read a potentiometer',
    minutes: 6,
    goal: 'Wire the pot’s wiper to A0, then turn it until the Serial Monitor shows a value above 800.',
    intro: ['analogRead() converts 0–5 V into 0–1023. The program prints the value ten times a second to the Serial Monitor (Instruments → Serial).'],
    hints: ['The wiper is the pot’s middle pin. Wire it to the A0 header pin (bottom header).', 'Select the pot and drag the wiper slider while running.'],
    checks: [{ kind: 'serialAbove', part: 'uno', value: 800, label: 'Serial value above 800' }],
    build() {
      const b = new DocBuilder('Arduino analog read');
      b.part('arduino', { x: 20, y: 28 }, { props: arduinoProgram('analog-read'), id: 'uno' });
      b.part('pot', { x: 36, y: 52 }, { id: 'rv1', props: { pos: 0.3 } });
      b.wire({ x: 36, y: 52 }, { x: 33, y: 47 }, WIRE.red);
      b.wire({ x: 38, y: 52 }, { x: 34, y: 47 }, WIRE.black);
      b.part('ground', { x: 35, y: 47 }, { id: 'gnd' });
      return b.build('lesson');
    },
  },
];

export const CHALLENGES: Lesson[] = [
  {
    id: 'ch-3v3',
    unit: 'challenge',
    challenge: true,
    title: '3.3 V from a 9 V battery',
    minutes: 10,
    goal: 'Using only resistors, make a node at 3.3 V (±3 %) and measure it with the multimeter.',
    intro: ['Design a divider. Place the meter’s red probe on your output and the black probe on ground.'],
    hints: ['R2 / (R1 + R2) = 3.3 / 9 = 0.367. Try R1 = 5.6 kΩ, R2 = 3.3 kΩ.'],
    checks: [{ kind: 'dmm', min: 3.2, max: 3.4, label: 'Meter reads 3.3 V' }, noDamage],
    build: () => rails('3.3 V challenge').build('challenge'),
  },
  {
    id: 'ch-three-leds',
    unit: 'challenge',
    challenge: true,
    title: 'Three LEDs at 10 mA',
    minutes: 12,
    goal: 'Light three LEDs from 9 V with each at 10 mA (±10 %).',
    intro: ['Series or parallel? Each LED drops about 2 V. Think about how much voltage is left for the resistor.'],
    hints: ['Parallel: three LED + resistor branches with R = (9 − 1.9)/0.01 ≈ 680 Ω each.', 'Series: one resistor for all three: R = (9 − 5.7)/0.01 ≈ 330 Ω.'],
    checks: [{ kind: 'current', type: 'led', count: 3, min: 0.009, max: 0.011, label: 'Three LEDs at 10 mA ± 10 %' }, noDamage],
    build: () => rails('Three LEDs').build('challenge'),
  },
  {
    id: 'ch-1khz',
    unit: 'challenge',
    challenge: true,
    title: 'A 1 kHz square wave',
    minutes: 15,
    goal: 'Build a 555 oscillator at 1 kHz ± 10 % and show it on CH1.',
    intro: ['Power is on both rails. Place a 555, choose R1, R2 and C, and probe the output with CH1.'],
    hints: ['f = 1.44 / ((R1 + 2R2)·C). With C = 100 nF: R1 + 2R2 = 14.4 kΩ, e.g. R1 = 1 kΩ, R2 = 6.8 kΩ.', 'Tie RESET (pin 4) to VCC.'],
    checks: [{ kind: 'hasPart', type: 'ne555', label: 'Uses a 555' }, { kind: 'scopeFreq', ch: 'ch1', min: 900, max: 1100, label: 'CH1 shows 1 kHz ± 10 %' }],
    build: () => rails('1 kHz oscillator', { bottom: true }).build('challenge'),
  },
  {
    id: 'ch-160hz',
    unit: 'challenge',
    challenge: true,
    title: 'A 160 Hz low-pass filter',
    minutes: 10,
    goal: 'Build an RC low-pass filter with fc = 160 Hz ± 12 % driven by the function generator.',
    intro: ['fc = 1 / (2πRC). Confirm with the Bode tab.'],
    hints: ['10 kΩ and 100 nF give 159 Hz.'],
    checks: [{ kind: 'rcCutoff', min: 140, max: 180, label: 'fc ≈ 160 Hz' }],
    build() {
      const b = new DocBuilder('160 Hz filter');
      b.part('funcgen', { x: 20, y: -9 }, { props: { wave: 'sine', freq: 160, amp: 1 }, id: 'fg1' });
      b.wire({ x: 23, y: -9 }, railNear('top', '-', 23), WIRE.black);
      b.part('ground', railNear('top', '-', 28), { id: 'gnd' });
      return b.build('challenge');
    },
  },
  {
    id: 'ch-night',
    unit: 'challenge',
    challenge: true,
    title: 'Dark-activated night light',
    minutes: 15,
    goal: 'Make the LED turn on when it is dark (LDR ≤ 10 lux) and off in bright light (≥ 1000 lux).',
    intro: ['Combine an LDR divider with a transistor. Then drag the LDR’s light slider down and up while running.'],
    hints: ['Put the LDR between the base and ground and a ~47 kΩ resistor from + to the base: in the dark the LDR resistance rises and the base voltage goes up.'],
    checks: [{ kind: 'nightLight', label: 'On in the dark, off in bright light' }, noDamage],
    build: () => rails('Night light').build('challenge'),
  },
  {
    id: 'ch-divide10',
    unit: 'challenge',
    challenge: true,
    title: 'Divide a clock by ten',
    minutes: 15,
    goal: 'Use a 555 and a CD4017 so CH2 runs at exactly one tenth of CH1.',
    intro: ['Put CH1 on the 555 output and CH2 on the CD4017’s carry-out (CO, pin 12), which completes one cycle every ten clocks.'],
    hints: ['A clock of a few hundred hertz makes this quick to see: R1 = 1 kΩ, R2 = 10 kΩ, C = 1 µF ≈ 69 Hz.'],
    checks: [{ kind: 'hasPart', type: 'cd4017', label: 'Uses a CD4017' }, { kind: 'freqRatio', min: 9.5, max: 10.5, label: 'CH1 ÷ CH2 = 10' }],
    build: () => rails('Divide by ten', { bottom: true }).build('challenge'),
  },
];

export function sandboxDoc(): CircuitDoc {
  return rails('Sandbox', { bottom: true }).build('sandbox');
}

export function lessonById(id: string): Lesson | undefined {
  return [...LESSONS, ...CHALLENGES].find((l) => l.id === id);
}
