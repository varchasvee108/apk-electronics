/**
 * Display damping for numeric readouts, like a meter's needle or a DMM's update rate: the shown
 * value follows the measurement with a ~0.25 s time constant (wall clock). Frame averages already
 * remove aliasing; damping removes the residual wobble when a frame holds a fraction of a cycle.
 * Visuals (LED glow, current dots) are not damped, so switching still looks instant.
 */
const state = new Map<string, { v: number; t: number }>();

export function damp(key: string, value: number, now: number = Date.now(), tauMs = 250): number {
  if (!Number.isFinite(value)) {
    state.delete(key);
    return value;
  }
  const s = state.get(key);
  if (!s || now - s.t > 2000) {
    state.set(key, { v: value, t: now });
    return value;
  }
  const a = 1 - Math.exp(-Math.max(0, now - s.t) / tauMs);
  const v = s.v + (value - s.v) * a;
  state.set(key, { v, t: now });
  return v;
}

/** Forget all damped values (power off / new circuit). */
export function resetDamping(): void {
  state.clear();
}
