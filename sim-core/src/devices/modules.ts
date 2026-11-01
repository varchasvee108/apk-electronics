import { Device, type Ratings } from '../device';
import type { Stamper } from '../stamper';
import type { DeviceReading, ElementSpec } from '../types';

/**
 * Sensor and driver modules from typical starter kits. Digital decisions are made in accept() (after an
 * accepted step), with crossing() locating input thresholds exactly, the same scheme the logic chips use.
 */

const OPEN = 1e-9;

/** Fraction (0..1] of the step where v crosses thr in the given direction, or 1. */
function cross(a: number, b: number, thr: number, rising: boolean): number {
  if (rising ? a < thr && b >= thr : a > thr && b <= thr) return Math.max(1e-6, (thr - a) / (b - a));
  return 1;
}

// ------------------------------------------------------------------ digital sensor output (PIR, IR, Hall)

/**
 * A sensor module with one digital output. Nodes [VCC, OUT, GND]. Params: `active` (the stimulus:
 * motion, obstacle, magnet…), `hold` (s, output stays asserted that long after the stimulus, like a PIR),
 * `activeLow`, `oc` (open-collector output: only pulls low), `rq` (supply current as a resistance).
 */
export class SensorOut extends Device {
  asserted = false;
  powered = false;
  private lastActive = -Infinity;
  private tNow = 0;

  private rout(): number {
    return this.num('rout', 100);
  }
  private level(): boolean {
    return this.asserted !== this.bool('activeLow', false);
  }
  initTransient(): void {
    this.asserted = false;
    this.lastActive = -Infinity;
  }
  stamp(s: Stamper): void {
    const [vcc, out, gnd] = this.nodes;
    s.conductance(vcc, gnd, 1 / this.num('rq', 20000));
    if (!this.powered || this.failed) {
      s.conductance(out, gnd, OPEN);
      return;
    }
    const g = 1 / this.rout();
    const hi = this.level();
    if (this.bool('oc', false)) s.conductance(out, gnd, hi ? OPEN : g);
    else s.conductance(out, hi ? vcc : gnd, g);
  }
  private decide(x: Float64Array, t: number): boolean {
    const powered = !this.failed && this.pv(x, 0) - this.pv(x, 2) > 2.5;
    const stim = this.bool('active', false);
    if (stim) this.lastActive = t;
    const hold = this.num('hold', 0);
    const asserted = powered && (stim || (hold > 0 && t - this.lastActive < hold - 1e-9));
    const changed = asserted !== this.asserted || powered !== this.powered;
    this.asserted = asserted;
    this.powered = powered;
    return changed;
  }
  postConverge(x: Float64Array): boolean {
    return this.decide(x, this.tNow);
  }
  accept(x: Float64Array, t: number): boolean {
    this.tNow = t;
    return this.decide(x, t);
  }
  nextBreakpoint(t: number): number {
    const hold = this.num('hold', 0);
    const end = this.lastActive + hold;
    return this.asserted && hold > 0 && end > t ? end : Infinity;
  }
  read(x: Float64Array): DeviceReading {
    const [vcc, out, gnd] = [this.pv(x, 0), this.pv(x, 1), this.pv(x, 2)];
    const iq = (vcc - gnd) / this.num('rq', 20000);
    let io = 0;
    let toVcc = false;
    if (this.powered && !this.failed) {
      const hi = this.level();
      const g = 1 / this.rout();
      if (this.bool('oc', false)) io = hi ? 0 : (out - gnd) * g;
      else {
        toVcc = hi;
        io = (out - (hi ? vcc : gnd)) * g;
      }
    }
    return {
      v: out - gnd,
      i: io,
      p: (vcc - gnd) * iq,
      pinI: [iq - (toVcc ? io : 0), io, -iq - (toVcc ? 0 : io)],
      extra: { detected: this.asserted, out: this.level() ? 'HIGH' : 'LOW', powered: this.powered },
    };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), asserted: this.asserted, powered: this.powered, lastActive: this.lastActive };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { asserted?: boolean; powered?: boolean; lastActive?: number } | null;
    if (!st) return;
    if (typeof st.asserted === 'boolean') this.asserted = st.asserted;
    if (typeof st.powered === 'boolean') this.powered = st.powered;
    if (typeof st.lastActive === 'number') this.lastActive = st.lastActive;
  }
}

// ------------------------------------------------------------------ HC-SR04 ultrasonic ranger

const TRIG_HI = 1.6;
const TRIG_LO = 1.2;
const SOUND = 343; // m/s

/**
 * HC-SR04. Nodes [VCC, TRIG, ECHO, GND]. A TRIG pulse of at least 10 µs starts a measurement: after the
 * 40 kHz burst (≈0.45 ms) ECHO goes high for the round-trip time of sound, 2·d / 343 m/s
 * (58 µs per cm). Out of range (> 4 m) it returns a 38 ms timeout pulse. Param `dist` in cm.
 */
export class Sonar extends Device {
  private trigHigh = false;
  private trigRise = -1;
  echoStart = -1;
  echoEnd = -1;
  echo = false;
  powered = false;
  lastWidth = 0;

  initTransient(): void {
    this.trigHigh = false;
    this.trigRise = -1;
    this.echoStart = -1;
    this.echoEnd = -1;
    this.echo = false;
  }
  private trig(x: Float64Array): number {
    return this.pv(x, 1) - this.pv(x, 3);
  }
  stamp(s: Stamper): void {
    const [vcc, trig, echo, gnd] = this.nodes;
    s.conductance(vcc, gnd, 1 / 333);
    s.conductance(trig, gnd, 1e-5);
    if (this.powered && !this.failed) s.conductance(echo, this.echo ? vcc : gnd, 1 / 100);
    else s.conductance(echo, gnd, OPEN);
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    return this.trigHigh ? cross(this.trig(xOld), this.trig(xNew), TRIG_LO, false) : cross(this.trig(xOld), this.trig(xNew), TRIG_HI, true);
  }
  nextBreakpoint(t: number): number {
    if (this.echoStart > t) return this.echoStart;
    if (this.echoEnd > t) return this.echoEnd;
    return Infinity;
  }
  postConverge(x: Float64Array): boolean {
    const p = !this.failed && this.pv(x, 0) - this.pv(x, 3) > 3.5;
    if (p === this.powered) return false;
    this.powered = p;
    return true;
  }
  accept(x: Float64Array, t: number): boolean {
    const powered = !this.failed && this.pv(x, 0) - this.pv(x, 3) > 3.5;
    let disc = powered !== this.powered;
    this.powered = powered;
    const v = this.trig(x);
    if (!this.trigHigh && v >= TRIG_HI) {
      this.trigHigh = true;
      this.trigRise = t;
    } else if (this.trigHigh && v <= TRIG_LO) {
      this.trigHigh = false;
      const busy = this.echoEnd > t;
      if (powered && !busy && t - this.trigRise >= 8e-6) {
        const d = Math.max(2, this.num('dist', 50)) / 100;
        const width = d > 4 ? 0.038 : (2 * d) / SOUND;
        this.echoStart = t + 0.45e-3;
        this.echoEnd = this.echoStart + width;
        this.lastWidth = width;
      }
    }
    const echo = powered && this.echoStart >= 0 && t >= this.echoStart - 1e-12 && t < this.echoEnd - 1e-12;
    if (echo !== this.echo) {
      this.echo = echo;
      disc = true;
    }
    return disc;
  }
  read(x: Float64Array): DeviceReading {
    const vs = this.pv(x, 0) - this.pv(x, 3);
    const iq = vs / 333;
    const ve = this.pv(x, 2);
    const ie = this.powered ? (ve - (this.echo ? this.pv(x, 0) : this.pv(x, 3))) / 100 : 0;
    const it = this.trig(x) * 1e-5;
    return {
      v: vs,
      i: iq,
      p: vs * iq,
      pinI: [iq - (this.echo ? ie : 0), it, ie, -iq - it - (this.echo ? 0 : ie)],
      extra: { dist: this.num('dist', 50), echo: this.echo, pulse: this.lastWidth, powered: this.powered },
    };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), trigHigh: this.trigHigh, trigRise: this.trigRise, echoStart: this.echoStart, echoEnd: this.echoEnd, echo: this.echo, powered: this.powered };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as Partial<Record<'trigHigh' | 'echo' | 'powered', boolean> & Record<'trigRise' | 'echoStart' | 'echoEnd', number>> | null;
    if (!st) return;
    Object.assign(this, st);
  }
}

// ------------------------------------------------------------------ L293D dual H-bridge

/** Pin indices (0-based) of the L293D DIP-16. */
const HB = { en: [0, 0, 8, 8], a: [1, 6, 9, 14], y: [2, 5, 10, 13], gnd: 3, vcc2: 7, vcc1: 15 };

/**
 * L293D quadruple half-H driver. Nodes in DIP pin order (1–16). Each output follows its A input
 * (HIGH → VCC2, LOW → GND) while its enable pin is high, and floats when disabled. Inputs are TTL
 * (high above 2 V). Output resistance ≈ 2 Ω (the real part drops 1–2 V at 0.5 A). The clamp diodes are
 * separate elements (see the part definition).
 */
export class HBridge extends Device {
  drive: (0 | 1 | null)[] = [null, null, null, null];
  private lv: boolean[] = new Array(16).fill(false);

  private in(x: Float64Array, i: number): boolean {
    const v = this.pv(x, i) - this.pv(x, HB.gnd);
    return this.lv[i] ? v > 1.5 : v > 2.0;
  }
  private compute(x: Float64Array): boolean {
    const logic = !this.failed && this.pv(x, HB.vcc1) - this.pv(x, HB.gnd) > 4;
    for (const i of [...HB.a, 0, 8]) this.lv[i] = this.in(x, i);
    let changed = false;
    for (let k = 0; k < 4; k++) {
      const d: 0 | 1 | null = logic && this.lv[HB.en[k]] ? (this.lv[HB.a[k]] ? 1 : 0) : null;
      if (d !== this.drive[k]) {
        this.drive[k] = d;
        changed = true;
      }
    }
    return changed;
  }
  initTransient(): void {
    this.drive = [null, null, null, null];
    this.lv.fill(false);
  }
  stamp(s: Stamper): void {
    const n = this.nodes;
    s.conductance(n[HB.vcc1], n[HB.gnd], 1 / 250);
    s.conductance(n[HB.vcc2], n[HB.gnd], 1e-6);
    for (const i of [...HB.a, 0, 8]) s.conductance(n[i], n[HB.gnd], 1e-5);
    for (let k = 0; k < 4; k++) {
      const d = this.drive[k];
      if (d === null) continue;
      s.conductance(n[HB.y[k]], n[d ? HB.vcc2 : HB.gnd], 1 / this.num('ron', 2));
    }
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    let f = 1;
    const g0 = this.pv(xOld, HB.gnd);
    const g1 = this.pv(xNew, HB.gnd);
    for (const i of [...HB.a, 0, 8]) {
      const a = this.pv(xOld, i) - g0;
      const b = this.pv(xNew, i) - g1;
      f = Math.min(f, this.lv[i] ? cross(a, b, 1.5, false) : cross(a, b, 2.0, true));
    }
    return f;
  }
  postConverge(x: Float64Array): boolean {
    return this.compute(x);
  }
  accept(x: Float64Array): boolean {
    return this.compute(x);
  }
  read(x: Float64Array): DeviceReading {
    const n = this.nodes;
    const pinI = new Array(16).fill(0);
    const ron = this.num('ron', 2);
    let p = 0;
    for (let k = 0; k < 4; k++) {
      const d = this.drive[k];
      if (d === null) continue;
      const tgt = d ? HB.vcc2 : HB.gnd;
      const io = (this.pv(x, HB.y[k]) - this.pv(x, tgt)) / ron;
      pinI[HB.y[k]] += io;
      pinI[tgt] -= io;
      p += io * io * ron;
    }
    const iq = (this.pv(x, HB.vcc1) - this.pv(x, HB.gnd)) / 250;
    pinI[HB.vcc1] += iq;
    pinI[HB.gnd] -= iq;
    void n;
    const sym = (d: 0 | 1 | null) => (d === null ? 'off' : d ? '+' : '−');
    return {
      v: this.pv(x, HB.vcc2) - this.pv(x, HB.gnd),
      i: -pinI[HB.vcc2],
      p,
      pinI,
      extra: { out1: sym(this.drive[0]), out2: sym(this.drive[1]), out3: sym(this.drive[2]), out4: sym(this.drive[3]) },
    };
  }
  ratings(): Ratings | null {
    return null;
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), drive: this.drive.slice(), lv: this.lv.slice() };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { drive?: (0 | 1 | null)[]; lv?: boolean[] } | null;
    if (st?.drive) this.drive = st.drive.slice();
    if (st?.lv) this.lv = st.lv.slice();
  }
}

// ------------------------------------------------------------------ ULN2003 Darlington array

/**
 * ULN2003A: seven Darlington sinks. Nodes in DIP order: IN1–IN7 (pins 1–7), GND (8), COM (9),
 * OUT7–OUT1 (pins 10–16). An input above ≈1.4 V turns its output on (pulls it to ground through ≈4 Ω,
 * about 1 V at 250 mA). Inputs draw current through the 2.7 kΩ base resistor. Clamp diodes OUT → COM
 * are separate elements.
 */
export class Darlington extends Device {
  on: boolean[] = new Array(7).fill(false);
  private outIdx(k: number): number {
    return 15 - k; // OUT1 is pin 16
  }
  private compute(x: Float64Array): boolean {
    let changed = false;
    const g = this.pv(x, 7);
    for (let k = 0; k < 7; k++) {
      const v = this.pv(x, k) - g;
      const on = !this.failed && (this.on[k] ? v > 1.2 : v > 1.4);
      if (on !== this.on[k]) {
        this.on[k] = on;
        changed = true;
      }
    }
    return changed;
  }
  initTransient(): void {
    this.on.fill(false);
  }
  stamp(s: Stamper): void {
    const n = this.nodes;
    for (let k = 0; k < 7; k++) {
      s.conductance(n[k], n[7], 1 / 3500);
      s.conductance(n[this.outIdx(k)], n[7], this.on[k] ? 1 / this.num('ron', 4) : OPEN);
    }
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    let f = 1;
    for (let k = 0; k < 7; k++) {
      const a = this.pv(xOld, k) - this.pv(xOld, 7);
      const b = this.pv(xNew, k) - this.pv(xNew, 7);
      f = Math.min(f, this.on[k] ? cross(a, b, 1.2, false) : cross(a, b, 1.4, true));
    }
    return f;
  }
  postConverge(x: Float64Array): boolean {
    return this.compute(x);
  }
  accept(x: Float64Array): boolean {
    return this.compute(x);
  }
  read(x: Float64Array): DeviceReading {
    const pinI = new Array(16).fill(0);
    const g = this.pv(x, 7);
    let total = 0;
    for (let k = 0; k < 7; k++) {
      const ii = (this.pv(x, k) - g) / 3500;
      pinI[k] += ii;
      pinI[7] -= ii;
      const io = this.on[k] ? (this.pv(x, this.outIdx(k)) - g) / this.num('ron', 4) : 0;
      pinI[this.outIdx(k)] += io;
      pinI[7] -= io;
      total += io;
    }
    return { v: 0, i: total, p: 0, pinI, extra: { on: this.on.map((b) => (b ? '1' : '0')).join('') } };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), on: this.on.slice() };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { on?: boolean[] } | null;
    if (st?.on) this.on = st.on.slice();
  }
}

// ------------------------------------------------------------------ 28BYJ-48 unipolar stepper

/**
 * 28BYJ-48 geared stepper. Nodes [A, B, C, D, COM]. Each coil is ≈50 Ω from COM (+5 V) to its lead; a
 * driver (ULN2003) pulls the leads low in sequence. The energised coils set a magnetic angle (A = 0°,
 * B = 90°, C = 180°, D = 270° electrical); the rotor follows the shortest way round. One electrical turn
 * is four full steps; with the 64:1 gearbox the shaft needs 2048 full steps per revolution.
 */
export class Stepper extends Device {
  elec = 0; // accumulated electrical angle (degrees)
  private lastField: number | null = null;
  rpm = 0;
  private lastT = 0;
  private lastElec = 0;
  energized = '';

  private rc(): number {
    return this.num('rcoil', 50);
  }
  initTransient(): void {
    this.elec = this.num('elec0', 0);
    this.lastField = null;
    this.rpm = 0;
    this.lastT = 0;
    this.lastElec = this.elec;
  }
  stamp(s: Stamper): void {
    const g = this.failed ? OPEN : 1 / this.rc();
    for (let k = 0; k < 4; k++) s.conductance(this.nodes[4], this.nodes[k], g);
  }
  private coilI(x: Float64Array, k: number): number {
    return (this.pv(x, 4) - this.pv(x, k)) / this.rc();
  }
  accept(x: Float64Array, t: number): boolean {
    let fx = 0;
    let fy = 0;
    let names = '';
    for (let k = 0; k < 4; k++) {
      if (this.coilI(x, k) > 0.04) {
        const a = (k * Math.PI) / 2;
        fx += Math.cos(a);
        fy += Math.sin(a);
        names += 'ABCD'[k];
      }
    }
    this.energized = names;
    if (Math.hypot(fx, fy) > 0.5) {
      const field = (Math.atan2(fy, fx) * 180) / Math.PI;
      if (this.lastField === null) {
        // first energised position: the rotor snaps to the nearest pole
        const cur = ((this.elec % 360) + 360) % 360;
        let d = field - cur;
        d = ((d + 540) % 360) - 180;
        this.elec += d;
      } else {
        let d = field - this.lastField;
        d = ((d + 540) % 360) - 180;
        // two coils swapped at once (180°) cannot tell the direction: the rotor just jitters
        if (Math.abs(d) < 179) this.elec += d;
      }
      this.lastField = field;
    }
    const dt = t - this.lastT;
    if (dt >= 0.05) {
      const revs = (this.elec - this.lastElec) / (360 * 512);
      this.rpm = 0.5 * this.rpm + 0.5 * ((revs / dt) * 60);
      this.lastT = t;
      this.lastElec = this.elec;
    }
    return false;
  }
  /** Shaft angle in degrees (2048 full steps of 90° electrical per revolution). */
  get angle(): number {
    return this.elec / 512;
  }
  read(x: Float64Array): DeviceReading {
    const pinI = [0, 1, 2, 3].map((k) => -this.coilI(x, k));
    const total = -pinI.reduce((a, b) => a + b, 0);
    let p = 0;
    for (let k = 0; k < 4; k++) p += this.coilI(x, k) ** 2 * this.rc();
    return {
      v: this.pv(x, 4),
      i: total,
      p,
      pinI: [...pinI, total],
      extra: { angle: this.angle, steps: Math.round(this.elec / 90), rpm: this.rpm, coils: this.energized || 'none' },
    };
  }
  ratings(): Ratings | null {
    return { maxP: 1.5, tau: 3, failAt: 1.6 };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), elec: this.elec, lastField: this.lastField, rpm: this.rpm, lastT: this.lastT, lastElec: this.lastElec };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as Partial<Pick<Stepper, 'elec' | 'rpm'>> & { lastField?: number | null; lastT?: number; lastElec?: number };
    if (!st) return;
    if (typeof st.elec === 'number') this.elec = st.elec;
    if (st.lastField !== undefined) this.lastField = st.lastField;
    if (typeof st.rpm === 'number') this.rpm = st.rpm;
    if (typeof st.lastT === 'number') this.lastT = st.lastT;
    if (typeof st.lastElec === 'number') this.lastElec = st.lastElec;
  }
}

// ------------------------------------------------------------------ 16×2 character LCD (HD44780)

/** Pin indices of the 16-pin LCD header. */
const L = { vss: 0, vdd: 1, v0: 2, rs: 3, rw: 4, e: 5, d0: 6 };

/**
 * HD44780-compatible 16×2 character LCD. Nodes in header order: VSS, VDD, V0, RS, RW, E, D0–D7, A, K
 * (the backlight LED is a separate element). Data is latched on the falling edge of E, in 8-bit mode
 * after power-up or 4-bit mode after a function-set with DL = 0 (the usual Arduino init sequence).
 * Supported: clear, home, entry mode (increment / decrement), display on/off, function set, set DDRAM
 * address and writing characters. The busy flag is not modelled: programs must wait ≥ 2 ms after clear.
 */
export class Lcd extends Device {
  ddram = new Array<number>(128).fill(32);
  addr = 0;
  eightBit = true;
  private nibble: number | null = null;
  displayOn = false;
  private inc = true;
  private eHigh = false;
  powered = false;
  writes = 0;

  private reset(): void {
    this.ddram.fill(32);
    this.addr = 0;
    this.eightBit = true;
    this.nibble = null;
    this.displayOn = false;
    this.inc = true;
  }
  initTransient(): void {
    this.reset();
    this.eHigh = false;
    this.powered = false;
  }
  stamp(s: Stamper): void {
    const n = this.nodes;
    s.conductance(n[L.vdd], n[L.vss], 1 / 5000);
    s.conductance(n[L.v0], n[L.vss], 1e-6);
    for (let k = L.rs; k <= L.d0 + 7; k++) s.conductance(n[k], n[L.vss], 1e-6);
  }
  private hi(x: Float64Array, k: number): boolean {
    const vs = this.pv(x, L.vdd) - this.pv(x, L.vss);
    return this.pv(x, k) - this.pv(x, L.vss) > 0.5 * vs;
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    const vs = this.pv(xNew, L.vdd) - this.pv(xNew, L.vss);
    const a = this.pv(xOld, L.e) - this.pv(xOld, L.vss);
    const b = this.pv(xNew, L.e) - this.pv(xNew, L.vss);
    return this.eHigh ? cross(a, b, 0.4 * vs, false) : 1;
  }
  private step(): void {
    const a = this.addr;
    if (this.inc) this.addr = a === 0x27 ? 0x40 : a === 0x67 ? 0 : (a + 1) & 0x7f;
    else this.addr = a === 0 ? 0x67 : a === 0x40 ? 0x27 : (a - 1) & 0x7f;
  }
  private exec(rs: boolean, b: number): void {
    this.writes++;
    if (rs) {
      this.ddram[this.addr] = b;
      this.step();
      return;
    }
    if (b & 0x80) this.addr = b & 0x7f;
    else if (b & 0x40) return; // CGRAM address (custom characters): not modelled
    else if (b & 0x20) {
      const eight = !!(b & 0x10);
      if (eight !== this.eightBit) this.nibble = null;
      this.eightBit = eight;
    } else if (b & 0x10) return; // cursor / display shift
    else if (b & 0x08) this.displayOn = !!(b & 0x04);
    else if (b & 0x04) this.inc = !!(b & 0x02);
    else if (b & 0x02) this.addr = 0;
    else if (b & 0x01) {
      this.ddram.fill(32);
      this.addr = 0;
      this.inc = true;
    }
  }
  accept(x: Float64Array): boolean {
    const powered = !this.failed && this.pv(x, L.vdd) - this.pv(x, L.vss) > 4;
    if (!powered) {
      if (this.powered) this.reset();
      this.powered = false;
      this.eHigh = false;
      return false;
    }
    this.powered = true;
    const e = this.hi(x, L.e);
    if (this.eHigh && !e && !this.hi(x, L.rw)) {
      const rs = this.hi(x, L.rs);
      let bits = 0;
      for (let k = 0; k < 8; k++) if (this.hi(x, L.d0 + k)) bits |= 1 << k;
      if (this.eightBit) this.exec(rs, bits);
      else {
        const nib = bits >> 4;
        if (this.nibble === null) this.nibble = nib;
        else {
          const b = (this.nibble << 4) | nib;
          this.nibble = null;
          this.exec(rs, b);
        }
      }
    }
    this.eHigh = e;
    return false;
  }
  private line(base: number): string {
    let s = '';
    for (let k = 0; k < 16; k++) {
      const c = this.ddram[base + k];
      s += c === 0xdf ? '°' : c >= 32 && c < 127 ? String.fromCharCode(c) : ' ';
    }
    return s;
  }
  read(x: Float64Array): DeviceReading {
    const vs = this.pv(x, L.vdd) - this.pv(x, L.vss);
    const contrast = vs > 0.5 ? Math.max(0, Math.min(1, 1 - (this.pv(x, L.v0) - this.pv(x, L.vss)) / vs)) : 0;
    const i = vs / 5000;
    const pinI = new Array(16).fill(0);
    pinI[L.vdd] = i;
    pinI[L.vss] = -i;
    return {
      v: vs,
      i,
      p: vs * i,
      pinI,
      extra: { line1: this.line(0), line2: this.line(0x40), on: this.powered && this.displayOn, contrast, mode: this.eightBit ? '8-bit' : '4-bit' },
    };
  }
  saveState(): unknown {
    return {
      ...(super.saveState() as object),
      ddram: this.ddram.slice(),
      addr: this.addr,
      eightBit: this.eightBit,
      nibble: this.nibble,
      displayOn: this.displayOn,
      inc: this.inc,
      eHigh: this.eHigh,
      powered: this.powered,
    };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as Partial<{ ddram: number[]; addr: number; eightBit: boolean; nibble: number | null; displayOn: boolean; inc: boolean; eHigh: boolean; powered: boolean }> | null;
    if (!st) return;
    if (st.ddram) this.ddram = st.ddram.slice();
    if (typeof st.addr === 'number') this.addr = st.addr;
    if (typeof st.eightBit === 'boolean') this.eightBit = st.eightBit;
    if (st.nibble !== undefined) this.nibble = st.nibble;
    if (typeof st.displayOn === 'boolean') this.displayOn = st.displayOn;
    if (typeof st.inc === 'boolean') this.inc = st.inc;
    if (typeof st.eHigh === 'boolean') this.eHigh = st.eHigh;
    if (typeof st.powered === 'boolean') this.powered = st.powered;
  }
}

// ------------------------------------------------------------------ battery that runs down

/**
 * Battery with a state of charge. Nodes [+, −]. Coulomb counting: the charge falls by the delivered
 * current over time (capacity `mah`); the EMF follows a simple discharge curve: flat-ish from 100 % to
 * 10 % (falling from 1.0 to 0.8 × nominal), then collapsing to zero.
 */
export class Cell extends Device {
  soc = 1;
  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 1;
  }
  emf(): number {
    const v = this.num('v', 9);
    const q = this.soc;
    return q > 0.1 ? v * (0.78 + 0.22 * q) : v * 0.8 * Math.max(0, q / 0.1);
  }
  initTransient(): void {
    this.soc = Math.max(0, Math.min(1, this.num('soc0', 1)));
  }
  stamp(s: Stamper): void {
    s.vsource(this.nodes[0], this.nodes[1], this.br0, this.emf() * s.srcScale, this.num('r', 0.5));
  }
  accept(x: Float64Array, _t: number, dt: number): boolean {
    const delivered = -x[this.br0];
    const cap = Math.max(1e-6, this.num('mah', 500)) * 3.6; // coulombs
    this.soc = Math.max(0, Math.min(1, this.soc - (delivered * dt) / cap));
    return false;
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const iInto = x[this.br0];
    return { v, i: -iInto, p: v * iInto, pinI: [iInto, -iInto], extra: { charge: this.soc, emf: this.emf() } };
  }
  ratings(): Ratings | null {
    const maxI = this.num('maxI', 0);
    return maxI > 0 ? { maxI } : null;
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), soc: this.soc };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { soc?: number } | null;
    if (typeof st?.soc === 'number') this.soc = st.soc;
  }
}
