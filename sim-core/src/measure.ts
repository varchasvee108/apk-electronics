/** Waveform measurements on non-uniformly sampled data (t, y). */

/** Times at which y crosses `level` upward (linear interpolation). */
export function risingCrossings(t: number[], y: number[], level: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < y.length; i++) {
    if (y[i - 1] < level && y[i] >= level) {
      const f = (level - y[i - 1]) / (y[i] - y[i - 1]);
      out.push(t[i - 1] + f * (t[i] - t[i - 1]));
    }
  }
  return out;
}

export function fallingCrossings(t: number[], y: number[], level: number): number[] {
  return risingCrossings(
    t,
    y.map((v) => -v),
    -level,
  );
}

/** Average frequency from rising crossings after `tFrom`. */
export function frequency(t: number[], y: number[], level: number, tFrom = 0): number {
  const r = risingCrossings(t, y, level).filter((x) => x >= tFrom);
  if (r.length < 2) return 0;
  return (r.length - 1) / (r[r.length - 1] - r[0]);
}

/** Duty cycle (fraction of the period above `level`), averaged over whole cycles after `tFrom`. */
export function dutyCycle(t: number[], y: number[], level: number, tFrom = 0): number {
  const r = risingCrossings(t, y, level).filter((x) => x >= tFrom);
  const f = fallingCrossings(t, y, level).filter((x) => x >= tFrom);
  if (r.length < 2) return 0;
  let high = 0;
  for (let k = 0; k < r.length - 1; k++) {
    const fall = f.find((x) => x > r[k] && x < r[k + 1]);
    if (fall === undefined) return 0;
    high += fall - r[k];
  }
  return high / (r[r.length - 1] - r[0]);
}

export function maxIn(t: number[], y: number[], from: number, to = Infinity): number {
  let m = -Infinity;
  for (let i = 0; i < t.length; i++) if (t[i] >= from && t[i] <= to) m = Math.max(m, y[i]);
  return m;
}

export function minIn(t: number[], y: number[], from: number, to = Infinity): number {
  let m = Infinity;
  for (let i = 0; i < t.length; i++) if (t[i] >= from && t[i] <= to) m = Math.min(m, y[i]);
  return m;
}

/** Linear interpolation of y at time tq. */
export function sampleAt(t: number[], y: number[], tq: number): number {
  if (tq <= t[0]) return y[0];
  let lo = 0;
  let hi = t.length - 1;
  if (tq >= t[hi]) return y[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= tq) lo = mid;
    else hi = mid;
  }
  const f = (tq - t[lo]) / (t[hi] - t[lo]);
  return y[lo] + f * (y[hi] - y[lo]);
}

/** Resample to a uniform grid of n points over [t0, t1]. */
export function resample(t: number[], y: number[], t0: number, t1: number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = sampleAt(t, y, t0 + ((t1 - t0) * i) / (n - 1));
  return out;
}

/** In-place radix-2 FFT. Returns single-sided magnitude spectrum (peak amplitude) with a Hann window. */
export function spectrum(samples: Float64Array, sampleRate: number): { freq: number[]; mag: number[] } {
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = (samples[i] - mean) * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  const freq: number[] = [];
  const mag: number[] = [];
  // Hann window coherent gain = 0.5
  for (let k = 0; k <= n / 2; k++) {
    freq.push((k * sampleRate) / n);
    mag.push(((k === 0 ? 1 : 2) * Math.hypot(re[k], im[k])) / (n * 0.5));
  }
  return { freq, mag };
}
