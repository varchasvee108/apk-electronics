import { VT } from '../src/units';

/** Principal branch of Lambert W, given ln(x) (handles huge arguments). */
export function lambertWFromLog(L: number): number {
  let w = L > 1 ? L - Math.log(L) : Math.exp(L) / (1 + Math.exp(L));
  for (let i = 0; i < 60; i++) {
    const f = w + Math.log(w) - L;
    const step = f / (1 + 1 / w);
    w -= step;
    if (Math.abs(step) < 1e-14 * Math.max(1, Math.abs(w))) break;
  }
  return w;
}

/**
 * Closed-form current of a source V driving a Shockley diode (Is, n) through total resistance R:
 * I = (nVt/R)·W((Is·R/nVt)·exp((V + Is·R)/nVt)) − Is
 */
export function diodeSeriesCurrent(V: number, R: number, is: number, n: number): number {
  const nvt = n * VT;
  const L = Math.log((is * R) / nvt) + (V + is * R) / nvt;
  return (nvt / R) * lambertWFromLog(L) - is;
}

export function relErr(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);
}
