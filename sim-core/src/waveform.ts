export type WaveKind = 'dc' | 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse';

export interface Waveform {
  kind: WaveKind;
  /** Peak amplitude (V or A). */
  amplitude: number;
  frequency: number;
  offset: number;
  /** 0..1 for square / pulse. */
  duty: number;
  /** Degrees. */
  phase: number;
  /** Delay before the waveform starts (s). */
  delay: number;
}

/** Edge time for square / pulse waves as a fraction of the period (keeps the solver happy). */
const EDGE = 1e-4;

export function waveValue(w: Waveform, t: number): number {
  if (w.kind === 'dc' || w.frequency <= 0) return w.offset;
  const tt = t - w.delay;
  if (tt < 0) return w.kind === 'pulse' ? w.offset : w.offset + (w.kind === 'sine' ? w.amplitude * Math.sin((w.phase * Math.PI) / 180) : 0);
  const period = 1 / w.frequency;
  let ph = tt / period + w.phase / 360;
  ph -= Math.floor(ph);
  const A = w.amplitude;
  switch (w.kind) {
    case 'sine':
      return w.offset + A * Math.sin(2 * Math.PI * ph);
    case 'square':
    case 'pulse': {
      const d = Math.min(Math.max(w.duty, 0.001), 0.999);
      const lo = w.kind === 'pulse' ? 0 : -A;
      const hi = A;
      // trapezoid edges
      let y: number;
      if (ph < EDGE) y = lo + ((hi - lo) * ph) / EDGE;
      else if (ph < d) y = hi;
      else if (ph < d + EDGE) y = hi - ((hi - lo) * (ph - d)) / EDGE;
      else y = lo;
      return w.offset + y;
    }
    case 'triangle':
      return w.offset + A * (ph < 0.5 ? -1 + 4 * ph : 3 - 4 * ph);
    case 'sawtooth':
      return w.offset + A * (-1 + 2 * ph);
    default:
      return w.offset;
  }
}

/** Corner points of the waveform within one period, as phase fractions. */
function corners(w: Waveform): number[] {
  switch (w.kind) {
    case 'square':
    case 'pulse': {
      const d = Math.min(Math.max(w.duty, 0.001), 0.999);
      return [0, EDGE, d, d + EDGE];
    }
    case 'triangle':
      return [0, 0.5];
    case 'sawtooth':
      return [0];
    default:
      return [];
  }
}

export function waveNextBreakpoint(w: Waveform, t: number): number {
  if (w.kind === 'dc' || w.kind === 'sine' || w.frequency <= 0) {
    return w.delay > t ? w.delay : Infinity;
  }
  if (t < w.delay) return w.delay;
  const period = 1 / w.frequency;
  const cs = corners(w);
  const tt = t - w.delay;
  const shift = w.phase / 360;
  const cycle = Math.floor(tt / period + shift);
  let best = Infinity;
  for (let k = cycle - 1; k <= cycle + 1; k++) {
    for (const c of cs) {
      const tc = w.delay + (k + c - shift) * period;
      if (tc > t + period * 1e-9 && tc < best) best = tc;
    }
  }
  return best;
}

export function waveMaxStep(w: Waveform): number {
  if (w.kind === 'dc' || w.frequency <= 0) return Infinity;
  const period = 1 / w.frequency;
  return w.kind === 'sine' ? period / 50 : period / 20;
}

export function defaultWave(partial: Partial<Waveform>): Waveform {
  return {
    kind: 'dc',
    amplitude: 0,
    frequency: 1000,
    offset: 0,
    duty: 0.5,
    phase: 0,
    delay: 0,
    ...partial,
  };
}
