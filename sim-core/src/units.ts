const PREFIXES: { exp: number; sym: string }[] = [
  { exp: 12, sym: 'T' },
  { exp: 9, sym: 'G' },
  { exp: 6, sym: 'M' },
  { exp: 3, sym: 'k' },
  { exp: 0, sym: '' },
  { exp: -3, sym: 'm' },
  { exp: -6, sym: 'µ' },
  { exp: -9, sym: 'n' },
  { exp: -12, sym: 'p' },
  { exp: -15, sym: 'f' },
];

/**
 * Format a value in engineering notation: 4700 → "4.7 kΩ", 1e-5 → "10 µF".
 * `digits` is the number of significant figures (trailing zeros trimmed).
 */
export function formatEng(value: number, unit = '', digits = 3): string {
  if (!Number.isFinite(value)) return value > 0 ? `∞ ${unit}`.trim() : value < 0 ? `-∞ ${unit}`.trim() : '—';
  if (value === 0) return `0 ${unit}`.trim();
  const sign = value < 0 ? '-' : '';
  let abs = Math.abs(value);
  if (abs < 1e-15) return `0 ${unit}`.trim();
  let exp3 = Math.floor(Math.log10(abs) / 3) * 3;
  exp3 = Math.max(-15, Math.min(12, exp3));
  let mant = abs / Math.pow(10, exp3);
  // Rounding can push 999.7 → 1000; renormalise.
  let decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(mant)));
  let rounded = Number(mant.toFixed(decimals));
  if (rounded >= 1000 && exp3 < 12) {
    exp3 += 3;
    mant = abs / Math.pow(10, exp3);
    decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(mant)));
    rounded = Number(mant.toFixed(decimals));
  }
  const sym = PREFIXES.find((p) => p.exp === exp3)?.sym ?? '';
  const text = String(rounded);
  return `${sign}${text} ${sym}${unit}`.trim();
}

/** Like formatEng but always signed (+/-), useful for live readouts. */
export function formatEngSigned(value: number, unit = '', digits = 3): string {
  const s = formatEng(value, unit, digits);
  return value > 0 ? `+${s}` : s;
}

const PARSE_PREFIX: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  M: 1e6,
  meg: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};

/**
 * Parse engineering text: "4.7k", "4k7", "10u", "10 µF", "2.2mA", "1meg", "100".
 * Returns NaN when the text is not a number.
 */
export function parseEng(text: string): number {
  let s = text.trim().replace(/\s+/g, '').replace(/,/g, '.');
  s = s.replace(/(Ω|ohms?|F|H|V|A|W|Hz|s)$/i, (m) => (/^meg$/i.test(m) ? m : ''));
  // "4k7" style: digit prefix digit
  const rkm = /^([+-]?\d+)(meg|[TGMkKmuµμnpf])(\d+)$/.exec(s);
  if (rkm) {
    const mult = PARSE_PREFIX[rkm[2]];
    return Number(`${rkm[1]}.${rkm[3]}`) * mult;
  }
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|[TGMkKmuµμnpf])?$/i.exec(s);
  if (!m) return NaN;
  const base = Number(m[1]);
  const pre = m[2];
  if (!pre) return base;
  const mult = pre.toLowerCase() === 'meg' ? 1e6 : PARSE_PREFIX[pre];
  return mult === undefined ? NaN : base * mult;
}

/** Thermal voltage kT/q at 300.15 K. */
export const VT = 0.025865;

/** E12 / E24 series for resistor and capacitor pickers. */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const E24 = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5,
  8.2, 9.1,
];

/** Nearest E-series value to `value`. */
export function nearestE(value: number, series: number[] = E24): number {
  if (value <= 0) return value;
  const dec = Math.pow(10, Math.floor(Math.log10(value)));
  let best = series[0] * dec;
  for (const m of [...series.map((v) => v * dec), 10 * dec]) {
    if (Math.abs(Math.log(m / value)) < Math.abs(Math.log(best / value))) best = m;
  }
  return Number(best.toPrecision(3));
}

/** Resistor colour code (4-band for ≥2 significant digits; 5-band when 3 needed). */
export const BAND_COLORS = [
  '#1b1b1b', // black 0
  '#7a4a24', // brown 1
  '#d22f2f', // red 2
  '#ef7d1a', // orange 3
  '#f5cf1d', // yellow 4
  '#2d9a47', // green 5
  '#2a5fd1', // blue 6
  '#7d4fc4', // violet 7
  '#8b8b8b', // grey 8
  '#f7f7f7', // white 9
];
export const GOLD = '#c9a43a';
export const SILVER = '#b8bcc4';
export const BAND_NAMES = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];

export function resistorBands(ohms: number, tolerance = 0.05): string[] {
  if (!(ohms > 0)) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  const exp = Math.floor(Math.log10(ohms));
  const three = Math.round(ohms / Math.pow(10, exp - 2));
  const needThree = three % 10 !== 0 || tolerance < 0.05;
  const tol = tolerance <= 0.01 ? BAND_COLORS[1] : tolerance <= 0.05 ? GOLD : SILVER;
  const mult = (m: number) => (m === -1 ? GOLD : m === -2 ? SILVER : BAND_COLORS[Math.max(0, Math.min(9, m))]);
  if (needThree) {
    let digits = three;
    let m = exp - 2;
    if (digits >= 1000) {
      digits = Math.round(digits / 10);
      m += 1;
    }
    const d = String(digits).padStart(3, '0');
    return [BAND_COLORS[+d[0]], BAND_COLORS[+d[1]], BAND_COLORS[+d[2]], mult(m), tol];
  }
  let two = Math.round(ohms / Math.pow(10, exp - 1));
  let m = exp - 1;
  if (two >= 100) {
    two = Math.round(two / 10);
    m += 1;
  }
  const d = String(two).padStart(2, '0');
  return [BAND_COLORS[+d[0]], BAND_COLORS[+d[1]], mult(m), tol];
}
