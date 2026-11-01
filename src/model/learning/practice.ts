import { DocBuilder, WIRE, addRails, railNear } from '../build';
import { exampleById } from '../examples';
import type { CircuitDoc } from '../types';
import type { LearningCheck, LearningLesson, LearningUnit } from './types';
import type { Question } from '../quizzes';

/**
 * Two hands-on units:
 *  - Troubleshooting: each lesson hands you a circuit with one realistic fault to find and fix.
 *  - Sensors & modules: the starter-kit sensors, displays and motor drivers in working circuits.
 */

export const PRACTICE_UNITS: LearningUnit[] = [
  { id: 'm-sensors', title: 'Sensors & modules', summary: 'PIR, ultrasonic, LCD, steppers, H-bridges, piezo tones and batteries that run down.', track: 'arduino' },
  { id: 'm-faults', title: 'Troubleshooting', summary: 'Find and fix the fault: the bugs every beginner meets on a real breadboard.', track: 'engineering' },
];

const noDamage: LearningCheck = { kind: 'noDamage', label: 'Nothing is damaged' };

type Spec = {
  id: string;
  unit: 'm-sensors' | 'm-faults';
  title: string;
  goal: string;
  minutes: number;
  intro: string[];
  hints: string[];
  checks: LearningCheck[];
  build: () => CircuitDoc;
  mechanism: string;
  equation: string;
  worked: string;
  observe: string;
  mistake: string;
  question: Question;
};

function lesson(s: Spec): LearningLesson {
  return {
    id: s.id,
    unit: s.unit,
    title: s.title,
    goal: s.goal,
    minutes: s.minutes,
    level: s.unit === 'm-faults' ? 'Beginner' : 'Intermediate',
    mode: 'simulation',
    prerequisites: ['first-circuit'],
    intro: s.intro,
    equation: s.equation,
    worked: s.worked,
    observe: s.observe,
    mistake: s.mistake,
    steps: [
      { action: s.intro[0], why: s.mechanism },
      ...s.hints.map((h, i) => ({ action: h, why: i === 0 ? s.observe : s.mistake })),
    ],
    questions: [s.question],
    track: s.unit === 'm-faults' ? 'engineering' : 'arduino',
    mechanism: s.mechanism,
    hints: s.hints,
    checks: s.checks,
    build: s.build,
  };
}

/** Battery on the top rails, resistor c10→c14, LED c14/c15 and its return wire: the classic first circuit. */
function ledBase(name: string, opts: { v?: number; r?: number; ret?: boolean } = {}): DocBuilder {
  const b = new DocBuilder(name);
  addRails(b, { v: opts.v ?? 9 });
  b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
  b.part('resistor', 'c10', { id: 'r1', props: { r: opts.r ?? 470 } });
  if (opts.ret !== false) b.wire('a15', railNear('top', '-', 16), WIRE.black);
  return b;
}

const fromExample = (id: string, name: string, edit?: (d: CircuitDoc) => void) => (): CircuitDoc => {
  const d = exampleById(id)!.build();
  d.name = name;
  d.origin = 'lesson';
  edit?.(d);
  return d;
};

const dropWire = (d: CircuitDoc, x: number, y: number) => {
  d.wires = d.wires.filter((w) => !((w.a.x === x && w.a.y === y) || (w.b.x === x && w.b.y === y)));
};

// ------------------------------------------------------------------ troubleshooting

const FAULTS: LearningLesson[] = [
  lesson({
    id: 'fault-backwards-led',
    unit: 'm-faults',
    title: 'Fault: the LED stays dark',
    goal: 'Find out why the LED does not light and fix it, without damaging anything.',
    minutes: 4,
    intro: [
      'The wiring looks complete: battery, resistor, LED, back to the battery. Power on: nothing.',
      'Tap the LED and read its voltage. Then look closely at which leg is which.',
    ],
    hints: ['The LED’s voltage is negative: it is reverse-biased.', 'Select the LED and rotate it twice (or use Fix it in the circuit check) so the anode faces the resistor.'],
    checks: [{ kind: 'ledOn', part: 'd1', label: 'The LED lights' }, noDamage],
    build() {
      const b = ledBase('Fault: dark LED', { v: 4.5, r: 220 });
      b.part('led', 'd15', { id: 'd1', rot: 2, props: { color: 'red' } }); // anode in column 15, cathode in 14
      return b.build('lesson');
    },
    mechanism: 'A diode conducts only from anode to cathode. Turned round, it blocks and the whole series loop carries no current.',
    equation: 'I ≈ 0 when V(anode) < V(cathode)',
    worked: 'With 4.5 V reversed across the LED its anode is 4.5 V below its cathode: no current, no light. Flipped, I = (4.5 − 1.9) / 220 ≈ 12 mA.',
    observe: 'The circuit check reports the LED as reversed; the meter shows −4.5 V across it.',
    mistake: 'Assuming a dark LED is broken. Check its orientation first: the longer leg (anode, +) goes towards the positive supply.',
    question: { q: 'An LED in a correct-looking loop stays dark and shows −4.5 V across it. What is wrong?', options: ['It is burnt out', 'It is in backwards', 'The resistor is too large'], answer: 1, why: 'A negative voltage means the cathode is more positive than the anode: the LED is reverse-biased and blocks current.' },
  }),
  lesson({
    id: 'fault-same-strip',
    unit: 'm-faults',
    title: 'Fault: a resistor that does nothing',
    goal: 'The resistor is plugged in but no current flows through it. Re-seat it so the LED lights at 10–20 mA.',
    minutes: 5,
    intro: [
      'R1 stands upright in column 10, and the LED waits in columns 14 and 15. The LED stays dark.',
      'Tap a hole in column 10 to see every hole it is joined to.',
    ],
    hints: ['Both legs of R1 are in column 10: the strip joins them, so R1 is bypassed and nothing reaches column 14.', 'Rotate R1 so it lies flat from c10 to c14.'],
    checks: [{ kind: 'ledOn', part: 'd1', label: 'The LED lights' }, { kind: 'current', part: 'r1', min: 0.01, max: 0.02, label: 'R1 carries 10–20 mA' }, noDamage],
    build() {
      const b = new DocBuilder('Fault: bypassed resistor');
      addRails(b, { v: 9 });
      b.wire(railNear('top', '+', 10), 'b10', WIRE.red);
      b.part('resistor', 'a10', { id: 'r1', rot: 1, props: { r: 470 } }); // a10–e10: both legs in column 10
      b.part('led', 'd14', { id: 'd1', props: { color: 'green' } });
      b.wire('a15', railNear('top', '-', 16), WIRE.black);
      return b.build('lesson');
    },
    mechanism: 'Each 5-hole column strip is one conductor. A part with both legs in the same strip is shorted by the breadboard itself.',
    equation: 'R_parallel = R × 0 / (R + 0) = 0',
    worked: 'Laid from c10 to c14, R1 limits the LED current to (9 − 2) / 470 ≈ 15 mA.',
    observe: 'Tapping hole a10 highlights all five holes of the strip, both of R1’s legs among them. The circuit check calls R1 “bypassed”.',
    mistake: 'Plugging both legs of a part into one column. Parts must bridge different strips.',
    question: { q: 'Why does a resistor with both legs in column 10 carry no current?', options: ['Resistors only work horizontally', 'The strip joins its legs, so it is shorted', 'Column 10 is not powered'], answer: 1, why: 'The five holes of a strip are one conductor: both legs sit at the same voltage, so no current flows through the resistor.' },
  }),
  lesson({
    id: 'fault-open-loop',
    unit: 'm-faults',
    title: 'Fault: an open circuit',
    goal: 'Current needs a complete loop. Find the break and close it so the LED lights.',
    minutes: 3,
    intro: ['Everything is in place except… something. Power on and use the meter or tap holes to find where the voltage stops.'],
    hints: ['Column 15 (the LED’s cathode) is not connected to anything: the loop is open.', 'Draw a wire from a15 to the blue − rail.'],
    checks: [{ kind: 'ledOn', part: 'd1', label: 'The LED lights' }, noDamage],
    build() {
      const b = ledBase('Fault: open loop', { ret: false });
      b.part('led', 'd14', { id: 'd1', props: { color: 'yellow' } });
      return b.build('lesson');
    },
    mechanism: 'Charge must return to the source. One missing link anywhere in a series loop stops the current everywhere in it.',
    equation: 'I = V / (R + R_open) → 0 as R_open → ∞',
    worked: 'With the return wire in place: I = (9 − 2.1) / 470 ≈ 15 mA.',
    observe: 'The red ring on nothing — but the circuit check reports the LED’s cathode as “not connected”. Its voltage floats up to the anode’s.',
    mistake: 'Forgetting the return path to the negative rail.',
    question: { q: 'An LED’s anode reads 9 V and its cathode also reads 9 V. Most likely:', options: ['The cathode is not connected back to −', 'The LED is shorted', 'The battery is flat'], answer: 0, why: 'With no return path no current flows, so there is no drop across the LED and both legs float to the supply voltage.' },
  }),
  lesson({
    id: 'fault-split-rail',
    unit: 'm-faults',
    title: 'Fault: the dead half of the board',
    goal: 'The LED on the right of the board never lights. Make the power reach it.',
    minutes: 4,
    intro: [
      'This circuit lives on the right-hand half of the breadboard and takes power from the right-hand rails.',
      'Many full-size breadboards split their power rails in the middle. Look at the gap in the red and blue lines.',
    ],
    hints: ['The rails are split at column 31: the right halves are not joined to the left halves where the battery is.', 'Bridge the gap on both rails with short wires (left + to right +, left − to right −).'],
    checks: [{ kind: 'ledOn', part: 'd1', label: 'The LED lights' }, noDamage],
    build() {
      const b = new DocBuilder('Fault: split rails');
      addRails(b, { v: 9 });
      b.doc.wires = b.doc.wires.filter((w) => !(w.a.x === 32 && w.b.x === 34)); // no jumpers across the split
      b.wire(railNear('top', '+', 45), 'a45', WIRE.red);
      b.part('resistor', 'c45', { id: 'r1', props: { r: 470 } });
      b.part('led', 'd49', { id: 'd1', props: { color: 'blue' } });
      b.wire('a50', railNear('top', '-', 51), WIRE.black);
      return b.build('lesson');
    },
    mechanism: 'Split rails are two separate conductors per side. Power applied to the left half never reaches the right half unless you bridge it.',
    equation: 'R(left rail ↔ right rail) = ∞ without a jumper',
    worked: 'With both halves bridged the LED sees the full 9 V loop: (9 − 3.1) / 470 ≈ 12 mA.',
    observe: 'Tap a + rail hole on the right: only the right half lights up as connected.',
    mistake: 'Assuming each rail runs the whole length of the board. Check for the break in the printed line.',
    question: { q: 'What does a gap in the printed red line along a breadboard rail mean?', options: ['A decoration', 'The rail is split into two separate halves', 'That section is for 3.3 V'], answer: 1, why: 'On split-rail boards each half is its own conductor; you must jumper them to share power.' },
  }),
  lesson({
    id: 'fault-wrong-value',
    unit: 'm-faults',
    title: 'Fault: the LED keeps burning out',
    goal: 'The LED burns out at power-on. Fix the cause, replace the LED, and run it at 10–20 mA.',
    minutes: 5,
    intro: ['Power on and watch: the LED flashes and cracks. Check the resistor’s colour bands and value.'],
    hints: ['R1 is 47 Ω: I = (9 − 2) / 47 ≈ 150 mA, seven times an LED’s 20 mA rating.', 'Change R1 to 470 Ω, then tap the LED and Repair it (or use Fix it).'],
    checks: [{ kind: 'current', part: 'r1', min: 0.01, max: 0.02, label: 'LED current 10–20 mA' }, { kind: 'ledOn', part: 'd1', label: 'The LED lights' }, noDamage],
    build() {
      const b = ledBase('Fault: burning LED', { r: 47 });
      b.part('led', 'd14', { id: 'd1', props: { color: 'red' } });
      return b.build('lesson');
    },
    mechanism: 'The series resistor sets the LED current: I = (V_supply − V_LED) / R. Too small a resistor lets far too much current through.',
    equation: 'R = (V_s − V_f) / I_target',
    worked: 'For 15 mA from 9 V with a 2 V red LED: R = 7 / 0.015 ≈ 470 Ω (yellow-violet-brown).',
    observe: 'The current bar goes deep red and the LED cracks within a fraction of a second.',
    mistake: 'Reading a resistor’s third band wrong: yellow-violet-black is 47 Ω, yellow-violet-brown is 470 Ω.',
    question: { q: 'A red LED on 9 V needs about 15 mA. Which resistor?', options: ['47 Ω', '470 Ω', '47 kΩ'], answer: 1, why: '(9 − 2) / 0.015 ≈ 467 Ω, so 470 Ω is the standard value.' },
  }),
  lesson({
    id: 'fault-transistor',
    unit: 'm-faults',
    title: 'Fault: a weak transistor switch',
    goal: 'The transistor should switch the LED fully on (over 15 mA). Find out why it barely glows.',
    minutes: 6,
    intro: [
      'An NPN transistor switches the LED. Its base gets plenty of current through R2, yet the LED is dim.',
      'Tap Q1 and read its region. Then compare its legs with the datasheet: E, B, C.',
    ],
    hints: ['Q1 is turned round: collector and emitter are swapped, so it runs in reverse with a tiny gain.', 'Rotate Q1 twice so E goes to ground and C to the LED.'],
    checks: [{ kind: 'current', part: 'd1', min: 0.015, max: 0.03, label: 'LED current above 15 mA' }, noDamage],
    build() {
      const b = new DocBuilder('Fault: weak switch');
      addRails(b, { v: 9 });
      b.wire(railNear('top', '+', 12), 'a12', WIRE.red);
      b.part('resistor', 'c12', { id: 'r1', props: { r: 330 } }); // collector load 12 → 16
      b.part('led', 'd16', { id: 'd1', props: { color: 'green' } }); // 16 → 17
      // Q1 turned round: its emitter sits in column 17 (LED side) and its collector in column 19 (ground)
      b.part('npn', 'e17', { id: 'q1' });
      b.wire('a19', railNear('top', '-', 20), WIRE.black);
      b.part('resistor', 'h14', { id: 'r2', props: { r: 4700 } }); // base resistor: column 14 (bottom) → 18 (bottom)
      b.wire('j14', railNear('bottom', '+', 14), WIRE.red);
      b.wire('f18', 'd18', WIRE.yellow);
      b.wire({ x: 62, y: 2 }, { x: 62, y: 20 }, WIRE.red);
      b.wire({ x: 32, y: 20 }, { x: 34, y: 20 }, WIRE.red);
      return b.build('lesson');
    },
    mechanism: 'A BJT amplifies from collector to emitter. Swapped, it still conducts a little (reverse-active mode) but its current gain falls from ≈200 to about 1.',
    equation: 'I_C = β · I_B (β ≈ 200 forward, ≈ 1 reversed)',
    worked: 'I_B = (9 − 0.7) / 4.7 kΩ ≈ 1.8 mA: forward that saturates the transistor and the LED gets (9 − 2.2 − 0.1) / 330 ≈ 20 mA.',
    observe: 'Region shows the transistor in an odd state; the LED glows faintly.',
    mistake: 'Plugging a TO-92 transistor in mirrored. Flat face towards you: E, B, C from left to right for the 2N3904.',
    question: { q: 'Why does a backwards NPN transistor only switch a little current?', options: ['Its reverse current gain is close to 1', 'The base burns out', 'It becomes a PNP'], answer: 0, why: 'The emitter is heavily doped and the collector is not; swapped, the device has a very low current gain.' },
  }),
  lesson({
    id: 'fault-short',
    unit: 'm-faults',
    title: 'Fault: the battery gets hot',
    goal: 'Something shorts the battery. Find the stray wire, remove it, and get the LED working.',
    minutes: 4,
    intro: ['Open the circuit check (the warning badge at the bottom). Then look along the rails for a wire that should not be there.'],
    hints: ['A short jumper joins the + and − rails near column 40.', 'Select it and delete it, or tap Fix it on the “short-circuited” card.'],
    checks: [{ kind: 'ledOn', part: 'd1', label: 'The LED lights' }, noDamage],
    build() {
      const b = ledBase('Fault: short circuit');
      b.part('led', 'd14', { id: 'd1', props: { color: 'red' } });
      b.wire({ x: 41, y: 2 }, { x: 41, y: 3 }, WIRE.white);
      return b.build('lesson');
    },
    mechanism: 'A wire straight across a source has almost no resistance, so the source delivers as much current as its internal resistance allows and its voltage collapses.',
    equation: 'I_short = V / r_internal ≈ 9 V / 1.7 Ω ≈ 5 A',
    worked: 'With the short, the rails sit near 0 V and the LED sees nothing; removed, the LED gets ≈15 mA.',
    observe: 'The battery’s current reads amps and it may fail; every part sees almost no voltage.',
    mistake: 'Leaving a stray jumper across the rails — the most common way to flatten (or overheat) a battery.',
    question: { q: 'A wire across a 9 V battery with 1.7 Ω internal resistance draws about:', options: ['15 mA', '0.5 A', '5 A'], answer: 2, why: 'Only the internal resistance limits it: 9 / 1.7 ≈ 5 A.' },
  }),
  lesson({
    id: 'fault-common-ground',
    unit: 'm-faults',
    title: 'Fault: no common ground',
    goal: 'The Uno blinks pin 13 but the LED on the breadboard stays dark. Fix it.',
    minutes: 4,
    intro: ['The LED’s return wire goes to the breadboard’s − rail. Does anything connect that rail to the Uno?'],
    hints: ['The Uno’s GND is not wired to the − rail, so the LED current has no way back.', 'Draw a wire from the Uno’s GND pin (next to D13) to the bottom − rail.'],
    checks: [{ kind: 'blinks', part: 'd1', min: 2, label: 'The LED blinks (2 times)' }, noDamage],
    build() {
      const d = exampleById('arduino-blink')!.build();
      d.name = 'Fault: no common ground';
      d.origin = 'lesson';
      dropWire(d, 29, 28);
      return d;
    },
    mechanism: 'A voltage is always between two points. An Arduino pin’s 5 V is measured from the Arduino’s GND; the load must return there.',
    equation: 'Loop: pin → R → LED → GND → back to the Uno',
    worked: 'Once GND is joined, pin 13 drives (5 − 2) / 220 ≈ 14 mA through the LED every other half-second.',
    observe: 'The on-board L LED blinks (it has its own return) while the breadboard LED does not.',
    mistake: 'Powering modules or LEDs from a separate supply or rail without tying its ground to the controller’s GND.',
    question: { q: 'Two boards share a signal wire but not a ground wire. Will the signal work?', options: ['Yes, one wire is enough', 'No: the current needs a common return', 'Only for analog signals'], answer: 1, why: 'Every signal is a voltage relative to ground and needs a return path, so the grounds must be connected.' },
  }),
];

// ------------------------------------------------------------------ sensors & modules

const SENSORS: LearningLesson[] = [
  lesson({
    id: 'pir-light',
    unit: 'm-sensors',
    title: 'PIR motion light',
    goal: 'Connect the PIR sensor’s OUT pin to the LED circuit, then make someone move so the light comes on.',
    minutes: 5,
    intro: [
      'A PIR (passive infrared) sensor notices warm bodies moving. Its OUT pin goes HIGH and stays HIGH for a hold time.',
      'Wire OUT (the middle pin) to column 30, where the LED’s resistor starts. Then tap the PIR and switch on “Someone moving”.',
    ],
    hints: ['Drag a wire from the PIR’s middle pin to hole a30.', 'Select the PIR and turn on “Someone moving” while the power is on.'],
    checks: [{ kind: 'prop', part: 'pir1', key: 'motion', equals: true, label: 'Someone is moving' }, { kind: 'ledOn', part: 'd1', label: 'The light comes on' }],
    build: fromExample('pir-light', 'PIR motion light', (d) => dropWire(d, 41, -8)),
    mechanism: 'A pyroelectric element sees the infrared change as a warm body crosses its zones; a comparator and a timer turn that into a clean HIGH pulse.',
    equation: 'OUT = HIGH for t_hold after the last movement',
    worked: 'OUT ≈ 5 V through the sensor’s output resistance drives (5 − 2.1) / (330 + 100) ≈ 7 mA through the LED.',
    observe: 'Turn motion off: the LED stays on for the hold time, then goes out.',
    mistake: 'Expecting the output to turn off the instant movement stops: every PIR has a hold (re-trigger) time.',
    question: { q: 'Why does a PIR light stay on for a while after you stop moving?', options: ['The LED cools slowly', 'The sensor holds its output for a set time', 'Body heat lingers'], answer: 1, why: 'The module has a timer (the “hold” pot) that keeps OUT high after the last detected movement.' },
  }),
  lesson({
    id: 'ultrasonic-range',
    unit: 'm-sensors',
    title: 'Ultrasonic distance',
    goal: 'Bring the object closer than 20 cm: the warning LED lights and the Serial Monitor shows the distance.',
    minutes: 6,
    intro: [
      'The HC-SR04 times an ultrasonic echo: 58 µs of echo pulse for every centimetre.',
      'Power on, open Instruments → Serial to see the readings, then tap the sensor and slide the object distance.',
    ],
    hints: ['Select the HC-SR04 and set the distance below 20 cm.', 'Open the scope: CH1 is TRIG, CH2 is ECHO. The ECHO pulse gets shorter as the object comes closer.'],
    checks: [{ kind: 'prop', part: 'us1', key: 'dist', max: 19.5, label: 'Object closer than 20 cm' }, { kind: 'ledOn', part: 'd1', label: 'The warning LED lights' }],
    build: fromExample('ultrasonic', 'Ultrasonic distance'),
    mechanism: 'Sound travels about 343 m/s; the module measures the round trip, so distance = time × 343 / 2.',
    equation: 'd (cm) = t_echo (µs) / 58',
    worked: 'At 15 cm the echo lasts 15 × 58 = 870 µs; the sketch counts it with Timer1 and divides.',
    observe: 'On the scope the ECHO pulse width is proportional to the distance slider.',
    mistake: 'Forgetting the factor of two: the sound goes out and back.',
    question: { q: 'An echo pulse lasts 1160 µs. How far is the object?', options: ['10 cm', '20 cm', '40 cm'], answer: 1, why: '1160 / 58 = 20 cm (58 µs per cm accounts for the round trip).' },
  }),
  lesson({
    id: 'lcd-wire-e',
    unit: 'm-sensors',
    title: 'Character LCD',
    goal: 'The LCD stays blank. Connect its E (enable) pin to D11 so “Hello, Bench!” appears.',
    minutes: 6,
    intro: [
      'The HD44780 controller only reads its data lines when E falls from HIGH to LOW. Without E it never hears a thing.',
      'Wire the LCD’s E pin (the 6th from the left) to the Uno’s D11, then switch the power off and on: the LCD is initialised once at start-up.',
    ],
    hints: ['E is the sixth header pin (VSS, VDD, V0, RS, RW, E…).', 'D11 is the fourth header pin from the left on the Uno’s top row (GND, 13, 12, 11).', 'Power-cycle after wiring so the sketch repeats the start-up sequence.'],
    checks: [{ kind: 'extraText', part: 'lcd1', key: 'line1', includes: 'Hello', label: 'The LCD says Hello' }],
    build: fromExample('lcd-hello', 'Character LCD', (d) => dropWire(d, 55, 44)),
    mechanism: 'In 4-bit mode each byte is sent as two nibbles on D4–D7; every nibble is latched by a pulse on E. RS selects command or character.',
    equation: 'Line 2 starts at DDRAM address 0x40 (command 0xC0)',
    worked: 'The sketch sends 0x28 (4-bit, 2 lines), 0x0C (display on), 0x06 (move right), 0x01 (clear), then the characters of “Hello, Bench!”.',
    observe: 'Instruments → Logic can show RS, E and D4–D7: the nibbles change, then E pulses.',
    mistake: 'Leaving V0 (contrast) floating or at 5 V: the text is there but invisible.',
    question: { q: 'When does an HD44780 LCD read its data lines?', options: ['Continuously', 'On the falling edge of E', 'When RS goes high'], answer: 1, why: 'The controller latches D4–D7 (or D0–D7) when the enable line goes from HIGH to LOW.' },
  }),
  lesson({
    id: 'stepper-power',
    unit: 'm-sensors',
    title: 'Stepper motor',
    goal: 'The stepper does not move. Give its common (red) wire 5 V so the shaft turns at least 45°.',
    minutes: 5,
    intro: [
      'The ULN2003 pulls each coil’s end to ground in turn, but a coil needs its other end on +5 V for current to flow.',
      'Connect the stepper’s + pin (red, rightmost) to the top + rail.',
    ],
    hints: ['Drag a wire from the stepper’s + pin to a hole on the top red rail.', 'Watch the coils energise in the inspector: AB, BC, CD, DA…'],
    checks: [{ kind: 'extra', part: 'm1', key: 'angle', min: 45, max: 400, unit: '°', label: 'The shaft turns 45°' }, noDamage],
    build: fromExample('stepper-uln2003', 'Stepper motor', (d) => dropWire(d, 24, -8)),
    mechanism: 'Energising the coils in sequence rotates the magnetic field one step at a time; the rotor follows, and the 64:1 gearbox multiplies the torque.',
    equation: 'Shaft angle = steps × 360° / 2048',
    worked: 'At one full step every 2 ms the shaft makes 500 steps a second: 500 × 360 / 2048 ≈ 88° per second (≈15 rpm).',
    observe: 'Reverse the step order and it turns the other way.',
    mistake: 'Driving coils straight from Arduino pins: each coil needs ≈100 mA, far more than a pin can give. That is the ULN2003’s job.',
    question: { q: 'How many full steps turn a 28BYJ-48 output shaft once?', options: ['32', '200', '2048'], answer: 2, why: '32 steps per motor revolution × the 64:1 gearbox = 2048 steps at the output shaft.' },
  }),
  lesson({
    id: 'hbridge-reverse',
    unit: 'm-sensors',
    title: 'H-bridge: forwards and backwards',
    goal: 'The motor never starts. Enable the L293D’s first channel, then watch the motor reverse (below −500 rpm).',
    minutes: 6,
    intro: [
      'The L293D only drives outputs 1 and 2 while its EN1,2 pin (pin 1, top-left of the chip) is HIGH.',
      'Wire EN1,2 (column 30, bottom half) to the bottom + rail (5 V). Then wait for the reverse phase (about 3 s in).',
    ],
    hints: ['Draw a wire from j30 to the bottom red rail.', 'Inspect the motor: its rpm goes positive, to zero, then negative.'],
    checks: [{ kind: 'extra', part: 'm1', key: 'rpm', min: -1e9, max: -500, unit: 'rpm', label: 'The motor runs backwards' }, noDamage],
    build: fromExample('motor-l293d', 'H-bridge', (d) => dropWire(d, 31, 17)),
    mechanism: 'Two half-bridges drive the motor’s two ends. 1A high and 2A low puts +V on one end and 0 V on the other; swapping them reverses the current.',
    equation: 'V_motor = V(1Y) − V(2Y) = ±(V_CC2 − drops)',
    worked: 'With a 9 V motor supply the motor sees about 9 − 2 × 0.5 A × 2 Ω ≈ 7 V and spins near 13 000 rpm unloaded.',
    observe: 'During the 1 s stop both outputs are LOW, which brakes the motor quickly.',
    mistake: 'Running a motor straight from an Arduino pin: motors need far more current than a pin can deliver, and their back-EMF spikes need diodes.',
    question: { q: 'With 1A = LOW and 2A = HIGH (enabled), the motor:', options: ['Stops', 'Runs in reverse', 'Runs forwards at half speed'], answer: 1, why: 'The voltage across the motor changes sign, so the current and the direction of rotation reverse.' },
  }),
  lesson({
    id: 'piezo-pitch',
    unit: 'm-sensors',
    title: 'Tune a 555 siren',
    goal: 'Lower the piezo’s pitch from about 1 kHz to between 400 and 600 Hz.',
    minutes: 5,
    intro: [
      'A 555 astable makes a square wave at f ≈ 1.44 / ((R1 + 2·R2)·C), and a passive buzzer sounds at that frequency. Turn your sound on!',
      'Change R2 or C so the frequency falls into the 400–600 Hz range. The piezo shows the pitch it hears.',
    ],
    hints: ['Doubling C halves the frequency: try 220 nF.', 'Or set R2 to 15 kΩ: 1.44 / ((1k + 30k) × 100 nF) ≈ 465 Hz.'],
    checks: [{ kind: 'extra', part: 'bz1', key: 'freq', min: 400, max: 600, unit: 'Hz', label: 'Pitch 400–600 Hz' }],
    build: fromExample('siren-555', '555 siren'),
    mechanism: 'The capacitor charges through R1 + R2 and discharges through R2 between ⅓ and ⅔ of the supply; each cycle takes 0.693·(R1 + 2·R2)·C.',
    equation: 'f = 1.44 / ((R1 + 2·R2)·C)',
    worked: 'R1 = 1 k, R2 = 6.8 k, C = 100 nF: f = 1.44 / (14.6 k × 100 n) ≈ 986 Hz.',
    observe: 'Probe CH1 is on the output: the scope shows the square wave and measures its frequency.',
    mistake: 'Using an active buzzer: it beeps at its own fixed pitch whatever you feed it.',
    question: { q: 'You double the timing capacitor of a 555 astable. The pitch:', options: ['Doubles', 'Halves', 'Stays the same'], answer: 1, why: 'f is inversely proportional to C, so twice the capacitance gives half the frequency.' },
  }),
  lesson({
    id: 'soil-wet',
    unit: 'm-sensors',
    title: 'Soil moisture threshold',
    goal: 'Water the plant: raise the soil moisture until the sensor’s output falls below 2 V.',
    minutes: 4,
    intro: [
      'The soil sensor is a voltage divider: dry soil conducts poorly so AO is high; wet soil pulls it down.',
      'The meter is already on AO. Power on, select the sensor and slide the moisture up.',
    ],
    hints: ['Around 60 % moisture AO drops below 2 V (about 400 on the Arduino’s 0–1023 scale).', 'Instruments → Serial shows the ADC reading the sketch prints.'],
    checks: [{ kind: 'dmm', min: 0.2, max: 2, label: 'AO below 2 V (wet soil)' }],
    build: fromExample('soil-monitor', 'Soil moisture'),
    mechanism: 'Water with dissolved salts carries current between the probes; more water, lower resistance, lower output voltage.',
    equation: 'ADC = 1023 × V_AO / 5 V',
    worked: 'At 2 V the Arduino reads 1023 × 2 / 5 ≈ 409: a sketch might water below 400 and stop above 700.',
    observe: 'The serial values fall smoothly as you slide the moisture.',
    mistake: 'Leaving resistive probes powered all the time: electrolysis eats them. Power them from a pin only while measuring.',
    question: { q: 'AO reads 4.5 V on a 5 V soil sensor. The soil is:', options: ['Dry', 'Wet', 'Frozen'], answer: 0, why: 'This kind of module outputs a high voltage when the probes see a high (dry) resistance.' },
  }),
  lesson({
    id: 'battery-runs-down',
    unit: 'm-sensors',
    title: 'A battery runs down',
    goal: 'Run the LED until the battery’s terminal voltage falls below 8 V.',
    minutes: 4,
    intro: [
      'Real batteries hold a limited charge (mAh). This demo cell holds only 0.2 mAh so you can watch it drain in about a minute.',
      'Power on and keep an eye on the meter (it measures the rails) and the charge bar on the battery.',
    ],
    hints: ['Just wait: about 15 mA drains 0.2 mAh in under a minute.', 'Speed things up by lowering R1 (more current) — but stay above 220 Ω.'],
    checks: [{ kind: 'dmm', min: 0, max: 8, label: 'Battery voltage below 8 V' }],
    build() {
      const d = exampleById('battery-drain')!.build();
      d.name = 'A battery runs down';
      d.origin = 'lesson';
      const src = d.parts.find((p) => p.id === 'src');
      if (src) src.props = { ...src.props, mah: 0.2 };
      return d;
    },
    mechanism: 'A battery’s EMF depends on its state of charge; as charge is used it sags slowly, then collapses near empty.',
    equation: 'Run time ≈ capacity (mAh) / current (mA)',
    worked: 'A 500 mAh 9 V battery at 15 mA lasts about 500 / 15 ≈ 33 hours.',
    observe: 'The LED dims as the voltage sags — dimmer LEDs are often the first sign of a tired battery.',
    mistake: 'Assuming a battery delivers its nominal voltage until it suddenly dies.',
    question: { q: 'Roughly how long does a 2500 mAh AA pack run a 50 mA load?', options: ['5 hours', '50 hours', '500 hours'], answer: 1, why: '2500 mAh / 50 mA = 50 hours (a little less in practice).' },
  }),
];

export const PRACTICE_LESSONS: LearningLesson[] = [...SENSORS, ...FAULTS];
export const FAULT_LESSONS = FAULTS;
