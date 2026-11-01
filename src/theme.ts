import { Appearance, Platform } from 'react-native';
import { readPrefs } from '@/store/prefs';

/** Monospace family that exists on each platform ('monospace' is Android/web only). */
export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;

/** Light palette: calm neutrals, one teal accent, semantic status colours. */
const LIGHT = {
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  surface2: '#F8F9FA',
  sunken: '#EEF0F3',
  border: '#E2E5EA',
  borderStrong: '#CBD1D9',
  ink: '#15181C',
  ink2: '#454C57',
  ink3: '#6B7380',
  inkFaint: '#9AA1AC',
  accent: '#0E7C6B',
  accentInk: '#0A5F52',
  accentSoft: '#E1F3EF',
  danger: '#C93838',
  dangerSoft: '#FCEBEB',
  warn: '#A86412',
  warnSoft: '#FFF4E0',
  ok: '#23864A',
  okSoft: '#E5F5EA',
  info: '#2A63B8',
  infoSoft: '#E7EFFB',
  power: '#2F9E44',
  canvas: '#ECEEF1',
  canvasDot: '#D3D8DF',
  board: '#FAF9F5',
  boardShade: '#EFECE4',
  boardEdge: '#DDD8CC',
  hole: '#4A4F57',
  railRed: '#E5484D',
  railBlue: '#3E63DD',
  select: '#0E7C6B',
  scopeBg: '#FBFCFD',
  scopeGrid: '#E4E8EE',
  trace: ['#E5484D', '#3E63DD', '#2F9E44', '#C2410C'],
};

/** Dark palette (same keys). */
const DARK: typeof LIGHT = {
  bg: '#0F1216',
  surface: '#171B21',
  surface2: '#1C2128',
  sunken: '#232932',
  border: '#2A313B',
  borderStrong: '#3A4350',
  ink: '#ECEFF3',
  ink2: '#C3CAD3',
  ink3: '#929BA7',
  inkFaint: '#6A7380',
  accent: '#2BB39C',
  accentInk: '#6FD9C4',
  accentSoft: '#143A35',
  danger: '#F06A6A',
  dangerSoft: '#3A1E21',
  warn: '#E9A44A',
  warnSoft: '#3A2C17',
  ok: '#4CC27C',
  okSoft: '#17331F',
  info: '#6A9BEA',
  infoSoft: '#1A2A44',
  power: '#3FBF5A',
  canvas: '#C8CCD2',
  canvasDot: '#B2B8C0',
  board: '#F2F0EA',
  boardShade: '#E6E2D8',
  boardEdge: '#D2CCBE',
  hole: '#4A4F57',
  railRed: '#E5484D',
  railBlue: '#3E63DD',
  select: '#2BB39C',
  scopeBg: '#10161B',
  scopeGrid: '#24303A',
  trace: ['#FF6B6F', '#6E8EFF', '#4CD06A', '#F28A3C'],
};

function pickDark(): boolean {
  let pref: string = 'system';
  try {
    pref = readPrefs().theme;
  } catch {
    // storage not ready: follow the system
  }
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

/** True when the app runs in dark mode (chosen at launch; changing it restarts the app). */
export const IS_DARK = pickDark();

/** UI colours for the active theme. */
export const C = IS_DARK ? DARK : LIGHT;

/**
 * Colours for drawings on the bench canvas. Parts keep their real-world look in both themes, so the
 * canvas is always a lit work mat (a little dimmer in dark mode); select / accent follow the theme.
 */
export const CANVAS: typeof LIGHT = IS_DARK ? { ...LIGHT, canvas: DARK.canvas, canvasDot: DARK.canvasDot } : LIGHT;

export const R = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const T = {
  caption: { fontSize: 12, color: C.ink3 },
  small: { fontSize: 13, color: C.ink2 },
  body: { fontSize: 15, color: C.ink },
  label: { fontSize: 14, fontWeight: '600' as const, color: C.ink },
  title: { fontSize: 20, fontWeight: '700' as const, color: C.ink },
  hero: { fontSize: 30, fontWeight: '800' as const, color: C.ink, letterSpacing: -0.5 },
  mono: { fontFamily: MONO, fontSize: 13, color: C.ink },
} as const;

/** Minimum touch target (dp). */
export const TOUCH = 48;

/** Map a voltage onto a blue → teal → amber → red ramp (for wire colouring by voltage). */
export function voltageColor(v: number, vmax: number): string {
  const t = Math.max(0, Math.min(1, vmax > 0 ? v / vmax : 0));
  const stops: [number, [number, number, number]][] = [
    [0, [62, 99, 221]],
    [0.35, [14, 124, 107]],
    [0.7, [230, 150, 20]],
    [1, [229, 72, 77]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((x, k) => Math.round(x + (c1[k] - x) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(229,72,77)';
}
