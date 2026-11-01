import { Device, type Ratings } from '../device';
import type { Stamper } from '../stamper';
import type { DeviceReading } from '../types';

const OPEN_G = 1e-10;

/**
 * Fuse. Nodes [a, b]. A small resistance that opens for good ("blows") when the current stays above its
 * rating: the stress model's heat follows |I| / rating with a short time constant, so 2× the rating blows
 * it in about 0.1 s and a dead short instantly. Repairing the part fits a new fuse.
 */
export class Fuse extends Device {
  private r(): number {
    return Math.max(1e-4, this.num('r', 0.2));
  }
  stamp(s: Stamper): void {
    s.conductance(this.nodes[0], this.nodes[1], this.failed ? OPEN_G : 1 / this.r());
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = this.failed ? v * OPEN_G : v / this.r();
    return { v, i, p: v * i, pinI: [i, -i], extra: { blown: this.failed } };
  }
  ratings(): Ratings | null {
    return { maxI: this.num('rating', 0.5), tau: this.num('tau', 0.1), failAt: 1.35, instantFail: 8 };
  }
}

/** Filament temperature at room temperature, as a fraction of its rated operating temperature (≈300 K / 2800 K). */
const X_COLD = 0.107;

/**
 * Incandescent lamp. Nodes [a, b]. Tungsten's resistance is roughly proportional to its absolute
 * temperature, so a cold filament has about a tenth of its hot resistance and draws a large inrush current.
 * The filament temperature x (1 = rated) follows a heat balance: dx/dt = (P / Prated − radiation(x)) / τ with
 * radiation ∝ x⁴, which gives the familiar I ∝ V^0.6 curve and light output ∝ V^3.4.
 */
export class Lamp extends Device {
  /** Filament temperature, 1 = rated. */
  x = X_COLD;
  private dx = 0;

  private rHot(): number {
    const v = this.num('vrated', 6);
    return (v * v) / Math.max(1e-3, this.num('prated', 1.2));
  }
  private res(): number {
    return this.rHot() * Math.max(this.x, X_COLD);
  }
  initTransient(): void {
    this.x = X_COLD;
    this.dx = 0;
  }
  stamp(s: Stamper): void {
    // the operating point uses the cold filament: the transient then shows the warm-up and inrush
    s.conductance(this.nodes[0], this.nodes[1], this.failed ? OPEN_G : 1 / this.res());
  }
  accept(x: Float64Array, _t: number, dt: number): boolean {
    const x0 = this.x;
    if (this.failed) {
      this.x = X_COLD;
      return false;
    }
    const v = this.pv(x, 0) - this.pv(x, 1);
    const pr = Math.max(1e-3, this.num('prated', 1.2));
    const tau = this.num('tauth', 0.15);
    const rh = this.rHot();
    const k4 = X_COLD ** 4;
    // small explicit sub-steps: the cold filament is stiff (its power falls as it heats)
    const n = Math.min(400, Math.max(1, Math.ceil(dt / 0.0015)));
    const h = dt / n;
    let xx = this.x;
    for (let k = 0; k < n; k++) {
      const pin = (v * v) / (rh * Math.max(xx, X_COLD));
      const loss = (xx ** 4 - k4) / (1 - k4);
      xx = Math.min(3, Math.max(X_COLD, xx + (h / tau) * (pin / pr - loss)));
    }
    this.x = xx;
    this.dx = dt > 0 ? Math.abs(xx - x0) / dt : 0;
    return false;
  }
  /** While the filament is warming up or cooling, keep steps short so the inrush is resolved. */
  maxStep(): number {
    return this.dx > 0.05 ? 0.004 : Infinity;
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = this.failed ? v * OPEN_G : v / this.res();
    // visible light rises very steeply with filament temperature
    const brightness = this.failed ? 0 : Math.min(1.6, Math.max(0, this.x) ** 8.5);
    return { v, i, p: v * i, pinI: [i, -i], extra: { brightness, temp: this.x, r: this.res() } };
  }
  ratings(): Ratings | null {
    // rated by voltage so the cold-start inrush does not count as an overload
    return { maxV: this.num('vrated', 6) * 1.3, tau: 0.5, failAt: 1.45 };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), x: this.x };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { x?: number };
    if (typeof st?.x === 'number') this.x = st.x;
  }
}

const SIG_HI = 1.8;
const SIG_LO = 1.3;

/**
 * Hobby servo (SG90-style). Nodes [GND, V+, SIG]. The servo times each high pulse on SIG
 * (1 ms → 0°, 1.5 ms → 90°, 2 ms → 180°) and turns towards that angle at 600 °/s while it is powered and
 * receiving pulses. Supply current: a few mA idle, ≈150 mA while the motor moves.
 */
export class Servo extends Device {
  angle = 0;
  target = 0;
  high = false;
  tRise = -1;
  pw = 0;
  lastPulse = -1;
  moving = false;

  initTransient(): void {
    // starts at 0° (where the sweep begins) until pulses tell it otherwise
    this.angle = this.num('angle0', 0);
    this.target = this.angle;
    this.high = false;
    this.tRise = -1;
    this.pw = 0;
    this.lastPulse = -1;
    this.moving = false;
  }
  private supply(x: Float64Array): number {
    return this.pv(x, 1) - this.pv(x, 0);
  }
  private sig(x: Float64Array): number {
    return this.pv(x, 2) - this.pv(x, 0);
  }
  private gSupply(): number {
    return this.failed ? OPEN_G : this.moving ? 1 / 33 : 1 / 800;
  }
  stamp(s: Stamper): void {
    const [g, vp, sig] = this.nodes;
    s.conductance(sig, g, 1e-5);
    s.conductance(vp, g, this.gSupply());
  }
  crossing(xOld: Float64Array, xNew: Float64Array): number {
    const a = this.sig(xOld);
    const b = this.sig(xNew);
    if (!this.high && a < SIG_HI && b >= SIG_HI) return (SIG_HI - a) / (b - a);
    if (this.high && a > SIG_LO && b <= SIG_LO) return (a - SIG_LO) / (a - b);
    return 1;
  }
  accept(x: Float64Array, t: number, dt: number): boolean {
    const v = this.sig(x);
    if (!this.high && v >= SIG_HI) {
      this.high = true;
      this.tRise = t;
    } else if (this.high && v <= SIG_LO) {
      this.high = false;
      const w = this.tRise >= 0 ? t - this.tRise : 0;
      if (w >= 0.3e-3 && w <= 3e-3) {
        this.pw = w;
        this.target = Math.min(180, Math.max(0, ((w - 1e-3) / 1e-3) * 180));
        this.lastPulse = t;
      }
    }
    const powered = !this.failed && this.supply(x) > 3.5;
    // like a real servo it only drives while pulses keep arriving (≈ every 20 ms)
    const active = powered && this.lastPulse >= 0 && t - this.lastPulse < 0.03;
    if (active) {
      const step = 600 * dt;
      const d = this.target - this.angle;
      this.angle += Math.max(-step, Math.min(step, d));
    }
    const mv = active && Math.abs(this.target - this.angle) > 0.5;
    if (mv !== this.moving) {
      this.moving = mv;
      return true;
    }
    return false;
  }
  read(x: Float64Array): DeviceReading {
    const vs = this.supply(x);
    const is = vs * this.gSupply();
    const isig = this.sig(x) * 1e-5;
    return {
      v: vs,
      i: is,
      p: vs * is,
      pinI: [-is - isig, is, isig],
      extra: { angle: this.angle, target: this.target, pw: this.pw, powered: vs > 3.5 && !this.failed, moving: this.moving },
    };
  }
  ratings(): Ratings | null {
    return { maxV: 7.2, tau: 1, failAt: 1.15, instantFail: 1.6, maxReverse: 0.5 };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), angle: this.angle, target: this.target, high: this.high, tRise: this.tRise, pw: this.pw, lastPulse: this.lastPulse };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as Partial<Servo> | null;
    if (!st) return;
    if (typeof st.angle === 'number') this.angle = st.angle;
    if (typeof st.target === 'number') this.target = st.target;
    if (typeof st.high === 'boolean') this.high = st.high;
    if (typeof st.tRise === 'number') this.tRise = st.tRise;
    if (typeof st.pw === 'number') this.pw = st.pw;
    if (typeof st.lastPulse === 'number') this.lastPulse = st.lastPulse;
  }
}

/**
 * Passive piezo buzzer / small speaker. Nodes [+, −]. Electrically a resistive load; it measures the
 * frequency of the signal driving it (time between rising edges, with hysteresis) so the app can play
 * that pitch. Unlike an active buzzer it is silent on plain DC.
 */
export class Piezo extends Device {
  private high = false;
  private lastRise = -1;
  private tNow = 0;
  freq = 0;
  private r(): number {
    return Math.max(1, this.num('r', 400));
  }
  initTransient(): void {
    this.high = false;
    this.lastRise = -1;
    this.freq = 0;
  }
  stamp(s: Stamper): void {
    s.conductance(this.nodes[0], this.nodes[1], this.failed ? OPEN_G : 1 / this.r());
  }
  accept(x: Float64Array, t: number): boolean {
    const v = this.pv(x, 0) - this.pv(x, 1);
    this.tNow = t;
    if (!this.high && v > 0.4) {
      this.high = true;
      if (this.lastRise >= 0) {
        const f = 1 / Math.max(1e-9, t - this.lastRise);
        if (f >= 20 && f <= 20000) this.freq = this.freq > 0 && Math.abs(f - this.freq) < 0.2 * this.freq ? 0.7 * this.freq + 0.3 * f : f;
      }
      this.lastRise = t;
    } else if (this.high && v < 0.1) this.high = false;
    return false;
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = this.failed ? v * OPEN_G : v / this.r();
    // sounding while edges keep arriving (a few periods' grace)
    const sounding = !this.failed && this.freq > 0 && this.lastRise >= 0 && this.tNow - this.lastRise < Math.max(0.03, 3 / this.freq);
    return { v, i, p: v * i, pinI: [i, -i], extra: { freq: sounding ? this.freq : 0, sounding } };
  }
  ratings(): Ratings | null {
    return { maxV: 30, tau: 1, failAt: 1.3 };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), high: this.high, lastRise: this.lastRise, freq: this.freq, tNow: this.tNow };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { high?: boolean; lastRise?: number; freq?: number; tNow?: number } | null;
    if (!st) return;
    if (typeof st.high === 'boolean') this.high = st.high;
    if (typeof st.lastRise === 'number') this.lastRise = st.lastRise;
    if (typeof st.freq === 'number') this.freq = st.freq;
    if (typeof st.tNow === 'number') this.tNow = st.tNow;
  }
}
