/**
 * Behavioural definitions of the logic chips. Pins are listed in package order (pin 1 first).
 * `evaluate` receives the current and previous logic level of every pin (inputs are meaningful) and the
 * chip's private state, and returns the level to drive on each output pin (null = high impedance).
 */
export type PinRole = 'in' | 'out' | 'vcc' | 'gnd' | 'nc';

export interface ChipPin {
  name: string;
  role: PinRole;
}

export interface ChipDef {
  id: string;
  name: string;
  title: string;
  family: 'HC' | '4000';
  pins: ChipPin[];
  /** Propagation delay (s). */
  tpd: number;
  /** Schmitt-trigger inputs: [falling, rising] thresholds as fractions of VCC (default ≈ VCC/2 ± 5 %). */
  schmitt?: [number, number];
  /** Output resistance (Ω) when it differs from the family default (40 Ω HC, 400 Ω 4000). */
  rout?: number;
  init(): Record<string, number>;
  evaluate(inp: boolean[], prev: boolean[], st: Record<string, number>): (boolean | null)[];
}

const P = (name: string, role: PinRole): ChipPin => ({ name, role });

function rising(inp: boolean[], prev: boolean[], i: number): boolean {
  return inp[i] && !prev[i];
}

/** Quad 2-input gate in the 7400 layout: (1,2→3) (4,5→6) (9,10→8) (12,13→11). */
function quadGate(id: string, title: string, op: (a: boolean, b: boolean) => boolean): ChipDef {
  return {
    id,
    name: id,
    title,
    family: 'HC',
    tpd: 9e-9,
    pins: [
      P('1A', 'in'),
      P('1B', 'in'),
      P('1Y', 'out'),
      P('2A', 'in'),
      P('2B', 'in'),
      P('2Y', 'out'),
      P('GND', 'gnd'),
      P('3Y', 'out'),
      P('3A', 'in'),
      P('3B', 'in'),
      P('4Y', 'out'),
      P('4A', 'in'),
      P('4B', 'in'),
      P('VCC', 'vcc'),
    ],
    init: () => ({}),
    evaluate(inp) {
      const out: (boolean | null)[] = new Array(14).fill(null);
      out[2] = op(inp[0], inp[1]);
      out[5] = op(inp[3], inp[4]);
      out[7] = op(inp[8], inp[9]);
      out[10] = op(inp[11], inp[12]);
      return out;
    },
  };
}

const C7402: ChipDef = {
  id: '7402',
  name: '7402',
  title: 'Quad 2-input NOR',
  family: 'HC',
  tpd: 9e-9,
  pins: [
    P('1Y', 'out'),
    P('1A', 'in'),
    P('1B', 'in'),
    P('2Y', 'out'),
    P('2A', 'in'),
    P('2B', 'in'),
    P('GND', 'gnd'),
    P('3A', 'in'),
    P('3B', 'in'),
    P('3Y', 'out'),
    P('4A', 'in'),
    P('4B', 'in'),
    P('4Y', 'out'),
    P('VCC', 'vcc'),
  ],
  init: () => ({}),
  evaluate(inp) {
    const out: (boolean | null)[] = new Array(14).fill(null);
    out[0] = !(inp[1] || inp[2]);
    out[3] = !(inp[4] || inp[5]);
    out[9] = !(inp[7] || inp[8]);
    out[12] = !(inp[10] || inp[11]);
    return out;
  },
};

const C7404: ChipDef = {
  id: '7404',
  name: '7404',
  title: 'Hex inverter',
  family: 'HC',
  tpd: 8e-9,
  pins: [
    P('1A', 'in'),
    P('1Y', 'out'),
    P('2A', 'in'),
    P('2Y', 'out'),
    P('3A', 'in'),
    P('3Y', 'out'),
    P('GND', 'gnd'),
    P('4Y', 'out'),
    P('4A', 'in'),
    P('5Y', 'out'),
    P('5A', 'in'),
    P('6Y', 'out'),
    P('6A', 'in'),
    P('VCC', 'vcc'),
  ],
  init: () => ({}),
  evaluate(inp) {
    const out: (boolean | null)[] = new Array(14).fill(null);
    out[1] = !inp[0];
    out[3] = !inp[2];
    out[5] = !inp[4];
    out[7] = !inp[8];
    out[9] = !inp[10];
    out[11] = !inp[12];
    return out;
  },
};

const C7474: ChipDef = {
  id: '7474',
  name: '7474',
  title: 'Dual D flip-flop with preset and clear',
  family: 'HC',
  tpd: 14e-9,
  pins: [
    P('1CLR', 'in'),
    P('1D', 'in'),
    P('1CLK', 'in'),
    P('1PRE', 'in'),
    P('1Q', 'out'),
    P('1Q̄', 'out'),
    P('GND', 'gnd'),
    P('2Q̄', 'out'),
    P('2Q', 'out'),
    P('2PRE', 'in'),
    P('2CLK', 'in'),
    P('2D', 'in'),
    P('2CLR', 'in'),
    P('VCC', 'vcc'),
  ],
  init: () => ({ q1: 0, q2: 0 }),
  evaluate(inp, prev, st) {
    const ff = (clr: number, d: number, clk: number, pre: number, key: 'q1' | 'q2'): [boolean, boolean] => {
      const c = inp[clr];
      const p = inp[pre];
      if (!p && !c) return [true, true];
      if (!p) st[key] = 1;
      else if (!c) st[key] = 0;
      else if (rising(inp, prev, clk)) st[key] = inp[d] ? 1 : 0;
      return [st[key] === 1, st[key] !== 1];
    };
    const out: (boolean | null)[] = new Array(14).fill(null);
    [out[4], out[5]] = ff(0, 1, 2, 3, 'q1');
    [out[8], out[7]] = ff(12, 11, 10, 9, 'q2');
    return out;
  },
};

const C595: ChipDef = {
  id: '74HC595',
  name: '74HC595',
  title: '8-bit shift register with output latches',
  family: 'HC',
  tpd: 16e-9,
  pins: [
    P('QB', 'out'),
    P('QC', 'out'),
    P('QD', 'out'),
    P('QE', 'out'),
    P('QF', 'out'),
    P('QG', 'out'),
    P('QH', 'out'),
    P('GND', 'gnd'),
    P("QH'", 'out'),
    P('SRCLR', 'in'),
    P('SRCLK', 'in'),
    P('RCLK', 'in'),
    P('OE', 'in'),
    P('SER', 'in'),
    P('QA', 'out'),
    P('VCC', 'vcc'),
  ],
  init: () => ({ sr: 0, st: 0 }),
  evaluate(inp, prev, st) {
    const oldSr = st.sr;
    if (rising(inp, prev, 11)) st.st = oldSr;
    if (!inp[9]) st.sr = 0;
    else if (rising(inp, prev, 10)) st.sr = ((oldSr << 1) | (inp[13] ? 1 : 0)) & 0xff;
    const out: (boolean | null)[] = new Array(16).fill(null);
    const oe = !inp[12];
    const bit = (b: number) => (oe ? ((st.st >> b) & 1) === 1 : null);
    out[14] = bit(0);
    for (let b = 1; b <= 7; b++) out[b - 1] = bit(b);
    out[8] = ((st.sr >> 7) & 1) === 1;
    return out;
  },
};

const C138: ChipDef = {
  id: '74HC138',
  name: '74HC138',
  title: '3-to-8 line decoder (active-low outputs)',
  family: 'HC',
  tpd: 12e-9,
  pins: [
    P('A', 'in'),
    P('B', 'in'),
    P('C', 'in'),
    P('G2A', 'in'),
    P('G2B', 'in'),
    P('G1', 'in'),
    P('Y7', 'out'),
    P('GND', 'gnd'),
    P('Y6', 'out'),
    P('Y5', 'out'),
    P('Y4', 'out'),
    P('Y3', 'out'),
    P('Y2', 'out'),
    P('Y1', 'out'),
    P('Y0', 'out'),
    P('VCC', 'vcc'),
  ],
  init: () => ({}),
  evaluate(inp) {
    const out: (boolean | null)[] = new Array(16).fill(null);
    const yPins = [14, 13, 12, 11, 10, 9, 8, 6];
    const en = inp[5] && !inp[3] && !inp[4];
    const sel = (inp[0] ? 1 : 0) + (inp[1] ? 2 : 0) + (inp[2] ? 4 : 0);
    yPins.forEach((p, n) => (out[p] = !(en && n === sel)));
    return out;
  },
};

const C161: ChipDef = {
  id: '74HC161',
  name: '74HC161',
  title: '4-bit synchronous binary counter',
  family: 'HC',
  tpd: 18e-9,
  pins: [
    P('CLR', 'in'),
    P('CLK', 'in'),
    P('A', 'in'),
    P('B', 'in'),
    P('C', 'in'),
    P('D', 'in'),
    P('ENP', 'in'),
    P('GND', 'gnd'),
    P('LOAD', 'in'),
    P('ENT', 'in'),
    P('QD', 'out'),
    P('QC', 'out'),
    P('QB', 'out'),
    P('QA', 'out'),
    P('RCO', 'out'),
    P('VCC', 'vcc'),
  ],
  init: () => ({ q: 0 }),
  evaluate(inp, prev, st) {
    if (!inp[0]) st.q = 0;
    else if (rising(inp, prev, 1)) {
      if (!inp[8]) st.q = (inp[2] ? 1 : 0) | (inp[3] ? 2 : 0) | (inp[4] ? 4 : 0) | (inp[5] ? 8 : 0);
      else if (inp[6] && inp[9]) st.q = (st.q + 1) & 15;
    }
    const out: (boolean | null)[] = new Array(16).fill(null);
    out[13] = (st.q & 1) !== 0;
    out[12] = (st.q & 2) !== 0;
    out[11] = (st.q & 4) !== 0;
    out[10] = (st.q & 8) !== 0;
    out[14] = inp[9] && st.q === 15;
    return out;
  },
};

const C4017: ChipDef = {
  id: 'CD4017',
  name: 'CD4017',
  title: 'Decade counter with 10 decoded outputs',
  family: '4000',
  tpd: 150e-9,
  pins: [
    P('Q5', 'out'),
    P('Q1', 'out'),
    P('Q0', 'out'),
    P('Q2', 'out'),
    P('Q6', 'out'),
    P('Q7', 'out'),
    P('Q3', 'out'),
    P('VSS', 'gnd'),
    P('Q8', 'out'),
    P('Q4', 'out'),
    P('Q9', 'out'),
    P('CO', 'out'),
    P('INH', 'in'),
    P('CLK', 'in'),
    P('RST', 'in'),
    P('VDD', 'vcc'),
  ],
  init: () => ({ n: 0 }),
  evaluate(inp, prev, st) {
    if (inp[14]) st.n = 0;
    else if (!inp[12] && rising(inp, prev, 13)) st.n = (st.n + 1) % 10;
    const out: (boolean | null)[] = new Array(16).fill(null);
    const qPins = [2, 1, 3, 6, 9, 0, 4, 5, 8, 10];
    qPins.forEach((p, k) => (out[p] = st.n === k));
    out[11] = st.n < 5;
    return out;
  },
};

/** 74HC14: the 7404 pinout with Schmitt-trigger inputs (VT+ ≈ 0.53·VCC, VT− ≈ 0.31·VCC). */
const C7414: ChipDef = {
  ...C7404,
  id: '74HC14',
  name: '74HC14',
  title: 'Hex Schmitt-trigger inverter',
  tpd: 11e-9,
  schmitt: [0.31, 0.53],
};

/** Segments a–g lit for each BCD digit (CD4511: "tailless" 6 and 9). */
const BCD_SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7c, 0x07, 0x7f, 0x67];

const C4511: ChipDef = {
  id: 'CD4511',
  name: 'CD4511',
  title: 'BCD to 7-segment latch / decoder / driver',
  family: '4000',
  tpd: 600e-9,
  // bipolar source-follower outputs: strong enough to drive LED segments through resistors
  rout: 60,
  pins: [
    P('B', 'in'),
    P('C', 'in'),
    P('LT', 'in'),
    P('BI', 'in'),
    P('LE', 'in'),
    P('D', 'in'),
    P('A', 'in'),
    P('VSS', 'gnd'),
    P('e', 'out'),
    P('d', 'out'),
    P('c', 'out'),
    P('b', 'out'),
    P('a', 'out'),
    P('g', 'out'),
    P('f', 'out'),
    P('VDD', 'vcc'),
  ],
  init: () => ({ latch: 0 }),
  evaluate(inp, _prev, st) {
    // LE low: transparent; LE high: hold the last code
    if (!inp[4]) st.latch = (inp[6] ? 1 : 0) | (inp[0] ? 2 : 0) | (inp[1] ? 4 : 0) | (inp[5] ? 8 : 0);
    const lampTest = !inp[2];
    const blank = !inp[3];
    const bits = lampTest ? 0x7f : blank ? 0 : (BCD_SEGMENTS[st.latch] ?? 0);
    const out: (boolean | null)[] = new Array(16).fill(null);
    // a b c d e f g → pins 13 12 11 10 9 15 14
    [12, 11, 10, 9, 8, 14, 13].forEach((pin, k) => (out[pin] = ((bits >> k) & 1) === 1));
    return out;
  },
};

const C283: ChipDef = {
  id: '74HC283',
  name: '74HC283',
  title: '4-bit binary full adder with fast carry',
  family: 'HC',
  tpd: 20e-9,
  pins: [
    P('Σ2', 'out'),
    P('B2', 'in'),
    P('A2', 'in'),
    P('Σ1', 'out'),
    P('A1', 'in'),
    P('B1', 'in'),
    P('C0', 'in'),
    P('GND', 'gnd'),
    P('C4', 'out'),
    P('Σ4', 'out'),
    P('B4', 'in'),
    P('A4', 'in'),
    P('Σ3', 'out'),
    P('A3', 'in'),
    P('B3', 'in'),
    P('VCC', 'vcc'),
  ],
  init: () => ({}),
  evaluate(inp) {
    const bit = (i: number) => (inp[i] ? 1 : 0);
    const a = bit(4) | (bit(2) << 1) | (bit(13) << 2) | (bit(11) << 3);
    const b = bit(5) | (bit(1) << 1) | (bit(14) << 2) | (bit(10) << 3);
    const sum = a + b + bit(6);
    const out: (boolean | null)[] = new Array(16).fill(null);
    [3, 0, 12, 9, 8].forEach((pin, k) => (out[pin] = ((sum >> k) & 1) === 1));
    return out;
  },
};

export const CHIPS: Record<string, ChipDef> = {
  '7400': quadGate('7400', 'Quad 2-input NAND', (a, b) => !(a && b)),
  '7402': C7402,
  '7404': C7404,
  '7408': quadGate('7408', 'Quad 2-input AND', (a, b) => a && b),
  '7432': quadGate('7432', 'Quad 2-input OR', (a, b) => a || b),
  '7486': quadGate('7486', 'Quad 2-input XOR', (a, b) => a !== b),
  '7474': C7474,
  '74HC595': C595,
  '74HC138': C138,
  '74HC161': C161,
  CD4017: C4017,
  '74HC14': C7414,
  CD4511: C4511,
  '74HC283': C283,
};
