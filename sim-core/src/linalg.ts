/**
 * Dense LU decomposition with partial pivoting, sized for the circuits a learner builds
 * (tens to a few hundred unknowns). Buffers are reused between solves to avoid GC churn.
 */
export class DenseSolver {
  n: number;
  A: Float64Array;
  b: Float64Array;
  private lu: Float64Array;
  private perm: Int32Array;
  private y: Float64Array;
  private colMax: Float64Array;
  /** Scratch: non-zero column indices of the current pivot row. */
  private nz: Int32Array;
  /** Unknown index whose pivot vanished on the last failed factorisation. */
  singularIndex = -1;

  constructor(n: number) {
    this.n = n;
    this.A = new Float64Array(n * n);
    this.b = new Float64Array(n);
    this.lu = new Float64Array(n * n);
    this.perm = new Int32Array(n);
    this.y = new Float64Array(n);
    this.colMax = new Float64Array(n);
    this.nz = new Int32Array(n);
  }

  clear(): void {
    this.A.fill(0);
    this.b.fill(0);
  }

  /** Solve A x = b into `out`. Returns false when the matrix is singular. */
  solve(out: Float64Array): boolean {
    const n = this.n;
    if (n === 0) return true;
    const lu = this.lu;
    lu.set(this.A);
    const perm = this.perm;
    for (let i = 0; i < n; i++) perm[i] = i;
    // Pivot threshold relative to each column's own scale. A global threshold wrongly flags weakly
    // tied nodes (a floating input held only by gmin) as singular whenever large conductances exist
    // elsewhere, e.g. a capacitor's C/dt right after power-on. Genuinely singular systems (loops of
    // ideal sources) leave pivots that are zero up to rounding, far below this.
    const colMax = this.colMax;
    colMax.fill(0);
    for (let i = 0; i < n; i++) {
      const ri = i * n;
      for (let j = 0; j < n; j++) {
        const a = Math.abs(lu[ri + j]);
        if (a > colMax[j]) colMax[j] = a;
      }
    }
    for (let k = 0; k < n; k++) {
      const tiny = Math.max(colMax[k] * 1e-14, 1e-300);
      let p = k;
      let pv = Math.abs(lu[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k]);
        if (v > pv) {
          pv = v;
          p = i;
        }
      }
      if (pv <= tiny) {
        // Columns are never permuted, so column k is unknown k.
        this.singularIndex = k;
        return false;
      }
      if (p !== k) {
        const rk = k * n;
        const rp = p * n;
        for (let j = 0; j < n; j++) {
          const t = lu[rk + j];
          lu[rk + j] = lu[rp + j];
          lu[rp + j] = t;
        }
        const t = perm[k];
        perm[k] = perm[p];
        perm[p] = t;
      }
      const pivot = lu[k * n + k];
      const rk = k * n;
      // Circuit matrices are sparse: collect the pivot row's non-zero columns once, then update
      // only those in every row below (same arithmetic as the dense loop, far fewer operations).
      const nz = this.nz;
      let m = 0;
      for (let j = k + 1; j < n; j++) if (lu[rk + j] !== 0) nz[m++] = j;
      for (let i = k + 1; i < n; i++) {
        const ri = i * n;
        const f = lu[ri + k] / pivot;
        if (f === 0) continue;
        lu[ri + k] = f;
        for (let q = 0; q < m; q++) {
          const j = nz[q];
          lu[ri + j] -= f * lu[rk + j];
        }
      }
    }
    const y = this.y;
    for (let i = 0; i < n; i++) {
      let s = this.b[perm[i]];
      const ri = i * n;
      for (let j = 0; j < i; j++) s -= lu[ri + j] * y[j];
      y[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      const ri = i * n;
      for (let j = i + 1; j < n; j++) s -= lu[ri + j] * out[j];
      out[i] = s / lu[ri + i];
      if (!Number.isFinite(out[i])) {
        this.singularIndex = i;
        return false;
      }
    }
    return true;
  }
}

/** Complex dense solver for AC analysis: (G + jB) x = r. */
export class ComplexSolver {
  n: number;
  re: Float64Array;
  im: Float64Array;
  bre: Float64Array;
  bim: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.re = new Float64Array(n * n);
    this.im = new Float64Array(n * n);
    this.bre = new Float64Array(n);
    this.bim = new Float64Array(n);
  }

  clear(): void {
    this.re.fill(0);
    this.im.fill(0);
    this.bre.fill(0);
    this.bim.fill(0);
  }

  solve(xre: Float64Array, xim: Float64Array): boolean {
    const n = this.n;
    const ar = Float64Array.from(this.re);
    const ai = Float64Array.from(this.im);
    const br = Float64Array.from(this.bre);
    const bi = Float64Array.from(this.bim);
    for (let k = 0; k < n; k++) {
      let p = k;
      let pv = ar[k * n + k] ** 2 + ai[k * n + k] ** 2;
      for (let i = k + 1; i < n; i++) {
        const v = ar[i * n + k] ** 2 + ai[i * n + k] ** 2;
        if (v > pv) {
          pv = v;
          p = i;
        }
      }
      if (pv < 1e-300) return false;
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          let t = ar[k * n + j];
          ar[k * n + j] = ar[p * n + j];
          ar[p * n + j] = t;
          t = ai[k * n + j];
          ai[k * n + j] = ai[p * n + j];
          ai[p * n + j] = t;
        }
        let t = br[k];
        br[k] = br[p];
        br[p] = t;
        t = bi[k];
        bi[k] = bi[p];
        bi[p] = t;
      }
      const pr = ar[k * n + k];
      const pi = ai[k * n + k];
      const pd = pr * pr + pi * pi;
      for (let i = k + 1; i < n; i++) {
        const xr = ar[i * n + k];
        const xi = ai[i * n + k];
        if (xr === 0 && xi === 0) continue;
        // f = x / pivot
        const fr = (xr * pr + xi * pi) / pd;
        const fi = (xi * pr - xr * pi) / pd;
        for (let j = k + 1; j < n; j++) {
          const yr = ar[k * n + j];
          const yi = ai[k * n + j];
          ar[i * n + j] -= fr * yr - fi * yi;
          ai[i * n + j] -= fr * yi + fi * yr;
        }
        br[i] -= fr * br[k] - fi * bi[k];
        bi[i] -= fr * bi[k] + fi * br[k];
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      let sr = br[i];
      let si = bi[i];
      for (let j = i + 1; j < n; j++) {
        const yr = ar[i * n + j];
        const yi = ai[i * n + j];
        sr -= yr * xre[j] - yi * xim[j];
        si -= yr * xim[j] + yi * xre[j];
      }
      const pr = ar[i * n + i];
      const pi = ai[i * n + i];
      const pd = pr * pr + pi * pi;
      xre[i] = (sr * pr + si * pi) / pd;
      xim[i] = (si * pr - sr * pi) / pd;
    }
    return true;
  }
}
