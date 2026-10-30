import { DenseSolver } from './linalg';
import type { Method, Mode } from './types';

/**
 * MNA stamping helper. Row k is KCL for unknown k: the sum of currents *leaving* the node through
 * elements equals the currents injected by sources (right-hand side). Index −1 is ground and is skipped.
 */
export class Stamper {
  readonly n: number;
  readonly solver: DenseSolver;
  x: Float64Array;
  mode: Mode = 'dc';
  t = 0;
  dt = 0;
  method: Method = 'be';
  gmin = 1e-12;
  /** Source-stepping factor (0..1) applied by independent sources. */
  srcScale = 1;
  /** Set by devices when voltage limiting changed an iterate, so NR must keep going. */
  limited = false;
  /** NR iteration number within the current solve. */
  iter = 0;

  constructor(n: number) {
    this.n = n;
    this.solver = new DenseSolver(n);
    this.x = new Float64Array(n);
  }

  get A(): Float64Array {
    return this.solver.A;
  }
  get b(): Float64Array {
    return this.solver.b;
  }

  v(i: number): number {
    return i < 0 ? 0 : this.x[i];
  }

  add(i: number, j: number, val: number): void {
    if (i < 0 || j < 0) return;
    this.solver.A[i * this.n + j] += val;
  }

  rhs(i: number, val: number): void {
    if (i < 0) return;
    this.solver.b[i] += val;
  }

  conductance(a: number, b: number, g: number): void {
    this.add(a, a, g);
    this.add(b, b, g);
    this.add(a, b, -g);
    this.add(b, a, -g);
  }

  /** Independent current `i` flowing from node a, through the element, into node b. */
  current(a: number, b: number, i: number): void {
    this.rhs(a, -i);
    this.rhs(b, i);
  }

  /** Current gm·(V(cp) − V(cn)) flowing from node a through the element into node b. */
  vccs(a: number, b: number, cp: number, cn: number, gm: number): void {
    this.add(a, cp, gm);
    this.add(a, cn, -gm);
    this.add(b, cp, -gm);
    this.add(b, cn, gm);
  }

  /**
   * Voltage source between p (+) and n (−) with branch unknown `br` (current flowing into the + terminal
   * from the circuit, through the source). Optional series resistance r: V(p) − V(n) − r·i = value.
   */
  vsource(p: number, nn: number, br: number, value: number, r = 0): void {
    this.add(p, br, 1);
    this.add(nn, br, -1);
    this.add(br, p, 1);
    this.add(br, nn, -1);
    if (r !== 0) this.add(br, br, -r);
    this.rhs(br, value);
  }

  /** Current leaving node k into the device written as I = ieq + Σ g_j·V_j (already linearised). */
  linCurrent(k: number, ieq: number, deps: [number, number][]): void {
    if (k < 0) return;
    for (const [j, g] of deps) if (j >= 0) this.add(k, j, g);
    this.rhs(k, -ieq);
  }

  /**
   * Linearised nonlinear current leaving node `k` into the device: I ≈ i0 + Σ g_j (V_j − V_j0).
   * `deps` lists [unknownIndex, dI/dV] pairs (ground entries are ignored).
   */
  nlCurrent(k: number, i0: number, deps: [number, number][]): void {
    if (k < 0) return;
    let lin = i0;
    for (const [j, g] of deps) {
      if (j < 0) continue;
      this.add(k, j, g);
      lin -= g * this.x[j];
    }
    this.rhs(k, -lin);
  }
}

/** Collects the frequency-proportional terms (C and L) for AC analysis: Y = G + jω·B. */
export class ReactiveStamper {
  readonly n: number;
  readonly B: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.B = new Float64Array(n * n);
  }
  add(i: number, j: number, val: number): void {
    if (i < 0 || j < 0) return;
    this.B[i * this.n + j] += val;
  }
  capacitance(a: number, b: number, c: number): void {
    this.add(a, a, c);
    this.add(b, b, c);
    this.add(a, b, -c);
    this.add(b, a, -c);
  }
}

/** SPICE pnjlim: limit the change of a junction voltage between Newton iterations. */
export function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): [number, boolean] {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return [arg > 0 ? vold + vt * Math.log(arg) : vcrit, true];
    }
    return [vt * Math.log(vnew / vt), true];
  }
  return [vnew, false];
}

/** Simplified SPICE fetlim: keep gate-source steps bounded near threshold. */
export function fetlim(vnew: number, vold: number, vto: number): [number, boolean] {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = vtsthi / 2 + 2;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  let v = vnew;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        if (vnew >= vtox) {
          if (-delv > vtstlo) v = vold - vtstlo;
        } else v = Math.max(vnew, vto + 2);
      } else if (delv >= vtsthi) v = vold + vtsthi;
    } else if (delv <= 0) v = Math.max(vnew, vto - 0.5);
    else v = Math.min(vnew, vto + 4);
  } else if (delv <= 0) {
    if (-delv > vtsthi) v = vold - vtsthi;
  } else {
    const vtemp = vto + 0.5;
    if (vnew <= vtemp) {
      if (delv > vtstlo) v = vold + vtstlo;
    } else v = vtemp;
  }
  return [v, Math.abs(v - vnew) > 1e-12];
}

/** Bounded exponential with linear continuation, protects against overflow. */
export function safeExp(x: number): [number, number] {
  const MAX = 80;
  if (x > MAX) {
    const e = Math.exp(MAX);
    return [e * (1 + x - MAX), e];
  }
  const e = Math.exp(x);
  return [e, e];
}
