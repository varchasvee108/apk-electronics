import { DIODE_1N4001, led } from '@sim/models';
import type { ElementSpec, Params } from '@sim/types';
import { formatEng } from '@sim/units';
import type { ExpandCtx, PartDef, PinDef } from './parts';
import type { Props } from './types';

/**
 * Sensor modules, drivers and other starter-kit parts. Self-contained (only type imports from parts.ts)
 * so the part catalogue can include them without an import cycle.
 */

const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
function el(ctx: ExpandCtx, suffix: string, type: string, nodes: number[], params: Params): ElementSpec {
  return { id: suffix ? `${ctx.id}.${suffix}` : ctx.id, type, nodes, params, partId: ctx.id };
}
const row = (names: string[]): PinDef[] => names.map((name, i) => ({ name, dx: i, dy: 0 }));
function dip(names: string[]): PinDef[] {
  const half = names.length / 2;
  return names.map((name, i) => (i < half ? { name, dx: i, dy: 3 } : { name, dx: names.length - 1 - i, dy: 0 }));
}
const dipBox = (count: number) => ({ x: -0.45, y: 0.55, w: count / 2 - 1 + 0.9, h: 1.9 });

/** Thevenin source as two resistors: output = frac × VCC through about `rth` ohms. */
function divider(ctx: ExpandCtx, vcc: number, out: number, gnd: number, frac: number, rth = 1000): ElementSpec[] {
  const f = Math.max(1e-4, Math.min(1 - 1e-4, frac));
  return [el(ctx, 'hi', 'R', [vcc, out], { r: rth / f, maxP: 0 }), el(ctx, 'lo', 'R', [out, gnd], { r: rth / (1 - f), maxP: 0 })];
}

// ------------------------------------------------------------------ outputs

const piezo: PartDef = {
  type: 'piezo',
  name: 'Passive buzzer (piezo)',
  category: 'Output',
  prefix: 'BZ',
  pins: [
    { name: '+', dx: 0, dy: 0 },
    { name: '−', dx: 2, dy: 0 },
  ],
  box: { x: -0.4, y: -1.4, w: 2.8, h: 2.8 },
  defaults: {},
  props: [],
  keywords: 'speaker tone sound melody',
  expand: (_p, ctx) => [el(ctx, '', 'piezo', [ctx.pin(0), ctx.pin(1)], { r: 400 })],
  info: {
    summary: 'A piezo disc with no oscillator of its own: it sounds at whatever frequency drives it. Bench plays the tone through your speaker.',
    pinout: ['+ : signal', '− : ground'],
    specs: [
      ['Range', '≈100 Hz – 10 kHz (loudest near 2–4 kHz)'],
      ['Drive', '3–12 V square wave'],
      ['On DC', 'silent (only a click)'],
    ],
    how: 'The ceramic flexes each time the voltage changes, so a square wave makes it vibrate at that frequency. Drive it from a 555 astable, a function generator, or an Arduino pin with tone(). An active buzzer, by contrast, beeps at its own fixed pitch on plain DC.',
    typical: ['Arduino melody with tone()', '555 siren', 'Alarm sounder'],
  },
};

const LCD_PINS = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
const lcd: PartDef = {
  type: 'lcd1602',
  name: '16×2 LCD (HD44780)',
  category: 'Output',
  prefix: 'LCD',
  pins: row(LCD_PINS),
  box: { x: -1.6, y: -8.2, w: 18.2, h: 8.5 },
  offBoard: true,
  defaults: {},
  props: [],
  keywords: 'display character text liquid crystal 1602',
  expand(_p, ctx) {
    const nodes = LCD_PINS.map((_, i) => ctx.pin(i));
    const mid = ctx.internal('bl');
    return [
      el(ctx, '', 'lcd', nodes, {}),
      // backlight LED with the module's on-board 100 Ω resistor
      el(ctx, 'bl', 'D', [ctx.pin(14), mid], { ...led('white'), maxI: 0 }),
      el(ctx, 'blr', 'R', [mid, ctx.pin(15)], { r: 100, maxP: 0 }),
    ];
  },
  info: {
    summary: 'Two lines of 16 characters, driven by the HD44780 controller. The classic Arduino display.',
    pinout: [
      'VSS : ground',
      'VDD : +5 V',
      'V0 : contrast (0 V = darkest; use a 10 kΩ pot)',
      'RS : register select (0 = command, 1 = character)',
      'RW : read/write (tie to GND)',
      'E : enable (data latched on its falling edge)',
      'D0–D7 : data (4-bit mode uses D4–D7 only)',
      'A / K : backlight LED + / −',
    ],
    specs: [
      ['Supply', '5 V, ≈1 mA (+ backlight ≈ 20 mA)'],
      ['Interface', '4-bit or 8-bit parallel'],
      ['Timing', 'commands ≈40 µs; clear and home ≈1.6 ms'],
    ],
    how: 'After power-up the controller is in 8-bit mode. The usual Arduino library sends 0x3 three times and then 0x2 on D4–D7 to switch to 4-bit mode; every byte after that goes as two nibbles, high first, each latched by a pulse on E. RS chooses between commands (clear 0x01, display on 0x0C, set position 0x80 + address) and characters. Line 2 starts at address 0x40.',
    typical: ['LiquidCrystal lcd(12, 11, 5, 4, 3, 2)', 'Distance or temperature readout', 'Menus with buttons'],
  },
};

const STEP_PINS = ['A', 'B', 'C', 'D', '+'];
const stepper: PartDef = {
  type: 'stepper',
  name: 'Stepper motor 28BYJ-48',
  category: 'Output',
  prefix: 'M',
  pins: row(STEP_PINS),
  box: { x: -1.3, y: -7.4, w: 6.6, h: 7.7 },
  offBoard: true,
  defaults: {},
  props: [],
  keywords: 'step motor uln2003 rotation',
  expand(_p, ctx) {
    return [el(ctx, '', 'stepper', STEP_PINS.map((_, i) => ctx.pin(i)), { rcoil: 50 })];
  },
  info: {
    summary: 'A small 5 V unipolar stepper with a 64:1 gearbox: 2048 full steps per turn of the output shaft.',
    pinout: ['A (orange), B (yellow), C (pink), D (blue): coil ends', '+ (red): common, to +5 V'],
    specs: [
      ['Coil', '≈50 Ω per phase, 5 V'],
      ['Steps', '32 full steps × 64:1 gear = 2048 per revolution'],
      ['Speed', 'up to ≈15 rpm'],
    ],
    how: 'Each coil runs from the red common wire to one of the four leads. Pulling the leads low in the order A, B, C, D (through a ULN2003 driver) rotates the magnetic field a quarter of a turn per step and the rotor follows it. Energising two neighbouring coils at once gives more torque; reversing the order reverses the direction.',
    typical: ['ULN2003 driver from four Arduino pins', 'Clock hands, camera sliders, valves'],
  },
};

// ------------------------------------------------------------------ drivers

const L293_PINS = ['EN1,2', '1A', '1Y', 'GND', 'GND2', '2Y', '2A', 'VCC2', 'EN3,4', '3A', '3Y', 'GND3', 'GND4', '4Y', '4A', 'VCC1'];
const l293d: PartDef = {
  type: 'l293d',
  name: 'L293D motor driver',
  category: 'Drivers & modules',
  prefix: 'U',
  pins: dip(L293_PINS),
  box: dipBox(16),
  dip: true,
  defaults: {},
  props: [],
  keywords: 'h-bridge motor driver dc motor direction',
  expand(_p, ctx) {
    const pin = (nm: string) => ctx.pin(L293_PINS.indexOf(nm));
    const out: ElementSpec[] = [el(ctx, '', 'hbridge', L293_PINS.map((_, i) => ctx.pin(i)), { ron: 2 })];
    for (const g of ['GND2', 'GND3', 'GND4']) out.push(el(ctx, g.toLowerCase(), 'R', [pin('GND'), pin(g)], { r: 1e-3, maxP: 0 }));
    // internal clamp diodes on every output (motor back-EMF)
    ['1Y', '2Y', '3Y', '4Y'].forEach((y, k) => {
      out.push(el(ctx, `dh${k}`, 'D', [pin(y), pin('VCC2')], { ...DIODE_1N4001, maxI: 0 }));
      out.push(el(ctx, `dl${k}`, 'D', [pin('GND'), pin(y)], { ...DIODE_1N4001, maxI: 0 }));
    });
    return out;
  },
  info: {
    summary: 'Four half-H drivers with clamp diodes: drive two DC motors forwards and backwards, or one stepper.',
    pinout: [
      '1 EN1,2 : enable outputs 1 and 2 (PWM it for speed)',
      '2, 7 : 1A, 2A inputs',
      '3, 6 : 1Y, 2Y outputs (motor 1)',
      '4, 5, 12, 13 : GND (heat sink)',
      '8 VCC2 : motor supply (4.5–36 V)',
      '9 EN3,4 · 10, 15 : 3A, 4A · 11, 14 : 3Y, 4Y',
      '16 VCC1 : logic supply, 5 V',
    ],
    specs: [
      ['Output current', '600 mA per channel (1.2 A peak)'],
      ['Voltage drop', '≈1.4 V high side + ≈1.2 V low side at 0.5 A'],
      ['Inputs', 'TTL: high above 2.3 V'],
    ],
    how: 'An H-bridge puts the motor between two half-bridges. 1A high and 2A low make 1Y = VCC2 and 2Y = 0 V, so current flows one way; swap the inputs and it flows the other way. Both inputs equal brakes the motor; enable low lets it coast. The built-in diodes catch the motor’s back-EMF spikes.',
    typical: ['Robot car (two DC motors)', 'Bipolar stepper motor', 'Fan or pump direction control'],
  },
};

const ULN_PINS = ['IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'GND', 'COM', 'OUT7', 'OUT6', 'OUT5', 'OUT4', 'OUT3', 'OUT2', 'OUT1'];
const uln2003: PartDef = {
  type: 'uln2003',
  name: 'ULN2003 Darlington driver',
  category: 'Drivers & modules',
  prefix: 'U',
  pins: dip(ULN_PINS),
  box: dipBox(16),
  dip: true,
  defaults: {},
  props: [],
  keywords: 'darlington array relay stepper driver sink',
  expand(_p, ctx) {
    const pin = (nm: string) => ctx.pin(ULN_PINS.indexOf(nm));
    const out: ElementSpec[] = [el(ctx, '', 'uln', ULN_PINS.map((_, i) => ctx.pin(i)), { ron: 4 })];
    for (let k = 1; k <= 7; k++) out.push(el(ctx, `d${k}`, 'D', [pin(`OUT${k}`), pin('COM')], { ...DIODE_1N4001, maxI: 0 }));
    return out;
  },
  info: {
    summary: 'Seven Darlington transistor switches in one chip, each sinking up to 500 mA, with flyback diodes.',
    pinout: ['1–7 : IN1–IN7 (logic inputs)', '8 : GND', '9 : COM (to the load supply: clamps inductive spikes)', '16–10 : OUT1–OUT7 (pull loads to ground)'],
    specs: [
      ['Output', '500 mA per channel, 50 V'],
      ['Input', 'on above ≈1.4 V (5 V logic friendly)'],
      ['Saturation', '≈1 V at 250 mA'],
    ],
    how: 'Each channel is a Darlington pair: a small input current switches a large load current to ground. The load sits between the supply and an output; COM connects to that supply so the built-in diodes can absorb the voltage spike when a coil (relay, stepper) switches off.',
    typical: ['28BYJ-48 stepper driver', 'Relays and solenoids from Arduino pins', 'LED strings'],
  },
};

// ------------------------------------------------------------------ sensor modules (header pins, wired with jumpers)

const pir: PartDef = {
  type: 'pir',
  name: 'PIR motion sensor (HC-SR501)',
  category: 'Switches & sensors',
  prefix: 'PIR',
  pins: row(['VCC', 'OUT', 'GND']),
  box: { x: -1.6, y: -5.2, w: 5.2, h: 5.5 },
  offBoard: true,
  defaults: { motion: false, hold: 3 },
  props: [
    { key: 'motion', label: 'Someone moving', kind: 'bool', live: true },
    { key: 'hold', label: 'Hold time', kind: 'slider', unit: 's', min: 0.5, max: 10, step: 0.5 },
  ],
  keywords: 'motion infrared presence detector alarm',
  expand: (p, ctx) => [el(ctx, '', 'dout', [ctx.pin(0), ctx.pin(1), ctx.pin(2)], { active: b(p.props.motion, false), hold: n(p.props.hold, 3), rq: 50000, rout: 100 })],
  value: (p) => (b(p.motion, false) ? 'motion' : 'still'),
  info: {
    summary: 'Detects people moving by the change in infrared (body heat) they cause. Output goes HIGH (3.3 V logic) for a set time.',
    pinout: ['VCC : 5–20 V', 'OUT : HIGH while motion is detected (plus the hold time)', 'GND'],
    specs: [
      ['Range', 'up to ≈7 m, 110° cone'],
      ['Hold time', '≈3 s – 5 min (pot on the board)'],
      ['Current', '≈65 µA idle'],
    ],
    how: 'A pyroelectric sensor behind a Fresnel lens sees two halves of the room. A warm body moving from one half to the other changes their difference, and the module’s comparator raises OUT. A timer keeps OUT high for the hold time after the last movement. Toggle "Someone moving" to simulate a person.',
    typical: ['Automatic light', 'Intruder alarm with a buzzer', 'Arduino wake-up input'],
  },
};

const irsensor: PartDef = {
  type: 'irobstacle',
  name: 'IR obstacle sensor',
  category: 'Switches & sensors',
  prefix: 'IR',
  pins: row(['OUT', 'GND', 'VCC']),
  box: { x: -0.8, y: -6, w: 3.6, h: 6.3 },
  offBoard: true,
  defaults: { dist: 25, range: 10 },
  props: [
    { key: 'dist', label: 'Object distance', kind: 'slider', unit: 'cm', min: 1, max: 40, step: 0.5, live: true },
    { key: 'range', label: 'Trigger distance (pot)', kind: 'slider', unit: 'cm', min: 2, max: 30, step: 1 },
  ],
  keywords: 'infrared proximity line follower obstacle avoidance',
  expand: (p, ctx) => [
    el(ctx, '', 'dout', [ctx.pin(2), ctx.pin(0), ctx.pin(1)], { active: n(p.props.dist, 25) <= n(p.props.range, 10), activeLow: true, rq: 250, rout: 100 }),
  ],
  value: (p) => `${n(p.dist, 25)} cm`,
  info: {
    summary: 'An IR LED and a photodiode side by side: when something reflects enough light back, OUT goes LOW and the green LED lights.',
    pinout: ['OUT : LOW = obstacle', 'GND', 'VCC : 3.3–5 V'],
    specs: [
      ['Range', '2–30 cm (adjust with the pot)'],
      ['Output', 'digital, active LOW'],
      ['Current', '≈20 mA'],
    ],
    how: 'The reflected infrared light makes the photodiode conduct; an LM393 comparator compares its voltage with the pot setting and pulls OUT low when the object is close enough. Dark or shiny surfaces reflect differently, so real modules need adjusting.',
    typical: ['Obstacle-avoiding robot', 'Object counter', 'Line follower (pointed at the floor)'],
  },
};

const hall: PartDef = {
  type: 'hall',
  name: 'Hall sensor (A3144)',
  category: 'Switches & sensors',
  prefix: 'H',
  pins: row(['VCC', 'GND', 'OUT']),
  box: { x: -0.5, y: -1.5, w: 3, h: 1.9 },
  defaults: { field: 0 },
  props: [{ key: 'field', label: 'Magnetic field', kind: 'slider', unit: 'G', min: 0, max: 500, step: 5, live: true }],
  keywords: 'magnet magnetic switch hall effect',
  expand: (p, ctx) => [el(ctx, '', 'dout', [ctx.pin(0), ctx.pin(2), ctx.pin(1)], { active: n(p.props.field, 0) >= 150, oc: true, activeLow: true, rq: 1500, rout: 20 })],
  value: (p) => `${n(p.field, 0)} G`,
  info: {
    summary: 'Digital magnetic switch: an open-collector output that pulls LOW when a magnet’s south pole comes close. Needs a pull-up resistor.',
    pinout: ['VCC : 4.5–24 V', 'GND', 'OUT : open collector (add 10 kΩ to VCC)'],
    specs: [
      ['Operate point', '≈150 gauss (a small magnet within ≈1 cm)'],
      ['Output', 'sinks up to 25 mA'],
    ],
    how: 'A magnetic field across a thin conductor pushes the moving charges to one side (the Hall effect), giving a tiny voltage. The chip amplifies it and switches its output transistor on above the operate point. Open collector means it can only pull down: the pull-up resistor makes the HIGH level.',
    typical: ['Wheel speed / RPM sensor', 'Door-closed detector', 'Brushless motor commutation'],
  },
};

const tilt: PartDef = {
  type: 'tilt',
  name: 'Tilt switch (ball)',
  category: 'Switches & sensors',
  prefix: 'S',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 2, dy: 0 },
  ],
  box: { x: 0.2, y: -2.4, w: 1.6, h: 2.7 },
  defaults: { tilted: false },
  props: [{ key: 'tilted', label: 'Tilted', kind: 'bool', live: true }],
  keywords: 'ball switch orientation vibration',
  expand: (p, ctx) => [el(ctx, '', 'sw', [ctx.pin(0), ctx.pin(1)], { closed: !b(p.props.tilted, false), ron: 1, roff: 1e9, maxI: 1 })],
  value: (p) => (b(p.tilted, false) ? 'tilted' : 'upright'),
  info: {
    summary: 'A metal ball in a can: upright, it rests on both contacts (closed); tilted, it rolls away (open).',
    pinout: ['Either lead'],
    specs: [['Contact', 'closed when upright, ≈1 Ω']],
    how: 'Gravity does the switching. Use it like a push button with a pull-up or pull-down resistor; it also chatters when shaken, so it doubles as a vibration sensor.',
    typical: ['Tip-over alarm', 'Toy that reacts to being shaken'],
  },
};

const reed: PartDef = {
  type: 'reed',
  name: 'Reed switch',
  category: 'Switches & sensors',
  prefix: 'S',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 4, dy: 0 },
  ],
  box: { x: 0.4, y: -0.5, w: 3.2, h: 1 },
  defaults: { gap: 30 },
  props: [{ key: 'gap', label: 'Magnet distance', kind: 'slider', unit: 'mm', min: 0, max: 40, step: 1, live: true }],
  keywords: 'magnet door window switch',
  expand: (p, ctx) => [el(ctx, '', 'sw', [ctx.pin(0), ctx.pin(1)], { closed: n(p.props.gap, 30) <= 10, ron: 0.1, roff: 1e10, maxI: 0.5 })],
  value: (p) => `${n(p.gap, 30)} mm`,
  info: {
    summary: 'Two springy iron contacts sealed in glass. A nearby magnet pulls them together and closes the circuit.',
    pinout: ['Either lead'],
    specs: [
      ['Closes', 'magnet within ≈10 mm'],
      ['Rating', '0.5 A, 100 V'],
    ],
    how: 'The magnet magnetises both reeds with opposite poles at their tips, so they attract and touch. No power is needed and the contacts are sealed from dust, which is why reed switches guard doors and windows.',
    typical: ['Door / window alarm', 'Bicycle speedometer', 'Float level switch'],
  },
};

const flex: PartDef = {
  type: 'flex',
  name: 'Flex sensor',
  category: 'Switches & sensors',
  prefix: 'FX',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 1, dy: 0 },
  ],
  box: { x: -0.4, y: -7.2, w: 1.8, h: 7.5 },
  defaults: { bend: 0 },
  props: [{ key: 'bend', label: 'Bend', kind: 'slider', unit: '°', min: 0, max: 90, step: 1, live: true }],
  keywords: 'bend resistance glove',
  expand: (p, ctx) => [el(ctx, '', 'R', [ctx.pin(0), ctx.pin(1)], { r: 25000 + (75000 * n(p.props.bend, 0)) / 90, maxP: 0.5 })],
  value: (p) => `${n(p.bend, 0)}°`,
  info: {
    summary: 'A strip whose resistance rises as it bends: ≈25 kΩ flat, ≈100 kΩ at 90°.',
    pinout: ['Either lead'],
    specs: [['Resistance', '25 kΩ flat → 100 kΩ bent']],
    how: 'Carbon ink on the strip cracks apart microscopically when bent, so fewer conduction paths remain. In a divider with a 47 kΩ resistor the output voltage tracks the bend angle.',
    typical: ['Data glove', 'Robot finger feedback', 'Door-open sensor'],
  },
};

const fsr: PartDef = {
  type: 'fsr',
  name: 'Force sensor (FSR)',
  category: 'Switches & sensors',
  prefix: 'FS',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 1, dy: 0 },
  ],
  box: { x: -0.6, y: -4.6, w: 2.2, h: 4.9 },
  defaults: { force: 0 },
  props: [{ key: 'force', label: 'Force', kind: 'slider', unit: 'g', min: 0, max: 2000, step: 10, live: true }],
  keywords: 'pressure touch weight press',
  expand(p, ctx) {
    const g = n(p.props.force, 0);
    const r = g < 20 ? 1e7 : Math.max(200, 1.5e5 * Math.pow(g / 20, -0.9));
    return [el(ctx, '', 'R', [ctx.pin(0), ctx.pin(1)], { r, maxP: 0.5 })];
  },
  value: (p) => `${n(p.force, 0)} g`,
  info: {
    summary: 'A resistance that falls as you press it: open circuit at rest, a few kΩ under a firm press.',
    pinout: ['Either lead'],
    specs: [
      ['At rest', '> 10 MΩ'],
      ['Range', '≈20 g – 2 kg (≈150 kΩ → ≈250 Ω)'],
    ],
    how: 'Pressing pushes conductive particles in a polymer film closer together. The response is roughly R ∝ 1/F, good for "how hard" rather than precise weighing. Read it with a 10 kΩ pull-down and an analog input.',
    typical: ['Musical drum pad', 'Seat occupancy', 'Grip strength'],
  },
};

const analogModule = (o: {
  type: string;
  name: string;
  prefix: string;
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  def: number;
  frac: (v: number) => number;
  rq: number;
  keywords: string;
  info: PartDef['info'];
  value: (v: number) => string;
}): PartDef => ({
  type: o.type,
  name: o.name,
  category: 'Switches & sensors',
  prefix: o.prefix,
  pins: row(['VCC', 'GND', 'AO']),
  box: { x: -1.2, y: -5.6, w: 4.4, h: 5.9 },
  offBoard: true,
  defaults: { [o.key]: o.def },
  props: [{ key: o.key, label: o.label, kind: 'slider', unit: o.unit, min: o.min, max: o.max, step: o.step, live: true }],
  keywords: o.keywords,
  expand: (p: { props: Props }, ctx: ExpandCtx) => [
    el(ctx, 'q', 'R', [ctx.pin(0), ctx.pin(1)], { r: o.rq, maxP: 0 }),
    ...divider(ctx, ctx.pin(0), ctx.pin(2), ctx.pin(1), o.frac(n(p.props[o.key], o.def))),
  ],
  value: (p: Props) => o.value(n(p[o.key], o.def)),
  info: o.info,
});

const soil = analogModule({
  type: 'soil',
  name: 'Soil moisture sensor',
  prefix: 'SM',
  key: 'moisture',
  label: 'Soil moisture',
  unit: '%',
  min: 0,
  max: 100,
  step: 1,
  def: 30,
  // dry soil conducts poorly: the module's output is high when dry
  frac: (m) => 0.92 - 0.72 * (m / 100),
  rq: 1000,
  keywords: 'plant water humidity garden',
  value: (m) => `${m} %`,
  info: {
    summary: 'Two probes in the soil and a small board: AO is high when the soil is dry and falls as it gets wetter.',
    pinout: ['VCC : 3.3–5 V', 'GND', 'AO : analog output'],
    specs: [
      ['Output', '≈0.9·VCC dry → ≈0.2·VCC soaked'],
      ['Tip', 'power it only while reading, to slow probe corrosion'],
    ],
    how: 'Water with dissolved salts conducts. The probes form one half of a voltage divider; wetter soil means lower resistance and a lower AO voltage. Read it with an Arduino analog input and pick a threshold for "water me".',
    typical: ['Automatic plant watering', 'Garden monitor'],
  },
});

const gas = analogModule({
  type: 'gas',
  name: 'Gas sensor (MQ-2)',
  prefix: 'GS',
  key: 'ppm',
  label: 'Gas / smoke',
  unit: 'ppm',
  min: 100,
  max: 10000,
  step: 50,
  def: 300,
  frac: (ppm) => Math.min(0.95, 0.08 + 0.22 * Math.log10(Math.max(100, ppm) / 100)),
  rq: 33,
  keywords: 'smoke lpg methane butane alarm air quality',
  value: (v) => `${v} ppm`,
  info: {
    summary: 'A heated tin-oxide element whose resistance falls in smoke and flammable gases. AO rises with concentration.',
    pinout: ['VCC : 5 V (the heater draws ≈150 mA)', 'GND', 'AO : analog output'],
    specs: [
      ['Gases', 'LPG, propane, methane, hydrogen, smoke'],
      ['Range', '300 – 10 000 ppm'],
      ['Warm-up', 'about a minute in real life (not modelled)'],
    ],
    how: 'Oxygen adsorbed on hot tin dioxide traps electrons and makes it resistive. Reducing gases react with that oxygen and release the electrons, so the resistance drops roughly logarithmically with concentration. The heater is why it gets warm and needs a solid 5 V supply.',
    typical: ['Kitchen gas alarm with a buzzer', 'Air-quality logger'],
  },
});

const sound = analogModule({
  type: 'soundsensor',
  name: 'Sound sensor',
  prefix: 'MIC',
  key: 'level',
  label: 'Loudness',
  unit: 'dB',
  min: 30,
  max: 110,
  step: 1,
  def: 45,
  frac: (db) => Math.min(0.95, 0.5 + 0.45 * Math.max(0, (db - 40) / 70)),
  rq: 1250,
  keywords: 'microphone clap noise level audio',
  value: (v) => `${v} dB`,
  info: {
    summary: 'An electret microphone with an amplifier. AO sits near mid-supply in silence and rises with loudness (the simulation shows the envelope).',
    pinout: ['VCC : 3.3–5 V', 'GND', 'AO : analog output'],
    specs: [['Output', '≈VCC/2 quiet → near VCC loud']],
    how: 'Sound pressure moves the microphone’s charged diaphragm, giving a few millivolts that the module amplifies. The real output is an audio waveform around VCC/2; here AO shows the loudness envelope so a threshold works directly.',
    typical: ['Clap switch', 'Noise-level meter'],
  },
});

const JOY_PINS = ['GND', '+5V', 'VRx', 'VRy', 'SW'];
const joystick: PartDef = {
  type: 'joystick',
  name: 'Joystick module',
  category: 'Switches & sensors',
  prefix: 'J',
  pins: row(JOY_PINS),
  box: { x: -0.8, y: -6.4, w: 5.6, h: 6.7 },
  offBoard: true,
  defaults: { x: 0, y: 0, pressed: false },
  props: [
    { key: 'x', label: 'Stick X', kind: 'slider', min: -1, max: 1, step: 0.01, live: true },
    { key: 'y', label: 'Stick Y', kind: 'slider', min: -1, max: 1, step: 0.01, live: true },
    { key: 'pressed', label: 'Push button', kind: 'bool', live: true },
  ],
  keywords: 'thumbstick analog game controller xy',
  expand(p, ctx) {
    const pot = (axis: string, v: number, out: number) => {
      const f = Math.max(0.005, Math.min(0.995, (v + 1) / 2));
      return [el(ctx, `${axis}a`, 'R', [ctx.pin(1), out], { r: 10000 * (1 - f), maxP: 0 }), el(ctx, `${axis}b`, 'R', [out, ctx.pin(0)], { r: 10000 * f, maxP: 0 })];
    };
    return [
      ...pot('x', n(p.props.x, 0), ctx.pin(2)),
      ...pot('y', n(p.props.y, 0), ctx.pin(3)),
      el(ctx, 'sw', 'sw', [ctx.pin(4), ctx.pin(0)], { closed: b(p.props.pressed, false), ron: 1, maxI: 0.5 }),
    ];
  },
  value: (p) => `x ${n(p.x, 0).toFixed(1)} y ${n(p.y, 0).toFixed(1)}`,
  info: {
    summary: 'Two 10 kΩ potentiometers (X and Y) and a push button under one thumbstick.',
    pinout: ['GND', '+5V', 'VRx : X position (≈2.5 V centred)', 'VRy : Y position', 'SW : button to GND when pressed (use a pull-up)'],
    specs: [
      ['Pots', '10 kΩ each'],
      ['Centre', '≈VCC/2 on both axes'],
    ],
    how: 'Each axis is a voltage divider whose wiper follows the stick. Read VRx and VRy with two analog inputs (≈512 at rest on an Arduino) and SW with a digital input and INPUT_PULLUP.',
    typical: ['Pan-tilt servo control', 'Game controller', 'Robot remote'],
  },
};

const SONAR_PINS = ['VCC', 'TRIG', 'ECHO', 'GND'];
const sonar: PartDef = {
  type: 'hcsr04',
  name: 'Ultrasonic sensor (HC-SR04)',
  category: 'Switches & sensors',
  prefix: 'US',
  pins: row(SONAR_PINS),
  box: { x: -3.4, y: -5.2, w: 9.8, h: 5.5 },
  offBoard: true,
  defaults: { dist: 50 },
  props: [{ key: 'dist', label: 'Object distance', kind: 'slider', unit: 'cm', min: 2, max: 450, step: 1, live: true }],
  keywords: 'distance range sonar echo parking',
  expand: (p, ctx) => [el(ctx, '', 'sonar', SONAR_PINS.map((_, i) => ctx.pin(i)), { dist: n(p.props.dist, 50) })],
  value: (p) => `${n(p.dist, 50)} cm`,
  info: {
    summary: 'Measures distance with sound: a 10 µs pulse on TRIG fires a 40 kHz ping, and ECHO stays HIGH for the round-trip time.',
    pinout: ['VCC : 5 V', 'TRIG : start a measurement (≥10 µs HIGH)', 'ECHO : HIGH for the echo time', 'GND'],
    specs: [
      ['Range', '2 cm – 4 m'],
      ['Conversion', 'distance (cm) = echo time (µs) / 58'],
      ['Timeout', '38 ms pulse when nothing is in range'],
    ],
    how: 'Sound travels about 343 m/s, so it covers 1 cm and back in 58 µs. The module sends eight cycles of 40 kHz from one transducer, listens with the other and holds ECHO high from the burst to the returning echo. Arduino code times that pulse with pulseIn(echoPin, HIGH).',
    typical: ['Parking sensor with LEDs / buzzer', 'Obstacle-avoiding robot', 'Water tank level'],
  },
};

export const MODULE_PARTS: PartDef[] = [piezo, lcd, stepper, l293d, uln2003, sonar, pir, irsensor, hall, joystick, soil, gas, sound, tilt, reed, flex, fsr];

/** Capacity choices for a battery that runs down (small values make the effect visible quickly). */
export const BATTERY_CAPACITIES = [0.5, 5, 50, 500, 2500];
export const capacityLabel = (mah: number) => (mah < 1 ? `${formatEng(mah * 1e-3, 'Ah')} (demo)` : `${mah} mAh`);
