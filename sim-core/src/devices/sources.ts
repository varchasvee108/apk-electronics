import { Device, type Ratings } from '../device';
import type { Stamper } from '../stamper';
import type { DeviceReading, ElementSpec } from '../types';
import { defaultWave, waveMaxStep, waveNextBreakpoint, waveValue, type WaveKind, type Waveform } from '../waveform';

function readWave(d: Device): Waveform {
  return defaultWave({
    kind: d.str('wave', 'dc') as WaveKind,
    amplitude: d.num('amp', 1),
    frequency: d.num('freq', 1000),
    offset: d.str('wave', 'dc') === 'dc' ? d.num('v', d.num('i', 0)) : d.num('offset', 0),
    duty: d.num('duty', 0.5),
    phase: d.num('phase', 0),
    delay: d.num('delay', 0),
  });
}

/** Independent voltage source with optional waveform and internal resistance. Nodes [+, −]. */
export class VSource extends Device {
  wave: Waveform;
  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 1;
    this.wave = readWave(this);
  }
  protected onParamsChanged(): void {
    this.wave = readWave(this);
  }
  value(t: number): number {
    return waveValue(this.wave, t);
  }
  stamp(s: Stamper): void {
    const v = this.bool('on', true) ? this.value(s.mode === 'dc' ? 0 : s.t) * s.srcScale : 0;
    s.vsource(this.nodes[0], this.nodes[1], this.br0, v, this.num('r', 0));
  }
  nextBreakpoint(t: number): number {
    return waveNextBreakpoint(this.wave, t);
  }
  maxStep(pointsPerPeriod?: number): number {
    return waveMaxStep(this.wave, pointsPerPeriod);
  }
  acValue(): number {
    return this.num('acmag', 0);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const iInto = x[this.br0];
    return { v, i: -iInto, p: v * iInto, pinI: [iInto, -iInto], extra: { setpoint: this.value(0) } };
  }
  ratings(): Ratings | null {
    const maxI = this.num('maxI', 0);
    return maxI > 0 ? { maxI } : null;
  }
}

/** Independent current source (SPICE convention: current flows from n+ through the source to n−). */
export class ISource extends Device {
  wave: Waveform;
  constructor(spec: ElementSpec) {
    super(spec);
    this.wave = readWave(this);
  }
  protected onParamsChanged(): void {
    this.wave = readWave(this);
  }
  stamp(s: Stamper): void {
    const i = waveValue(this.wave, s.mode === 'dc' ? 0 : s.t) * s.srcScale;
    s.current(this.nodes[0], this.nodes[1], i);
  }
  nextBreakpoint(t: number): number {
    return waveNextBreakpoint(this.wave, t);
  }
  maxStep(pointsPerPeriod?: number): number {
    return waveMaxStep(this.wave, pointsPerPeriod);
  }
  acValue(): number {
    return this.num('acmag', 0);
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const i = waveValue(this.wave, 0);
    return { v, i, p: v * i, pinI: [i, -i] };
  }
}

/**
 * Bench power supply with constant-voltage / constant-current crossover. Nodes [+, −].
 * The mode is a discrete state chosen after each Newton solve (postConverge).
 */
export class Supply extends Device {
  mode: 'CV' | 'CC' = 'CV';
  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 1;
  }
  stamp(s: Stamper): void {
    const [p, n] = this.nodes;
    const br = this.br0;
    const on = this.bool('on', true);
    const vset = on ? this.num('vset', 5) * s.srcScale : 0;
    if (this.mode === 'CV' || !on) {
      s.vsource(p, n, br, vset, this.num('r', 0.005));
    } else {
      // Branch current fixed: current delivered = ilim  →  i_br = −ilim
      s.add(p, br, 1);
      s.add(n, br, -1);
      s.add(br, br, 1);
      s.rhs(br, -this.num('ilim', 1) * s.srcScale);
    }
  }
  postConverge(x: Float64Array): boolean {
    const ilim = this.num('ilim', 1);
    const delivered = -x[this.br0];
    const v = this.pv(x, 0) - this.pv(x, 1);
    if (this.mode === 'CV' && delivered > ilim * 1.0001) {
      this.mode = 'CC';
      return true;
    }
    if (this.mode === 'CC' && v > this.num('vset', 5) * 1.0001) {
      this.mode = 'CV';
      return true;
    }
    return false;
  }
  read(x: Float64Array): DeviceReading {
    const v = this.pv(x, 0) - this.pv(x, 1);
    const iInto = x[this.br0];
    return { v, i: -iInto, p: v * iInto, pinI: [iInto, -iInto], extra: { mode: this.mode } };
  }
  saveState(): unknown {
    return { ...(super.saveState() as object), mode: this.mode };
  }
  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { mode?: 'CV' | 'CC' };
    if (st?.mode) this.mode = st.mode;
  }
}
