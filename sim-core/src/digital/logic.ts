import { Device, type Ratings } from '../device';
import type { Stamper } from '../stamper';
import type { DeviceReading, ElementSpec } from '../types';
import { CHIPS, type ChipDef } from './chips';

interface PendingEvent {
  t: number;
  pin: number;
  level: boolean | null;
}

/**
 * Mixed-signal wrapper around a ChipDef. Inputs are sampled from the analog solution with a
 * threshold of VCC/2 (±5 % hysteresis); outputs are resistive drivers to the chip's own VCC / GND pins,
 * so output current really flows through the supply pins. Output changes are scheduled after the
 * propagation delay through an event queue and become simulator breakpoints.
 */
export class LogicChip extends Device {
  def: ChipDef;
  inLv: boolean[];
  prevLv: boolean[];
  outLv: (boolean | null)[];
  pending: PendingEvent[] = [];
  st: Record<string, number>;
  powered = false;
  private vccIdx: number;
  private gndIdx: number;
  /** Logic levels of every pin as last seen (for the logic analyzer). */
  levels: boolean[];

  constructor(spec: ElementSpec) {
    super(spec);
    const def = CHIPS[String(spec.params.chip)];
    if (!def) throw new Error(`Unknown chip ${String(spec.params.chip)}`);
    this.def = def;
    const n = def.pins.length;
    this.inLv = new Array(n).fill(false);
    this.prevLv = new Array(n).fill(false);
    this.outLv = new Array(n).fill(null);
    this.levels = new Array(n).fill(false);
    this.st = def.init();
    this.vccIdx = def.pins.findIndex((p) => p.role === 'vcc');
    this.gndIdx = def.pins.findIndex((p) => p.role === 'gnd');
  }

  get rout(): number {
    return this.def.family === '4000' ? 400 : 40;
  }
  get vmin(): number {
    return this.def.family === '4000' ? 3 : 2;
  }

  initTransient(): void {
    this.powered = false;
    this.pending = [];
    this.outLv.fill(null);
    this.st = this.def.init();
  }

  stamp(s: Stamper): void {
    const vcc = this.nodes[this.vccIdx];
    const gnd = this.nodes[this.gndIdx];
    s.conductance(vcc, gnd, 1e-6);
    if (!this.powered || this.failed) return;
    const g = 1 / this.rout;
    for (let i = 0; i < this.def.pins.length; i++) {
      const lv = this.outLv[i];
      if (lv === null || this.def.pins[i].role !== 'out') continue;
      s.conductance(this.nodes[i], lv ? vcc : gnd, g);
    }
  }

  private supply(x: Float64Array): number {
    return this.pv(x, this.vccIdx) - this.pv(x, this.gndIdx);
  }

  private level(x: Float64Array, i: number, prev: boolean): boolean {
    const vs = this.supply(x);
    const v = this.pv(x, i) - this.pv(x, this.gndIdx);
    const th = vs / 2;
    const h = 0.05 * vs;
    if (prev) return v > th - h;
    return v > th + h;
  }

  private sampleInputs(x: Float64Array): boolean {
    let changed = false;
    for (let i = 0; i < this.def.pins.length; i++) {
      const lv = this.level(x, i, this.levels[i]);
      this.levels[i] = lv;
      if (this.def.pins[i].role !== 'in') continue;
      if (lv !== this.inLv[i]) changed = true;
      this.inLv[i] = lv;
    }
    return changed;
  }

  private evaluate(): (boolean | null)[] {
    const out = this.def.evaluate(this.inLv, this.prevLv, this.st);
    this.prevLv = this.inLv.slice();
    return out;
  }

  /** Apply the logic result to the outputs immediately (power-up and DC operating point). */
  private applyNow(out: (boolean | null)[]): boolean {
    let changed = false;
    for (let i = 0; i < out.length; i++) {
      if (this.def.pins[i].role !== 'out') continue;
      if (out[i] !== this.outLv[i]) {
        this.outLv[i] = out[i];
        changed = true;
      }
    }
    this.pending = [];
    return changed;
  }

  private schedule(out: (boolean | null)[], t: number): void {
    for (let i = 0; i < out.length; i++) {
      if (this.def.pins[i].role !== 'out') continue;
      const last = [...this.pending].reverse().find((e) => e.pin === i);
      const effective = last ? last.level : this.outLv[i];
      if (out[i] === effective) continue;
      this.pending = this.pending.filter((e) => e.pin !== i);
      if (out[i] !== this.outLv[i]) this.pending.push({ t: t + this.def.tpd, pin: i, level: out[i] });
    }
    this.pending.sort((a, b) => a.t - b.t);
  }

  accept(x: Float64Array, t: number): boolean {
    let disc = false;
    const nowPowered = !this.failed && this.supply(x) >= this.vmin;
    if (nowPowered !== this.powered) {
      this.powered = nowPowered;
      this.pending = [];
      this.st = this.def.init();
      if (!nowPowered) {
        this.outLv.fill(null);
        return true;
      }
      this.sampleInputs(x);
      this.prevLv = this.inLv.slice();
      this.applyNow(this.evaluate());
      return true;
    }
    if (!this.powered) return false;
    // fire due events
    while (this.pending.length && this.pending[0].t <= t + 1e-15) {
      const e = this.pending.shift() as PendingEvent;
      if (this.outLv[e.pin] !== e.level) {
        this.outLv[e.pin] = e.level;
        disc = true;
      }
    }
    if (this.sampleInputs(x)) this.schedule(this.evaluate(), t);
    return disc;
  }

  postConverge(x: Float64Array): boolean {
    const nowPowered = !this.failed && this.supply(x) >= this.vmin;
    if (nowPowered !== this.powered) {
      this.powered = nowPowered;
      if (!nowPowered) {
        this.outLv.fill(null);
        return true;
      }
    }
    if (!this.powered) return false;
    this.sampleInputs(x);
    this.prevLv = this.inLv.slice(); // no clock edges at the operating point
    return this.applyNow(this.def.evaluate(this.inLv, this.prevLv, this.st));
  }

  nextBreakpoint(t: number): number {
    for (const e of this.pending) if (e.t > t + 1e-15) return e.t;
    return Infinity;
  }

  crossing(xOld: Float64Array, xNew: Float64Array): number {
    if (!this.powered) return 1;
    let f = 1;
    for (let i = 0; i < this.def.pins.length; i++) {
      if (this.def.pins[i].role !== 'in') continue;
      const cur = this.inLv[i];
      const vsO = this.supply(xOld);
      const vsN = this.supply(xNew);
      const thO = vsO / 2 + (cur ? -0.05 : 0.05) * vsO;
      const thN = vsN / 2 + (cur ? -0.05 : 0.05) * vsN;
      const a = this.pv(xOld, i) - this.pv(xOld, this.gndIdx) - thO;
      const b = this.pv(xNew, i) - this.pv(xNew, this.gndIdx) - thN;
      if ((cur && a > 0 && b < 0) || (!cur && a < 0 && b > 0)) f = Math.min(f, a / (a - b));
    }
    return f;
  }

  read(x: Float64Array): DeviceReading {
    const vs = this.supply(x);
    const pinI: number[] = new Array(this.def.pins.length).fill(0);
    const g = 1 / this.rout;
    let maxOut = 0;
    let iSupply = vs * 1e-6;
    for (let i = 0; i < this.def.pins.length; i++) {
      const lv = this.outLv[i];
      if (!this.powered || lv === null || this.def.pins[i].role !== 'out') continue;
      const ref = lv ? this.vccIdx : this.gndIdx;
      const io = (this.pv(x, i) - this.pv(x, ref)) * g; // into pin from node
      pinI[i] = io;
      maxOut = Math.max(maxOut, Math.abs(io));
      if (lv) iSupply += -io;
    }
    pinI[this.vccIdx] = iSupply;
    return {
      v: vs,
      i: maxOut,
      p: vs * iSupply,
      pinI,
      extra: { powered: this.powered, levels: this.levels.map((l) => (l ? '1' : '0')).join('') },
    };
  }

  ratings(): Ratings | null {
    return { maxReverse: 0.5, maxV: this.def.family === '4000' ? 18 : 7, tau: 0.05, failAt: 2, instantFail: 6 };
  }

  saveState(): unknown {
    return {
      ...(super.saveState() as object),
      st: { ...this.st },
      outLv: this.outLv.slice(),
      inLv: this.inLv.slice(),
      powered: this.powered,
    };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { st?: Record<string, number>; outLv?: (boolean | null)[]; inLv?: boolean[]; powered?: boolean };
    if (st?.st) this.st = { ...st.st };
    if (st?.outLv && st.outLv.length === this.outLv.length) this.outLv = st.outLv.slice();
    if (st?.inLv && st.inLv.length === this.inLv.length) {
      this.inLv = st.inLv.slice();
      this.prevLv = st.inLv.slice();
      this.levels = st.inLv.slice();
    }
    if (typeof st?.powered === 'boolean') this.powered = st.powered;
  }
}
