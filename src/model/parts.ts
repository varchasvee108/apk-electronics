import { UNO_PINS } from '@sim/avr/arduino';
import { CHIPS } from '@sim/digital/chips';
import {
  DIODE_1N4001,
  DIODE_1N4148,
  LED_COLORS,
  LM324,
  LM358,
  LM741,
  NMOS_2N7000,
  NPN_2N3904,
  OPAMP_IDEALISH,
  PHOTODIODE,
  PMOS_BS250,
  PNP_2N3906,
  SCHOTTKY_1N5817,
  led,
  zener,
  type LedColor,
} from '@sim/models';
import type { ElementSpec, Params } from '@sim/types';
import { formatEng } from '@sim/units';
import type { PartInstance, Props } from './types';

export type Category =
  | 'Sources'
  | 'Passives'
  | 'Semiconductors'
  | 'Analog ICs'
  | 'Digital ICs'
  | 'Switches & sensors'
  | 'Output'
  | 'Microcontroller';

export const CATEGORIES: Category[] = [
  'Sources',
  'Passives',
  'Semiconductors',
  'Analog ICs',
  'Digital ICs',
  'Switches & sensors',
  'Output',
  'Microcontroller',
];

export interface PinDef {
  name: string;
  dx: number;
  dy: number;
}

export interface PropSpec {
  key: string;
  label: string;
  kind: 'value' | 'enum' | 'bool' | 'slider';
  unit?: string;
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** Interactive control shown prominently while running (switch, knob, light level…). */
  live?: boolean;
}

export interface ExpandCtx {
  id: string;
  pin(k: number): number;
  internal(name: string): number;
}

export interface DatasheetInfo {
  summary: string;
  pinout: string[];
  specs: [string, string][];
  how: string;
  typical: string[];
}

export interface PartDef {
  type: string;
  name: string;
  category: Category;
  prefix: string;
  pins: PinDef[];
  /** Body box relative to the origin (rot 0), grid units. */
  box: { x: number; y: number; w: number; h: number };
  defaults: Props;
  props: PropSpec[];
  /** Placed off the breadboard by default. */
  offBoard?: boolean;
  /** DIP package that straddles the centre channel. */
  dip?: boolean;
  expand(p: PartInstance, ctx: ExpandCtx): ElementSpec[];
  value?(props: Props): string;
  info: DatasheetInfo;
  keywords?: string;
}

const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function el(ctx: ExpandCtx, suffix: string, type: string, nodes: number[], params: Params): ElementSpec {
  return { id: suffix ? `${ctx.id}.${suffix}` : ctx.id, type, nodes, params, partId: ctx.id };
}

/** DIP pin layout: pin 1 bottom-left (dy = 3), counting anticlockwise; pin n top-left (dy = 0). */
function dipPins(names: string[]): PinDef[] {
  const half = names.length / 2;
  return names.map((name, i) => (i < half ? { name, dx: i, dy: 3 } : { name, dx: names.length - 1 - i, dy: 0 }));
}
function dipBox(count: number) {
  return { x: -0.45, y: 0.55, w: count / 2 - 1 + 0.9, h: 1.9 };
}
const VALUE_STEP = { kind: 'value' as const };

const OPTIONS_LED = (Object.keys(LED_COLORS) as LedColor[]).map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));

// --------------------------------------------------------------------------------------------- sources

const battery: PartDef = {
  type: 'battery',
  name: 'Battery',
  category: 'Sources',
  prefix: 'B',
  pins: [
    { name: '+', dx: 0, dy: 0 },
    { name: '−', dx: 3, dy: 0 },
  ],
  box: { x: -0.8, y: 0.6, w: 4.6, h: 6.4 },
  defaults: { v: 9 },
  offBoard: true,
  props: [
    {
      key: 'v',
      label: 'Voltage',
      kind: 'enum',
      unit: 'V',
      options: [1.5, 3, 4.5, 6, 9, 12].map((v) => ({ value: v, label: `${v} V` })),
    },
  ],
  expand(p, ctx) {
    const v = n(p.props.v, 9);
    const r = v === 9 ? 1.7 : v === 12 ? 0.6 : 0.15 * (v / 1.5);
    return [el(ctx, '', 'V', [ctx.pin(0), ctx.pin(1)], { v, r, maxI: v === 9 ? 0.5 : 2 })];
  },
  value: (p) => `${n(p.v, 9)} V`,
  info: {
    summary: 'A chemical cell (or pack of cells) that supplies a nearly constant DC voltage.',
    pinout: ['+ : positive terminal', '− : negative terminal'],
    specs: [
      ['Voltages', '1.5 V per alkaline cell; 9 V block'],
      ['Internal resistance', '≈0.15 Ω per AA cell, ≈1.7 Ω for a 9 V block'],
      ['Capacity', 'AA ≈ 2500 mAh, 9 V ≈ 500 mAh'],
    ],
    how: 'A battery converts chemical energy to electrical energy. Its internal resistance makes the terminal voltage sag when you draw current: V = EMF − I·r. A short circuit is limited only by that internal resistance, which is why shorted batteries get hot.',
    typical: ['LED with a current-limiting resistor', 'Powering a 555 blinker', 'Voltage divider demo'],
  },
};

const supply: PartDef = {
  type: 'supply',
  name: 'DC bench supply',
  category: 'Sources',
  prefix: 'PS',
  pins: [
    { name: '+', dx: 0, dy: 0 },
    { name: '−', dx: 4, dy: 0 },
  ],
  box: { x: -1.2, y: 0.6, w: 6.4, h: 5.4 },
  defaults: { vset: 5, ilim: 0.5, on: true },
  offBoard: true,
  props: [
    { key: 'vset', label: 'Voltage', kind: 'slider', unit: 'V', min: 0, max: 30, step: 0.1, live: true },
    { key: 'ilim', label: 'Current limit', kind: 'slider', unit: 'A', min: 0.01, max: 3, step: 0.01, live: true },
    { key: 'on', label: 'Output on', kind: 'bool', live: true },
  ],
  expand(p, ctx) {
    return [el(ctx, '', 'supply', [ctx.pin(0), ctx.pin(1)], { vset: n(p.props.vset, 5), ilim: n(p.props.ilim, 0.5), on: b(p.props.on, true) })];
  },
  value: (p) => `${formatEng(n(p.vset, 5), 'V')} / ${formatEng(n(p.ilim, 0.5), 'A')}`,
  info: {
    summary: 'Adjustable lab power supply with a current limit (constant voltage / constant current).',
    pinout: ['+ : positive output', '− : negative output (connect to ground)'],
    specs: [
      ['Voltage', '0–30 V'],
      ['Current limit', '10 mA – 3 A'],
      ['Modes', 'CV (holds voltage) or CC (holds current)'],
    ],
    how: 'In constant-voltage (CV) mode the supply holds its set voltage. If the load tries to draw more than the current limit, the supply switches to constant-current (CC) mode and lowers its voltage until the current equals the limit. This protects your circuit and is the first thing to set when testing something new.',
    typical: ['Testing an LED with no resistor safely (set 20 mA limit)', 'Powering logic at 5 V'],
  },
};

const funcgen: PartDef = {
  type: 'funcgen',
  name: 'Function generator',
  category: 'Sources',
  prefix: 'FG',
  pins: [
    { name: 'OUT', dx: 0, dy: 0 },
    { name: 'COM', dx: 3, dy: 0 },
  ],
  box: { x: -1.2, y: 0.6, w: 5.4, h: 5.4 },
  defaults: { wave: 'sine', freq: 1000, amp: 1, offset: 0, duty: 0.5, on: true },
  offBoard: true,
  props: [
    {
      key: 'wave',
      label: 'Waveform',
      kind: 'enum',
      options: [
        { value: 'sine', label: 'Sine' },
        { value: 'square', label: 'Square' },
        { value: 'triangle', label: 'Triangle' },
        { value: 'sawtooth', label: 'Sawtooth' },
        { value: 'pulse', label: 'Pulse (0 to +A)' },
      ],
      live: true,
    },
    { key: 'freq', label: 'Frequency', unit: 'Hz', ...VALUE_STEP, live: true },
    { key: 'amp', label: 'Amplitude (peak)', unit: 'V', ...VALUE_STEP, live: true },
    { key: 'offset', label: 'DC offset', unit: 'V', ...VALUE_STEP, live: true },
    { key: 'duty', label: 'Duty cycle', kind: 'slider', min: 0.05, max: 0.95, step: 0.01, live: true },
    { key: 'on', label: 'Output on', kind: 'bool', live: true },
  ],
  expand(p, ctx) {
    const on = b(p.props.on, true);
    return [
      el(ctx, '', 'V', [ctx.pin(0), ctx.pin(1)], {
        wave: on ? s(p.props.wave, 'sine') : 'dc',
        v: 0,
        amp: n(p.props.amp, 1),
        freq: n(p.props.freq, 1000),
        offset: n(p.props.offset, 0),
        duty: n(p.props.duty, 0.5),
        r: 50,
        acmag: 1,
      }),
    ];
  },
  value: (p) => `${s(p.wave, 'sine')} ${formatEng(n(p.freq, 1000), 'Hz')} ${formatEng(n(p.amp, 1), 'Vp')}`,
  info: {
    summary: 'Signal source producing sine, square, triangle, sawtooth or pulse waves with 50 Ω output impedance.',
    pinout: ['OUT : signal output', 'COM : signal common (connect to ground)'],
    specs: [
      ['Frequency', '0.01 Hz – 10 MHz'],
      ['Amplitude', 'peak volts, plus DC offset'],
      ['Output impedance', '50 Ω'],
    ],
    how: 'A function generator lets you test how circuits respond to changing signals. It is also the input for AC sweeps (Bode plots): Bench drives it with 1 V at each frequency and measures the response.',
    typical: ['RC low-pass filter', 'Op-amp amplifier test', 'Clock for a counter chip'],
  },
};

const acsource: PartDef = {
  type: 'acsource',
  name: 'AC source',
  category: 'Sources',
  prefix: 'AC',
  pins: [
    { name: 'L', dx: 0, dy: 0 },
    { name: 'N', dx: 3, dy: 0 },
  ],
  box: { x: -0.9, y: 0.6, w: 4.8, h: 4.6 },
  defaults: { amp: 12, freq: 50 },
  offBoard: true,
  props: [
    { key: 'amp', label: 'Peak voltage', unit: 'V', ...VALUE_STEP, live: true },
    { key: 'freq', label: 'Frequency', unit: 'Hz', ...VALUE_STEP, live: true },
  ],
  expand(p, ctx) {
    return [el(ctx, '', 'V', [ctx.pin(0), ctx.pin(1)], { wave: 'sine', v: 0, amp: n(p.props.amp, 12), freq: n(p.props.freq, 50), r: 0.5, acmag: 1 })];
  },
  value: (p) => `${formatEng(n(p.amp, 12), 'Vp')} ${formatEng(n(p.freq, 50), 'Hz')}`,
  info: {
    summary: 'Sinusoidal low-voltage AC supply (like the secondary of a mains transformer).',
    pinout: ['L : live', 'N : neutral'],
    specs: [
      ['Typical', '12 V peak, 50/60 Hz'],
      ['RMS', 'Vrms = Vpeak / √2'],
    ],
    how: 'Alternating current reverses direction every half cycle. Rectifiers (diodes) turn it into pulsing DC; a filter capacitor smooths it.',
    typical: ['Half-wave rectifier', 'Bridge rectifier with filter capacitor'],
  },
};

const ground: PartDef = {
  type: 'ground',
  name: 'Ground',
  category: 'Sources',
  prefix: 'GND',
  pins: [{ name: 'GND', dx: 0, dy: 0 }],
  box: { x: -0.8, y: 0.2, w: 1.6, h: 1.4 },
  defaults: {},
  props: [],
  expand: () => [],
  info: {
    summary: 'The 0 V reference point that every voltage is measured against.',
    pinout: ['GND : reference node'],
    specs: [['Voltage', '0 V by definition']],
    how: 'Voltage is always a difference between two points. Ground is the point we agree to call 0 V; the multimeter and scope measure relative to it. Every circuit needs one ground reference.',
    typical: ['Connect the − of your supply to ground'],
  },
};

// --------------------------------------------------------------------------------------------- passives

const resistor: PartDef = {
  type: 'resistor',
  name: 'Resistor',
  category: 'Passives',
  prefix: 'R',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 4, dy: 0 },
  ],
  box: { x: 0.6, y: -0.45, w: 2.8, h: 0.9 },
  defaults: { r: 1000, maxP: 0.25 },
  props: [
    { key: 'r', label: 'Resistance', unit: 'Ω', ...VALUE_STEP },
    {
      key: 'maxP',
      label: 'Power rating',
      kind: 'enum',
      options: [0.125, 0.25, 0.5, 1, 2].map((v) => ({ value: v, label: `${v} W` })),
    },
  ],
  expand: (p, ctx) => [el(ctx, '', 'R', [ctx.pin(0), ctx.pin(1)], { r: n(p.props.r, 1000), maxP: n(p.props.maxP, 0.25) })],
  value: (p) => formatEng(n(p.r, 1000), 'Ω'),
  info: {
    summary: 'Opposes current. The voltage across it is proportional to the current through it (Ohm’s law).',
    pinout: ['Either lead (not polarised)'],
    specs: [
      ['Law', 'V = I · R'],
      ['Power', 'P = I²R = V²/R'],
      ['Tolerance', '±5 % (gold band), ±1 % (brown)'],
      ['Rating', '¼ W typical'],
    ],
    how: 'The coloured bands encode the value: two (or three) digits, then a multiplier, then tolerance. Exceeding the power rating makes the resistor overheat; in Bench it smokes and fails open.',
    typical: ['LED current limiting: R = (Vs − Vf)/I', 'Voltage divider', 'Pull-up / pull-down on logic inputs'],
  },
  keywords: 'ohm colour code',
};

const pot: PartDef = {
  type: 'pot',
  name: 'Potentiometer',
  category: 'Passives',
  prefix: 'RV',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: 'W', dx: 1, dy: 0 },
    { name: '3', dx: 2, dy: 0 },
  ],
  box: { x: -0.5, y: -2.4, w: 3, h: 2.9 },
  defaults: { r: 10000, pos: 0.5 },
  props: [
    { key: 'r', label: 'Total resistance', unit: 'Ω', ...VALUE_STEP },
    { key: 'pos', label: 'Wiper position', kind: 'slider', min: 0, max: 1, step: 0.01, live: true },
  ],
  expand(p, ctx) {
    const r = n(p.props.r, 10000);
    const pos = Math.min(1, Math.max(0, n(p.props.pos, 0.5)));
    return [
      el(ctx, 'a', 'R', [ctx.pin(0), ctx.pin(1)], { r: Math.max(r * pos, 0.5), maxP: 0.25 }),
      el(ctx, 'b', 'R', [ctx.pin(1), ctx.pin(2)], { r: Math.max(r * (1 - pos), 0.5), maxP: 0.25 }),
    ];
  },
  value: (p) => `${formatEng(n(p.r, 10000), 'Ω')} @ ${Math.round(n(p.pos, 0.5) * 100)}%`,
  info: {
    summary: 'A resistor with a sliding contact (wiper): an adjustable voltage divider.',
    pinout: ['1 : one end of the track', 'W : wiper', '3 : other end'],
    specs: [
      ['Track', '10 kΩ typical'],
      ['Wiper voltage', 'Vw = Vin · position (unloaded)'],
    ],
    how: 'Turning the knob moves the wiper along a resistive track, splitting it into two resistors whose sum is constant. With the ends on 5 V and GND the wiper gives any voltage in between.',
    typical: ['Volume / brightness control', 'Analog input to an Arduino (analogRead)', 'Adjustable reference'],
  },
};

const potsensor: PartDef = {
  ...pot,
  type: 'potsensor',
  name: 'Position sensor (pot)',
  category: 'Switches & sensors',
  prefix: 'POS',
  defaults: { r: 10000, pos: 0.25 },
  props: [
    { key: 'r', label: 'Track resistance', unit: 'Ω', ...VALUE_STEP },
    { key: 'pos', label: 'Angle (0–270°)', kind: 'slider', min: 0, max: 1, step: 0.005, live: true },
  ],
  value: (p) => `${Math.round(n(p.pos, 0.25) * 270)}°`,
  info: {
    ...pot.info,
    summary: 'A potentiometer used to sense the angle of a shaft (joysticks, servo feedback, knobs).',
    how: 'The wiper voltage is proportional to shaft angle. Read it with an ADC: angle = 270° · Vw / Vref.',
  },
};

const cap: PartDef = {
  type: 'cap',
  name: 'Ceramic capacitor',
  category: 'Passives',
  prefix: 'C',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 2, dy: 0 },
  ],
  box: { x: 0.25, y: -0.8, w: 1.5, h: 1.0 },
  defaults: { c: 100e-9, vmax: 50 },
  props: [
    { key: 'c', label: 'Capacitance', unit: 'F', ...VALUE_STEP },
    { key: 'vmax', label: 'Voltage rating', unit: 'V', ...VALUE_STEP },
  ],
  expand: (p, ctx) => [el(ctx, '', 'C', [ctx.pin(0), ctx.pin(1)], { c: n(p.props.c, 100e-9), vmax: n(p.props.vmax, 50) })],
  value: (p) => formatEng(n(p.c, 100e-9), 'F'),
  info: {
    summary: 'Stores charge between two plates. Blocks DC, passes AC; not polarised.',
    pinout: ['Either lead'],
    specs: [
      ['Law', 'Q = C·V, I = C·dV/dt'],
      ['Code', '104 = 10·10⁴ pF = 100 nF'],
      ['Reactance', 'Xc = 1/(2πfC)'],
    ],
    how: 'Current only flows while the voltage across a capacitor is changing. Through a resistor it charges with time constant τ = RC: 63 % after one τ, about 99 % after 5τ.',
    typical: ['Decoupling (100 nF next to every chip)', 'RC timing', 'Low-pass / high-pass filters'],
  },
};

const ecap: PartDef = {
  type: 'ecap',
  name: 'Electrolytic capacitor',
  category: 'Passives',
  prefix: 'C',
  pins: [
    { name: '+', dx: 0, dy: 0 },
    { name: '−', dx: 2, dy: 0 },
  ],
  box: { x: -0.2, y: -1.2, w: 2.4, h: 2.4 },
  defaults: { c: 100e-6, vmax: 25 },
  props: [
    { key: 'c', label: 'Capacitance', unit: 'F', ...VALUE_STEP },
    {
      key: 'vmax',
      label: 'Voltage rating',
      kind: 'enum',
      options: [6.3, 10, 16, 25, 35, 50, 63].map((v) => ({ value: v, label: `${v} V` })),
    },
  ],
  expand: (p, ctx) => [
    el(ctx, '', 'C', [ctx.pin(0), ctx.pin(1)], { c: n(p.props.c, 100e-6), vmax: n(p.props.vmax, 25), polarized: true }),
  ],
  value: (p) => `${formatEng(n(p.c, 100e-6), 'F')} ${n(p.vmax, 25)}V`,
  info: {
    summary: 'High-value polarised capacitor. The stripe marks the negative lead.',
    pinout: ['+ : longer lead', '− : stripe side, shorter lead'],
    specs: [
      ['Values', '1 µF – 10 000 µF'],
      ['Reverse voltage', 'max ≈ 1 V; more damages it'],
      ['Leakage', 'higher than ceramics'],
    ],
    how: 'An electrolytic uses a very thin oxide layer as the dielectric, giving large capacitance in a small can. Reverse voltage destroys the oxide; in Bench a reversed electrolytic bulges and fails.',
    typical: ['Power-supply filter (rectifier smoothing)', 'Slow 555 timing', 'Audio coupling'],
  },
};

const inductor: PartDef = {
  type: 'inductor',
  name: 'Inductor',
  category: 'Passives',
  prefix: 'L',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 4, dy: 0 },
  ],
  box: { x: 0.5, y: -0.6, w: 3, h: 1.2 },
  defaults: { l: 10e-3, rdc: 1 },
  props: [
    { key: 'l', label: 'Inductance', unit: 'H', ...VALUE_STEP },
    { key: 'rdc', label: 'Winding resistance', unit: 'Ω', ...VALUE_STEP },
  ],
  expand(p, ctx) {
    const mid = ctx.internal('m');
    return [
      el(ctx, '', 'L', [ctx.pin(0), mid], { l: n(p.props.l, 10e-3) }),
      el(ctx, 'rdc', 'R', [mid, ctx.pin(1)], { r: Math.max(n(p.props.rdc, 1), 1e-3), maxP: 0 }),
    ];
  },
  value: (p) => formatEng(n(p.l, 10e-3), 'H'),
  info: {
    summary: 'A coil that stores energy in its magnetic field and opposes changes in current.',
    pinout: ['Either lead'],
    specs: [
      ['Law', 'V = L·dI/dt'],
      ['Reactance', 'XL = 2πfL'],
      ['Time constant', 'τ = L/R'],
    ],
    how: 'An inductor resists sudden changes in current. Interrupting its current produces a large voltage spike, which is why relay coils need a flyback diode. With a capacitor it forms a resonant circuit at f₀ = 1/(2π√LC).',
    typical: ['RL time constant', 'LC resonance / RLC damping', 'Switch-mode supplies'],
  },
};

const xfmr: PartDef = {
  type: 'xfmr',
  name: 'Transformer',
  category: 'Passives',
  prefix: 'T',
  pins: [
    { name: 'P1', dx: 0, dy: 0 },
    { name: 'P2', dx: 0, dy: 4 },
    { name: 'S1', dx: 5, dy: 0 },
    { name: 'S2', dx: 5, dy: 4 },
  ],
  box: { x: 0.6, y: -0.4, w: 3.8, h: 4.8 },
  defaults: { n: 0.5, l1: 1 },
  offBoard: true,
  props: [
    { key: 'n', label: 'Turns ratio Ns/Np', ...VALUE_STEP },
    { key: 'l1', label: 'Primary inductance', unit: 'H', ...VALUE_STEP },
  ],
  expand(p, ctx) {
    const m1 = ctx.internal('p');
    const m2 = ctx.internal('s');
    const ratio = n(p.props.n, 0.5);
    return [
      el(ctx, 'rp', 'R', [ctx.pin(0), m1], { r: 0.5, maxP: 0 }),
      el(ctx, '', 'xfmr', [m1, ctx.pin(1), m2, ctx.pin(3)], { l1: n(p.props.l1, 1), n: ratio, k: 0.999 }),
      el(ctx, 'rs', 'R', [ctx.pin(2), m2], { r: 0.5 * ratio * ratio + 0.05, maxP: 0 }),
    ];
  },
  value: (p) => `1 : ${n(p.n, 0.5)}`,
  info: {
    summary: 'Two coupled coils: changes the AC voltage by the turns ratio. Works only with changing current.',
    pinout: ['P1, P2 : primary winding', 'S1, S2 : secondary winding'],
    specs: [
      ['Voltage', 'Vs = Vp · Ns/Np'],
      ['Current', 'Is ≈ Ip · Np/Ns'],
      ['Coupling', 'k = 0.999'],
    ],
    how: 'An alternating current in the primary creates a changing magnetic flux, which induces a voltage in the secondary. DC gives no output after the first instant. The secondary floats, so reference it to ground if you want to measure it.',
    typical: ['Step-down for a rectifier supply', 'Isolation'],
  },
};

// --------------------------------------------------------------------------------------------- semiconductors

function twoLeadSemi(type: string, name: string, preset: Params, info: DatasheetInfo, extra: Partial<PartDef> = {}): PartDef {
  return {
    type,
    name,
    category: 'Semiconductors',
    prefix: 'D',
    pins: [
      { name: 'A', dx: 0, dy: 0 },
      { name: 'K', dx: 4, dy: 0 },
    ],
    box: { x: 0.8, y: -0.4, w: 2.4, h: 0.8 },
    defaults: {},
    props: [],
    expand: (_p, ctx) => [el(ctx, '', 'D', [ctx.pin(0), ctx.pin(1)], preset)],
    info,
    ...extra,
  };
}

const diode: PartDef = twoLeadSemi(
  'diode',
  'Diode',
  DIODE_1N4148,
  {
    summary: 'Lets current flow one way (anode → cathode). Drops about 0.6–0.7 V when conducting.',
    pinout: ['A : anode', 'K : cathode (band)'],
    specs: [
      ['Forward drop', '≈0.65 V @ 5 mA (1N4148), ≈0.8 V @ 1 A (1N4001)'],
      ['Reverse voltage', '100 V (1N4148), 50 V (1N4001)'],
      ['Max current', '300 mA (1N4148), 1 A (1N4001)'],
    ],
    how: 'A PN junction conducts when the anode is about 0.6 V above the cathode; current rises exponentially with voltage (Shockley equation I = Is·(e^(V/nVt) − 1)). Reversed, only a tiny leakage flows.',
    typical: ['Half-wave and bridge rectifiers', 'Flyback diode across relay coils', 'Reverse-polarity protection'],
  },
  {
    defaults: { model: '1N4148' },
    props: [
      {
        key: 'model',
        label: 'Model',
        kind: 'enum',
        options: [
          { value: '1N4148', label: '1N4148 (signal)' },
          { value: '1N4001', label: '1N4001 (rectifier, 1 A)' },
        ],
      },
    ],
    expand: (p, ctx) => [el(ctx, '', 'D', [ctx.pin(0), ctx.pin(1)], s(p.props.model, '1N4148') === '1N4001' ? DIODE_1N4001 : DIODE_1N4148)],
    value: (p) => s(p.model, '1N4148'),
  },
);

const zenerPart: PartDef = twoLeadSemi(
  'zener',
  'Zener diode',
  zener(5.1),
  {
    summary: 'A diode designed to conduct in reverse at a precise breakdown voltage; used as a simple regulator.',
    pinout: ['A : anode', 'K : cathode (band) — connect to the positive side when regulating'],
    specs: [
      ['Breakdown', '3.3 – 12 V (selectable)'],
      ['Power', '1 W (1N47xx)'],
    ],
    how: 'Reverse-biased above its Zener voltage the diode holds the voltage nearly constant over a wide range of currents. A series resistor sets the current: R = (Vin − Vz) / Iz.',
    typical: ['Shunt regulator: resistor + Zener', 'Overvoltage clamp'],
  },
  {
    defaults: { bv: 5.1 },
    props: [
      {
        key: 'bv',
        label: 'Zener voltage',
        kind: 'enum',
        options: [3.3, 4.7, 5.1, 6.2, 9.1, 12].map((v) => ({ value: v, label: `${v} V` })),
      },
    ],
    expand: (p, ctx) => [el(ctx, '', 'D', [ctx.pin(0), ctx.pin(1)], zener(n(p.props.bv, 5.1)))],
    value: (p) => `${n(p.bv, 5.1)} V`,
  },
);

const schottky: PartDef = twoLeadSemi('schottky', 'Schottky diode', SCHOTTKY_1N5817, {
  summary: 'Metal–semiconductor diode with a low forward drop (≈0.3 V) and very fast switching.',
  pinout: ['A : anode', 'K : cathode (band)'],
  specs: [
    ['Forward drop', '≈0.3 V @ 100 mA'],
    ['Reverse voltage', '20 V (1N5817)'],
    ['Leakage', 'higher than silicon diodes'],
  ],
  how: 'With no minority-carrier storage, a Schottky diode switches very quickly and wastes less power, at the cost of more reverse leakage.',
  typical: ['Low-loss rectifier', 'Reverse-polarity protection for low voltages'],
});
schottky.value = () => '1N5817';

const ledPart: PartDef = {
  type: 'led',
  name: 'LED',
  category: 'Output',
  prefix: 'D',
  pins: [
    { name: 'A', dx: 0, dy: 0 },
    { name: 'K', dx: 1, dy: 0 },
  ],
  box: { x: -0.55, y: -1.6, w: 2.1, h: 1.9 },
  defaults: { color: 'red' },
  props: [{ key: 'color', label: 'Colour', kind: 'enum', options: OPTIONS_LED }],
  expand: (p, ctx) => [el(ctx, '', 'D', [ctx.pin(0), ctx.pin(1)], led(s(p.props.color, 'red') as LedColor))],
  value: (p) => s(p.color, 'red'),
  info: {
    summary: 'Light-emitting diode. Glows when forward current flows; always needs a current-limiting resistor.',
    pinout: ['A : anode (longer leg, +)', 'K : cathode (shorter leg, flat side, −)'],
    specs: [
      ['Forward voltage', 'red 1.9 V, yellow 2.1 V, green 2.2 V, blue/white 3.1–3.2 V'],
      ['Typical current', '5–20 mA'],
      ['Absolute max', '30 mA; reverse 5 V'],
    ],
    how: 'An LED is a diode whose junction emits light. Its forward voltage is almost constant, so the current must be set by a resistor: R = (Vsupply − Vf) / I. Without one the current rises until the LED burns out.',
    typical: ['LED + resistor from a battery', 'Arduino Blink', '555 blinker'],
  },
};

const photodiode: PartDef = {
  ...ledPart,
  type: 'photodiode',
  name: 'Photodiode',
  category: 'Switches & sensors',
  prefix: 'PD',
  defaults: { lux: 300 },
  props: [{ key: 'lux', label: 'Light level', kind: 'slider', unit: 'lx', min: 0, max: 5000, step: 10, live: true }],
  expand: (p, ctx) => [el(ctx, '', 'D', [ctx.pin(0), ctx.pin(1)], { ...PHOTODIODE, lux: n(p.props.lux, 300) })],
  value: (p) => `${Math.round(n(p.lux, 300))} lx`,
  info: {
    summary: 'A diode that generates a current proportional to the light falling on it.',
    pinout: ['A : anode', 'K : cathode'],
    specs: [
      ['Responsivity', '≈70 nA per lux (model)'],
      ['Mode', 'reverse-biased (photoconductive) or zero-bias (photovoltaic)'],
    ],
    how: 'Photons create electron–hole pairs in the junction, giving a reverse current that rises linearly with light. Reverse-bias it through a resistor and the resistor voltage measures the light.',
    typical: ['Light meter with a resistor or transimpedance op-amp'],
  },
};

function bjt(type: 'npn' | 'pnp'): PartDef {
  const npn = type === 'npn';
  return {
    type,
    name: npn ? 'NPN transistor' : 'PNP transistor',
    category: 'Semiconductors',
    prefix: 'Q',
    pins: [
      { name: 'E', dx: 0, dy: 0 },
      { name: 'B', dx: 1, dy: 0 },
      { name: 'C', dx: 2, dy: 0 },
    ],
    box: { x: -0.5, y: -1.5, w: 3, h: 1.9 },
    defaults: { bf: 150 },
    props: [{ key: 'bf', label: 'Current gain β (hFE)', ...VALUE_STEP }],
    expand: (p, ctx) => [
      el(ctx, '', 'Q', [ctx.pin(2), ctx.pin(1), ctx.pin(0)], { ...(npn ? NPN_2N3904 : PNP_2N3906), bf: n(p.props.bf, 150) }),
    ],
    value: () => (npn ? '2N3904' : '2N3906'),
    info: {
      summary: npn
        ? 'Bipolar transistor: a small base current controls a collector current β times larger.'
        : 'PNP bipolar transistor: conducts when the base is pulled about 0.7 V below the emitter.',
      pinout: ['E : emitter', 'B : base', 'C : collector (flat face towards you, legs down: E B C)'],
      specs: [
        ['Model', npn ? '2N3904 (Ebers–Moll)' : '2N3906 (Ebers–Moll)'],
        ['β (hFE)', '100–300, 150 default'],
        ['Ic max', '200 mA'],
        ['Vce max', '40 V'],
        ['VBE(on)', '≈0.65 V'],
      ],
      how: npn
        ? 'In the active region Ic = β·Ib and VBE ≈ 0.65 V. As a switch, give it enough base current (Ib > Ic/β, with margin) to saturate it so VCE drops to ~0.1 V. As an amplifier, bias it in the middle of its range with a voltage divider and emitter resistor.'
        : 'The PNP is the mirror image of the NPN: current flows emitter → collector when the base is below the emitter. Use it for high-side switching.',
      typical: ['Transistor switch for an LED or relay', 'Common-emitter amplifier', 'Current mirror'],
    },
  };
}

function mosfet(type: 'nmos' | 'pmos'): PartDef {
  const nch = type === 'nmos';
  return {
    type,
    name: nch ? 'N-channel MOSFET' : 'P-channel MOSFET',
    category: 'Semiconductors',
    prefix: 'Q',
    pins: [
      { name: 'S', dx: 0, dy: 0 },
      { name: 'G', dx: 1, dy: 0 },
      { name: 'D', dx: 2, dy: 0 },
    ],
    box: { x: -0.5, y: -1.5, w: 3, h: 1.9 },
    defaults: {},
    props: [],
    expand: (_p, ctx) => [
      el(ctx, '', 'M', [ctx.pin(2), ctx.pin(1), ctx.pin(0)], nch ? NMOS_2N7000 : PMOS_BS250),
      // body diode
      el(ctx, 'body', 'D', nch ? [ctx.pin(0), ctx.pin(2)] : [ctx.pin(2), ctx.pin(0)], { ...DIODE_1N4148, maxI: 0 }),
    ],
    value: () => (nch ? '2N7000' : 'BS250'),
    info: {
      summary: nch
        ? 'Voltage-controlled switch: gate voltage above the threshold turns the drain–source channel on. The gate draws no DC current.'
        : 'P-channel MOSFET: turns on when the gate is pulled below the source by more than the threshold.',
      pinout: ['S : source', 'G : gate', 'D : drain'],
      specs: [
        ['Model', nch ? '2N7000, Level-1, Vth ≈ 2.0 V' : 'BS250, Level-1, Vth ≈ −2.5 V'],
        ['Id max', nch ? '200 mA' : '180 mA'],
        ['Gate', 'insulated, ±20 V max'],
        ['Body diode', 'included (source → drain for N-channel)'],
      ],
      how: 'Below threshold the channel is off. Above it the MOSFET behaves first as a resistor (triode region) and then as a current source (saturation), with Id = K/2·(VGS − Vth)². Because the gate is insulated, a microcontroller pin can drive it directly. Add a pull-down so the gate never floats.',
      typical: ['Low-side switch for a motor or LED strip', 'Logic-level switching from an Arduino'],
    },
  };
}

// --------------------------------------------------------------------------------------------- analog ICs

const OPAMP_741_PINS = dipPins(['OFS1', 'IN−', 'IN+', 'V−', 'OFS2', 'OUT', 'V+', 'NC']);

function opamp741(type: string, name: string, params: Params, info: DatasheetInfo): PartDef {
  return {
    type,
    name,
    category: 'Analog ICs',
    prefix: 'U',
    pins: OPAMP_741_PINS,
    box: dipBox(8),
    dip: true,
    defaults: {},
    props: [],
    // IN+ = pin 3, IN− = pin 2, V+ = pin 7, V− = pin 4, OUT = pin 6
    expand: (_p, ctx) => [el(ctx, '', 'opamp', [ctx.pin(2), ctx.pin(1), ctx.pin(6), ctx.pin(3), ctx.pin(5)], params)],
    info,
  };
}

const OPAMP_INFO_HOW =
  'An op-amp amplifies the difference between its inputs by a huge open-loop gain. With negative feedback (output fed back to IN−) it adjusts its output until both inputs are at the same voltage, which makes the gain set only by the resistors. Without feedback it slams to a rail and acts as a comparator.';

const opampGeneric = opamp741('opamp', 'Op-amp (ideal-ish)', OPAMP_IDEALISH, {
  summary: 'A near-ideal operational amplifier in the 741 pinout: 10 MHz GBW, rail-to-rail output.',
  pinout: ['2 : IN− (inverting)', '3 : IN+ (non-inverting)', '4 : V− supply', '6 : OUT', '7 : V+ supply'],
  specs: [
    ['Open-loop gain', '10⁶'],
    ['GBW', '10 MHz'],
    ['Output swing', 'rail-to-rail'],
  ],
  how: OPAMP_INFO_HOW,
  typical: ['Inverting amplifier: gain = −Rf/Rin', 'Non-inverting: gain = 1 + Rf/Rg', 'Voltage follower'],
});
const lm741 = opamp741('lm741', 'LM741 op-amp', LM741, {
  summary: 'The classic general-purpose op-amp. Needs split supplies (±5 to ±18 V); output can’t reach the rails.',
  pinout: ['1, 5 : offset null', '2 : IN−', '3 : IN+', '4 : V−', '6 : OUT', '7 : V+', '8 : not connected'],
  specs: [
    ['Open-loop gain', '200 000'],
    ['GBW', '1 MHz'],
    ['Slew rate', '0.5 V/µs'],
    ['Output swing', 'about 1 V from each rail'],
  ],
  how: OPAMP_INFO_HOW,
  typical: ['Inverting / non-inverting amplifiers', 'Active filters', 'Comparator'],
});

const lm358: PartDef = {
  type: 'lm358',
  name: 'LM358 dual op-amp',
  category: 'Analog ICs',
  prefix: 'U',
  pins: dipPins(['OUT A', 'IN− A', 'IN+ A', 'GND', 'IN+ B', 'IN− B', 'OUT B', 'VCC']),
  box: dipBox(8),
  dip: true,
  defaults: {},
  props: [],
  expand: (_p, ctx) => [
    el(ctx, 'a', 'opamp', [ctx.pin(2), ctx.pin(1), ctx.pin(7), ctx.pin(3), ctx.pin(0)], LM358),
    el(ctx, 'b', 'opamp', [ctx.pin(4), ctx.pin(5), ctx.pin(7), ctx.pin(3), ctx.pin(6)], LM358),
  ],
  info: {
    summary: 'Two op-amps that run from a single supply (3–32 V); inputs and output work down to ground.',
    pinout: ['1 OUT A, 2 IN− A, 3 IN+ A', '4 GND', '5 IN+ B, 6 IN− B, 7 OUT B', '8 VCC'],
    specs: [
      ['Supply', '3–32 V single'],
      ['GBW', '1 MHz'],
      ['Output high', 'VCC − 1.5 V'],
      ['Output low', '≈ 0 V'],
    ],
    how: OPAMP_INFO_HOW + ' The LM358 is ideal for 5 V and 9 V battery circuits because it does not need a negative supply.',
    typical: ['Single-supply amplifier with a mid-rail bias', 'Comparator with hysteresis', 'Light-sensor amplifier'],
  },
};

const lm324: PartDef = {
  type: 'lm324',
  name: 'LM324 quad op-amp',
  category: 'Analog ICs',
  prefix: 'U',
  pins: dipPins(['OUT1', 'IN1−', 'IN1+', 'VCC', 'IN2+', 'IN2−', 'OUT2', 'OUT3', 'IN3−', 'IN3+', 'GND', 'IN4+', 'IN4−', 'OUT4']),
  box: dipBox(14),
  dip: true,
  defaults: {},
  props: [],
  expand: (_p, ctx) => [
    el(ctx, 'a', 'opamp', [ctx.pin(2), ctx.pin(1), ctx.pin(3), ctx.pin(10), ctx.pin(0)], LM324),
    el(ctx, 'b', 'opamp', [ctx.pin(4), ctx.pin(5), ctx.pin(3), ctx.pin(10), ctx.pin(6)], LM324),
    el(ctx, 'c', 'opamp', [ctx.pin(9), ctx.pin(8), ctx.pin(3), ctx.pin(10), ctx.pin(7)], LM324),
    el(ctx, 'd', 'opamp', [ctx.pin(11), ctx.pin(12), ctx.pin(3), ctx.pin(10), ctx.pin(13)], LM324),
  ],
  info: {
    summary: 'Four single-supply op-amps in one 14-pin package (same family as the LM358).',
    pinout: ['4 VCC, 11 GND', 'Amps 1 & 2 on the left half, 3 & 4 on the right'],
    specs: [
      ['Supply', '3–32 V'],
      ['GBW', '1.2 MHz'],
    ],
    how: OPAMP_INFO_HOW,
    typical: ['Multi-stage filters', 'Window comparator', 'Bar-graph level meter'],
  },
};

const lm7805: PartDef = {
  type: 'lm7805',
  name: 'LM7805 regulator',
  category: 'Analog ICs',
  prefix: 'U',
  pins: [
    { name: 'IN', dx: 0, dy: 0 },
    { name: 'GND', dx: 1, dy: 0 },
    { name: 'OUT', dx: 2, dy: 0 },
  ],
  box: { x: -0.6, y: -2.8, w: 3.2, h: 3.2 },
  defaults: {},
  props: [],
  expand: (_p, ctx) => [el(ctx, '', 'reg', [ctx.pin(0), ctx.pin(1), ctx.pin(2)], { vout: 5, dropout: 2, maxI: 1.5, maxP: 2 })],
  value: () => '5 V',
  info: {
    summary: 'Fixed 5 V linear regulator: turns 7–35 V into a steady 5 V.',
    pinout: ['IN : input (7–35 V)', 'GND : common', 'OUT : 5 V'],
    specs: [
      ['Output', '5.0 V ±4 %'],
      ['Dropout', '≈2 V (needs Vin ≥ 7 V)'],
      ['Max current', '1.5 A (with heatsink)'],
      ['Dissipation', 'P = (Vin − 5 V) · I'],
    ],
    how: 'A linear regulator is a transistor that continuously adjusts itself to drop the excess voltage. The wasted power becomes heat, so large Vin − Vout at high current needs a heatsink. Put 0.33 µF on the input and 0.1 µF on the output.',
    typical: ['9 V battery → 5 V for logic or an Arduino'],
  },
};

const ne555: PartDef = {
  type: 'ne555',
  name: '555 timer',
  category: 'Analog ICs',
  prefix: 'U',
  pins: dipPins(['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC']),
  box: dipBox(8),
  dip: true,
  defaults: {},
  props: [],
  expand: (_p, ctx) => [el(ctx, '', '555', [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ctx.pin(k)), {})],
  value: () => 'NE555',
  info: {
    summary: 'The famous timer chip: makes oscillators (astable), one-shot pulses (monostable) and more.',
    pinout: ['1 GND', '2 TRIG: start when < ⅓ VCC', '3 OUT', '4 RESET (tie to VCC)', '5 CTRL (10 nF to GND)', '6 THR: stop when > ⅔ VCC', '7 DIS: discharge', '8 VCC (4.5–16 V)'],
    specs: [
      ['Astable frequency', 'f = 1.44 / ((R1 + 2·R2)·C)'],
      ['Duty cycle', '(R1 + R2) / (R1 + 2·R2)'],
      ['Monostable pulse', 't = 1.1·R·C'],
      ['Output', 'sources/sinks up to 200 mA; high ≈ VCC − 1.7 V'],
    ],
    how: 'Inside are a three-resistor divider (⅓ and ⅔ VCC), two comparators, a flip-flop and a discharge transistor. In astable mode the capacitor charges through R1 + R2 until it reaches ⅔ VCC, then discharges through R2 until ⅓ VCC, forever.',
    typical: ['Astable LED blinker', 'Clock for a CD4017 or 74HC161', 'Monostable timer', 'PWM generator'],
  },
};

// --------------------------------------------------------------------------------------------- digital ICs

function logicChip(type: string, chipId: string, how: string, typical: string[]): PartDef {
  const chip = CHIPS[chipId];
  return {
    type,
    name: `${chip.name} ${chip.title.toLowerCase()}`,
    category: 'Digital ICs',
    prefix: 'U',
    pins: dipPins(chip.pins.map((p) => p.name)),
    box: dipBox(chip.pins.length),
    dip: true,
    defaults: {},
    props: [],
    expand: (_p, ctx) => [el(ctx, '', 'logic', chip.pins.map((_, k) => ctx.pin(k)), { chip: chipId })],
    value: () => chip.name,
    info: {
      summary: `${chip.title} (${chip.family === '4000' ? 'CMOS 4000 series, 3–15 V' : '74HC family, 2–6 V'}).`,
      pinout: chip.pins.map((p, i) => `${i + 1} ${p.name}${p.role === 'vcc' ? ' (supply +)' : p.role === 'gnd' ? ' (supply −)' : ''}`),
      specs: [
        ['Supply', chip.family === '4000' ? '3–15 V' : '2–6 V (5 V typical)'],
        ['Input threshold', '≈ VCC / 2 (with small hysteresis in the model)'],
        ['Output drive', chip.family === '4000' ? '≈400 Ω' : '≈40 Ω, ±25 mA max'],
        ['Propagation delay', `${formatEng(chip.tpd, 's')} (model)`],
      ],
      how,
      typical,
    },
    keywords: `${chip.title} logic gate ttl cmos`,
  };
}

const GATE_HOW = (g: string, eq: string) =>
  `Each of the gates computes ${g}: ${eq}. Unused inputs must be tied to VCC or GND: CMOS inputs left floating read randomly. Always power the chip from pins 14 (VCC) and 7 (GND).`;

const chipsDefs: PartDef[] = [
  logicChip('ic7400', '7400', GATE_HOW('NAND', 'Y = ¬(A·B)') + ' NAND is universal: any logic function can be built from NANDs.', ['SR latch from two NANDs', 'Build NOT/AND/OR from NANDs']),
  logicChip('ic7402', '7402', GATE_HOW('NOR', 'Y = ¬(A+B)') + ' Note the 7402 pinout differs: outputs come first in each group.', ['SR latch from two NORs']),
  logicChip('ic7404', '7404', 'Six inverters: Y = ¬A. Handy for clock buffering and making a simple oscillator with an RC network.', ['Inverting a button signal', 'Ring oscillator']),
  logicChip('ic7408', '7408', GATE_HOW('AND', 'Y = A·B'), ['Enable gating']),
  logicChip('ic7432', '7432', GATE_HOW('OR', 'Y = A+B'), ['Combining alarm inputs']),
  logicChip('ic7486', '7486', GATE_HOW('XOR', 'Y = A⊕B') + ' XOR is the sum bit of a half adder.', ['Half adder (with a 7408)', 'Controlled inverter']),
  logicChip('ic7474', '7474', 'Two D flip-flops. On each rising clock edge Q takes the value of D. PRE and CLR are active-low and override the clock. Tie D to Q̄ to make a divide-by-2 counter.', ['Frequency divider', 'Debounced toggle', 'Shift register from several flip-flops']),
  logicChip('ic595', '74HC595', 'Serial-in, parallel-out. Each rising SRCLK shifts SER into QA (QA→QB…). A rising RCLK copies the shift register to the outputs at once. Lets 3 Arduino pins drive 8 (or more, by chaining QH′).', ['Driving 8 LEDs from 3 pins', 'Chained displays']),
  logicChip('ic138', '74HC138', 'Decodes a 3-bit address (A, B, C) to one of eight active-low outputs, when G1 is high and G2A/G2B are low.', ['Memory chip select', 'Running light with a counter']),
  logicChip('ic161', '74HC161', 'Synchronous 4-bit binary counter. Counts on rising CLK when ENP and ENT are high. CLR (active low) resets to 0 immediately; LOAD (active low) loads A–D on the next clock. RCO goes high at 15.', ['Binary counter on LEDs', 'Frequency divider', 'Cascaded counters']),
  logicChip('cd4017', 'CD4017', 'Decade counter with ten decoded outputs: exactly one of Q0–Q9 is high and it advances on each rising CLK (when INH is low). RST high returns to Q0. CO is high for counts 0–4.', ['LED chaser with a 555 clock', 'Traffic-light sequencer', 'Divide-by-N (connect Qn to RST)']),
];

// --------------------------------------------------------------------------------------------- output devices

const SEG_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;
const sevenseg: PartDef = {
  type: 'sevenseg',
  name: '7-segment display',
  category: 'Output',
  prefix: 'DS',
  // top: g f COM a b (pins 10..6); bottom: e d COM c dp (pins 1..5)
  pins: dipPins(['e', 'd', 'COM', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g']),
  box: { x: -0.45, y: -2.2, w: 4.9, h: 7.4 },
  dip: true,
  defaults: { color: 'red', common: 'cathode' },
  props: [
    { key: 'color', label: 'Colour', kind: 'enum', options: OPTIONS_LED },
    {
      key: 'common',
      label: 'Type',
      kind: 'enum',
      options: [
        { value: 'cathode', label: 'Common cathode' },
        { value: 'anode', label: 'Common anode' },
      ],
    },
  ],
  expand(p, ctx) {
    const names = ['e', 'd', 'COM', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g'];
    const com = ctx.pin(2);
    const cc = s(p.props.common, 'cathode') === 'cathode';
    const model = led(s(p.props.color, 'red') as LedColor);
    const out: ElementSpec[] = [el(ctx, 'com', 'R', [ctx.pin(2), ctx.pin(7)], { r: 1e-3, maxP: 0 })];
    for (const seg of SEG_ORDER) {
      const pin = ctx.pin(names.indexOf(seg));
      out.push(el(ctx, seg, 'D', cc ? [pin, com] : [com, pin], model));
    }
    return out;
  },
  value: (p) => (s(p.common, 'cathode') === 'cathode' ? 'CC' : 'CA'),
  info: {
    summary: 'Eight LEDs (segments a–g and a decimal point) arranged to show digits.',
    pinout: ['Top: g f COM a b', 'Bottom: e d COM c dp', 'Both COM pins are joined inside'],
    specs: [
      ['Common cathode', 'COM to GND, drive segments high through resistors'],
      ['Common anode', 'COM to +V, drive segments low'],
      ['Per segment', 'like one LED: ~2 V, 10 mA'],
    ],
    how: 'Each segment is an LED, so each needs its own resistor (one on COM would make brightness depend on the digit). To show "1", light b and c.',
    typical: ['Counter display with a CD4511 or an Arduino', 'Dice'],
  },
};

function ledBar(count: 4 | 8): PartDef {
  return {
    type: `ledbar${count}`,
    name: `${count}-segment LED bar`,
    category: 'Output',
    prefix: 'DS',
    pins: [
      ...Array.from({ length: count }, (_, i) => ({ name: `A${i + 1}`, dx: i, dy: 0 })),
      ...Array.from({ length: count }, (_, i) => ({ name: `K${i + 1}`, dx: i, dy: 3 })),
    ],
    box: { x: -0.45, y: 0.55, w: count - 1 + 0.9, h: 1.9 },
    dip: true,
    defaults: { color: 'green' },
    props: [{ key: 'color', label: 'Colour', kind: 'enum', options: OPTIONS_LED }],
    expand(p, ctx) {
      const model = led(s(p.props.color, 'green') as LedColor);
      return Array.from({ length: count }, (_, i) => el(ctx, String(i), 'D', [ctx.pin(i), ctx.pin(count + i)], model));
    },
    info: {
      summary: `${count} independent LEDs in one package: anodes on one side, cathodes on the other.`,
      pinout: ['Top row: anodes A1…', 'Bottom row: cathodes K1…'],
      specs: [['Per LED', '≈2 V, 10–20 mA, needs a resistor']],
      how: 'A bar graph is just several LEDs side by side. Drive each through its own resistor from a logic output or counter.',
      typical: ['Binary display for a 74HC161', 'Shift-register output'],
    },
  };
}

const buzzer: PartDef = {
  type: 'buzzer',
  name: 'Active buzzer',
  category: 'Output',
  prefix: 'BZ',
  pins: [
    { name: '+', dx: 0, dy: 0 },
    { name: '−', dx: 2, dy: 0 },
  ],
  box: { x: -0.4, y: -1.4, w: 2.8, h: 2.8 },
  defaults: {},
  props: [],
  expand(_p, ctx) {
    const mid = ctx.internal('m');
    return [
      el(ctx, 'd', 'D', [ctx.pin(0), mid], { ...DIODE_1N4148, maxI: 0 }),
      el(ctx, '', 'R', [mid, ctx.pin(1)], { r: 130, maxP: 0 }),
    ];
  },
  info: {
    summary: 'Beeps when DC is applied (it has its own oscillator). Polarised.',
    pinout: ['+ : longer leg', '− : shorter leg'],
    specs: [
      ['Voltage', '3–6 V (sounds above ≈2 V)'],
      ['Current', '≈25 mA at 5 V'],
    ],
    how: 'An active buzzer contains a driver circuit and a piezo or magnetic transducer. Bench models it electrically as a resistive load with reverse blocking and shows when it would sound. (Bench does not play audio.)',
    typical: ['Alarm driven by a transistor', 'Arduino beeper'],
  },
};

const motor: PartDef = {
  type: 'motor',
  name: 'DC motor',
  category: 'Output',
  prefix: 'M',
  pins: [
    { name: '+', dx: 0, dy: 0 },
    { name: '−', dx: 3, dy: 0 },
  ],
  box: { x: -0.5, y: -4, w: 4, h: 4.3 },
  defaults: { load: 0 },
  offBoard: true,
  props: [{ key: 'load', label: 'Load torque', kind: 'slider', unit: 'N·m', min: 0, max: 0.006, step: 0.0001, live: true }],
  expand: (p, ctx) => [el(ctx, '', 'motor', [ctx.pin(0), ctx.pin(1)], { load: n(p.props.load, 0) })],
  info: {
    summary: 'A small brushed DC motor (3–6 V hobby type). Speed rises with voltage; current rises with load.',
    pinout: ['+ / − : swap to reverse direction'],
    specs: [
      ['Armature', 'R = 2 Ω, L = 0.5 mH'],
      ['Back-EMF constant', 'k = 5 mV·s/rad (≈1900 rpm per volt)'],
      ['Stall current', 'V / 2 Ω'],
    ],
    how: 'Current in the armature produces torque (τ = k·I). As the motor spins it generates a back-EMF (k·ω) that opposes the supply, so a free-running motor draws little current while a stalled one draws a lot. Never drive a motor straight from a logic pin: use a transistor and a flyback diode.',
    typical: ['MOSFET motor driver with flyback diode', 'Speed control with PWM'],
  },
};

// --------------------------------------------------------------------------------------------- switches & sensors

const toggle: PartDef = {
  type: 'toggle',
  name: 'Slide switch (SPDT)',
  category: 'Switches & sensors',
  prefix: 'SW',
  pins: [
    { name: 'A', dx: 0, dy: 0 },
    { name: 'COM', dx: 1, dy: 0 },
    { name: 'B', dx: 2, dy: 0 },
  ],
  box: { x: -0.5, y: -1.2, w: 3, h: 1.6 },
  defaults: { pos: false },
  props: [{ key: 'pos', label: 'Position B', kind: 'bool', live: true }],
  expand(p, ctx) {
    const toB = b(p.props.pos, false);
    return [
      el(ctx, 'a', 'sw', [ctx.pin(1), ctx.pin(0)], { closed: !toB }),
      el(ctx, 'b', 'sw', [ctx.pin(1), ctx.pin(2)], { closed: toB }),
    ];
  },
  value: (p) => (b(p.pos, false) ? 'COM–B' : 'COM–A'),
  info: {
    summary: 'Single-pole double-throw switch: the middle pin connects to one side or the other.',
    pinout: ['A : side A', 'COM : common (middle)', 'B : side B'],
    specs: [
      ['Contact resistance', '≈20 mΩ'],
      ['Rating', '0.3 A at 30 V (typical breadboard switch)'],
    ],
    how: 'Tap the switch while the circuit runs to flip it. Use COM + one side as a simple on/off switch, or both sides to select between two sources.',
    typical: ['Power switch', 'Selecting HIGH/LOW for a logic input'],
  },
};

const button: PartDef = {
  type: 'button',
  name: 'Push button',
  category: 'Switches & sensors',
  prefix: 'SW',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 2, dy: 0 },
  ],
  box: { x: -0.2, y: -1.2, w: 2.4, h: 2.4 },
  defaults: { pressed: false },
  props: [{ key: 'pressed', label: 'Pressed', kind: 'bool', live: true }],
  expand: (p, ctx) => [el(ctx, '', 'sw', [ctx.pin(0), ctx.pin(1)], { closed: b(p.props.pressed, false) })],
  info: {
    summary: 'Momentary switch: connects its pins only while pressed.',
    pinout: ['1, 2 : switched contacts'],
    specs: [['Contact', '≈20 mΩ closed, open otherwise']],
    how: 'Press and hold the button on the canvas while running. A logic input connected to a button needs a pull-up or pull-down resistor (or the Arduino’s INPUT_PULLUP) so it never floats.',
    typical: ['Arduino button input with INPUT_PULLUP', 'Clock for a counter (watch for bounce on real hardware)'],
  },
};

const dipswitch: PartDef = {
  type: 'dipswitch',
  name: 'DIP switch (4)',
  category: 'Switches & sensors',
  prefix: 'SW',
  pins: [
    ...Array.from({ length: 4 }, (_, i) => ({ name: `${i + 1}a`, dx: i, dy: 0 })),
    ...Array.from({ length: 4 }, (_, i) => ({ name: `${i + 1}b`, dx: i, dy: 3 })),
  ],
  box: { x: -0.45, y: 0.55, w: 3.9, h: 1.9 },
  dip: true,
  defaults: { s0: false, s1: false, s2: false, s3: false },
  props: [0, 1, 2, 3].map((i) => ({ key: `s${i}`, label: `Switch ${i + 1}`, kind: 'bool' as const, live: true })),
  expand: (p, ctx) => [0, 1, 2, 3].map((i) => el(ctx, String(i), 'sw', [ctx.pin(i), ctx.pin(4 + i)], { closed: b(p.props[`s${i}`], false) })),
  value: (p) => [0, 1, 2, 3].map((i) => (b(p[`s${i}`], false) ? '1' : '0')).join(''),
  info: {
    summary: 'Four tiny independent on/off switches in a DIP package that straddles the channel.',
    pinout: ['Top row: one side of switches 1–4', 'Bottom row: other side'],
    specs: [['Contact', '≈20 mΩ closed']],
    how: 'Often used to set binary inputs. Pair each switch with a pull-down resistor so the input reads 0 when the switch is open.',
    typical: ['Inputs for logic-gate truth tables', 'Setting a counter preload'],
  },
};

const relay: PartDef = {
  type: 'relay',
  name: 'Relay (5 V)',
  category: 'Switches & sensors',
  prefix: 'K',
  // DIP-like: coil on bottom row, contacts on top row
  pins: [
    { name: 'COIL+', dx: 0, dy: 3 },
    { name: 'COIL−', dx: 3, dy: 3 },
    { name: 'COM', dx: 0, dy: 0 },
    { name: 'NO', dx: 3, dy: 0 },
    { name: 'NC', dx: 2, dy: 0 },
  ],
  box: { x: -0.45, y: -0.6, w: 3.9, h: 4.2 },
  dip: true,
  defaults: {},
  props: [],
  expand: (_p, ctx) => [el(ctx, '', 'relay', [ctx.pin(0), ctx.pin(1), ctx.pin(2), ctx.pin(3), ctx.pin(4)], { rcoil: 70, lcoil: 0.02, ipull: 0.05, idrop: 0.015 })],
  info: {
    summary: 'An electromagnet that moves a switch: a small coil current switches a separate circuit.',
    pinout: ['COIL+ / COIL− : 5 V coil (≈70 Ω)', 'COM : common contact', 'NO : normally open', 'NC : normally closed'],
    specs: [
      ['Coil', '5 V, 70 Ω, ≈71 mA'],
      ['Pull-in', '≈50 mA; drop-out ≈15 mA'],
      ['Contacts', 'isolated from the coil'],
    ],
    how: 'Energising the coil pulls the armature so COM moves from NC to NO. The coil is an inductor: when you switch it off it produces a voltage spike, so always fit a flyback diode across it (cathode to +). A transistor is usually needed to supply the coil current.',
    typical: ['Transistor-driven relay with flyback diode', 'Switching a motor from an Arduino'],
  },
};

const ldr: PartDef = {
  type: 'ldr',
  name: 'Light-dependent resistor',
  category: 'Switches & sensors',
  prefix: 'LDR',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 2, dy: 0 },
  ],
  box: { x: 0, y: -1.1, w: 2, h: 1.6 },
  defaults: { lux: 300 },
  props: [{ key: 'lux', label: 'Light level', kind: 'slider', unit: 'lx', min: 1, max: 10000, step: 1, live: true }],
  expand(p, ctx) {
    const lux = Math.max(0.1, n(p.props.lux, 300));
    const r = Math.min(1e6, 20e3 * Math.pow(lux / 10, -0.7));
    return [el(ctx, '', 'R', [ctx.pin(0), ctx.pin(1)], { r, maxP: 0.1 })];
  },
  value: (p) => `${Math.round(n(p.lux, 300))} lx`,
  info: {
    summary: 'A resistor whose value falls as light increases (≈20 kΩ at 10 lux, ≈1 kΩ in bright room light).',
    pinout: ['Either lead'],
    specs: [
      ['Model', 'R = 20 kΩ · (lux/10)^−0.7'],
      ['Dark resistance', 'up to 1 MΩ'],
      ['Response', 'tens of ms (not modelled)'],
    ],
    how: 'Cadmium-sulphide conducts better when photons free charge carriers. Put it in a voltage divider with a fixed resistor and the midpoint voltage tracks the light level.',
    typical: ['Night light with a transistor', 'Arduino light sensor on A0'],
  },
};

const thermistor: PartDef = {
  type: 'thermistor',
  name: 'Thermistor (NTC)',
  category: 'Switches & sensors',
  prefix: 'TH',
  pins: [
    { name: '1', dx: 0, dy: 0 },
    { name: '2', dx: 2, dy: 0 },
  ],
  box: { x: 0.3, y: -1.1, w: 1.4, h: 1.4 },
  defaults: { tempC: 25, r25: 10000, beta: 3950 },
  props: [
    { key: 'tempC', label: 'Temperature', kind: 'slider', unit: '°C', min: -20, max: 120, step: 0.5, live: true },
    { key: 'r25', label: 'R at 25 °C', unit: 'Ω', ...VALUE_STEP },
    { key: 'beta', label: 'β constant', unit: 'K', ...VALUE_STEP },
  ],
  expand(p, ctx) {
    const T = n(p.props.tempC, 25) + 273.15;
    const r = n(p.props.r25, 10000) * Math.exp(n(p.props.beta, 3950) * (1 / T - 1 / 298.15));
    return [el(ctx, '', 'R', [ctx.pin(0), ctx.pin(1)], { r, maxP: 0.1 })];
  },
  value: (p) => `${n(p.tempC, 25)} °C`,
  info: {
    summary: 'Negative-temperature-coefficient resistor: resistance falls as it warms up.',
    pinout: ['Either lead'],
    specs: [
      ['Model', 'R = R25 · e^(β(1/T − 1/298.15 K))'],
      ['Typical', '10 kΩ at 25 °C, β = 3950 K'],
    ],
    how: 'Used in a voltage divider and read with an ADC; the β equation converts the resistance back to temperature.',
    typical: ['Temperature alarm with a comparator', 'Arduino thermometer'],
  },
};

// --------------------------------------------------------------------------------------------- Arduino

const ARDUINO_LAYOUT: Record<string, [number, number]> = (() => {
  const m: Record<string, [number, number]> = {};
  m.GND = [9, 0];
  ['D13', 'D12', 'D11', 'D10', 'D9', 'D8'].forEach((p, i) => (m[p] = [10 + i, 0]));
  ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'].forEach((p, i) => (m[p] = [17 + i, 0]));
  m['3V3'] = [12, 19];
  m['5V'] = [13, 19];
  m.GND2 = [14, 19];
  m.GND3 = [15, 19];
  m.VIN = [16, 19];
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((p, i) => (m[p] = [18 + i, 19]));
  return m;
})();
const ARDUINO_PIN_NAMES = [...UNO_PINS.filter((p) => p !== 'GND'), 'GND', 'GND2', 'GND3'];

const arduino: PartDef = {
  type: 'arduino',
  name: 'Arduino Uno',
  category: 'Microcontroller',
  prefix: 'U',
  pins: ARDUINO_PIN_NAMES.map((name) => ({ name, dx: ARDUINO_LAYOUT[name][0], dy: ARDUINO_LAYOUT[name][1] })),
  box: { x: 0, y: -1, w: 27, h: 21 },
  offBoard: true,
  defaults: { program: 'blink', hex: '', source: '' },
  props: [],
  expand(p, ctx) {
    const idx = (name: string) => ARDUINO_PIN_NAMES.indexOf(name);
    const nodes = UNO_PINS.map((name) => ctx.pin(idx(name)));
    return [
      el(ctx, '', 'avr', nodes, { hex: s(p.props.hex, '') }),
      el(ctx, 'g2', 'R', [ctx.pin(idx('GND')), ctx.pin(idx('GND2'))], { r: 1e-3, maxP: 0 }),
      el(ctx, 'g3', 'R', [ctx.pin(idx('GND')), ctx.pin(idx('GND3'))], { r: 1e-3, maxP: 0 }),
    ];
  },
  value: (p) => s(p.program, 'custom'),
  info: {
    summary: 'ATmega328P microcontroller board, emulated instruction-by-instruction (avr8js) at 16 MHz.',
    pinout: ['D0–D13 : digital I/O (D3, 5, 6, 9, 10, 11 PWM)', 'A0–A5 : analog inputs (10-bit ADC)', '5V, 3V3 : supply outputs (USB-powered)', 'GND : ground', 'D13 : on-board LED'],
    specs: [
      ['Clock', '16 MHz'],
      ['I/O', '20 mA recommended, 40 mA absolute per pin'],
      ['ADC', '10 bits, 0–5 V → 0–1023'],
      ['Serial', 'USART on D0/D1, shown in the Serial Monitor'],
    ],
    how: 'Bench runs the real machine code: Timer, PWM, ADC, GPIO and USART are emulated by avr8js and connected to the circuit solver. Bench cannot compile Arduino C++ on the device. Load one of the starter programs (written in AVR assembly, which Bench assembles on the device), write your own assembly, or import a .hex file exported from the Arduino IDE.',
    typical: ['Blink', 'Button with INPUT_PULLUP', 'Fade (PWM)', 'Analog read of a potentiometer'],
  },
};

// --------------------------------------------------------------------------------------------- registry

export const PART_LIST: PartDef[] = [
  battery,
  supply,
  funcgen,
  acsource,
  ground,
  resistor,
  pot,
  cap,
  ecap,
  inductor,
  xfmr,
  diode,
  zenerPart,
  schottky,
  bjt('npn'),
  bjt('pnp'),
  mosfet('nmos'),
  mosfet('pmos'),
  opampGeneric,
  lm358,
  lm741,
  lm324,
  lm7805,
  ne555,
  ...chipsDefs,
  ledPart,
  sevenseg,
  ledBar(4),
  ledBar(8),
  buzzer,
  motor,
  toggle,
  button,
  dipswitch,
  relay,
  ldr,
  thermistor,
  photodiode,
  potsensor,
  arduino,
];

export const PARTS: Record<string, PartDef> = Object.fromEntries(PART_LIST.map((d) => [d.type, d]));

export function partDef(type: string): PartDef {
  const d = PARTS[type];
  if (!d) throw new Error(`Unknown part type ${type}`);
  return d;
}

/** Rotate a footprint offset by rot × 90° clockwise (screen coordinates, y down). */
export function rotate(dx: number, dy: number, rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 1:
      return [-dy, dx];
    case 2:
      return [-dx, -dy];
    case 3:
      return [dy, -dx];
    default:
      return [dx, dy];
  }
}

/** Absolute pin positions of a placed part. */
export function pinPositions(p: PartInstance): { name: string; x: number; y: number }[] {
  const def = partDef(p.type);
  return def.pins.map((pin) => {
    const [dx, dy] = rotate(pin.dx, pin.dy, p.rot);
    return { name: pin.name, x: p.x + dx, y: p.y + dy };
  });
}

/** Axis-aligned bounding box of the part (body + pins), in grid units. */
export function partBounds(p: PartInstance): { x0: number; y0: number; x1: number; y1: number } {
  const def = partDef(p.type);
  const pts: [number, number][] = [
    [def.box.x, def.box.y],
    [def.box.x + def.box.w, def.box.y],
    [def.box.x, def.box.y + def.box.h],
    [def.box.x + def.box.w, def.box.y + def.box.h],
    ...def.pins.map((q) => [q.dx, q.dy] as [number, number]),
  ];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [dx, dy] of pts) {
    const [rx, ry] = rotate(dx, dy, p.rot);
    x0 = Math.min(x0, p.x + rx);
    y0 = Math.min(y0, p.y + ry);
    x1 = Math.max(x1, p.x + rx);
    y1 = Math.max(y1, p.y + ry);
  }
  return { x0: x0 - 0.3, y0: y0 - 0.3, x1: x1 + 0.3, y1: y1 + 0.3 };
}

export function partLabel(p: PartInstance, all: PartInstance[]): string {
  if (p.label) return p.label;
  const def = partDef(p.type);
  const same = all.filter((q) => partDef(q.type).prefix === def.prefix);
  return `${def.prefix}${same.indexOf(p) + 1}`;
}
