import type { Params } from './types';
import { VT } from './units';

/** Device parameter presets (approximations of typical datasheet / SPICE values). */

export const DIODE_1N4148: Params = { kind: 'diode', is: 2.52e-9, n: 1.752, rs: 0.568, vrrm: 100, maxI: 0.3 };
export const DIODE_1N4001: Params = { kind: 'diode', is: 14.11e-9, n: 1.984, rs: 0.0339, vrrm: 50, maxI: 1 };
export const SCHOTTKY_1N5817: Params = { kind: 'schottky', is: 2.6e-6, n: 1.1, rs: 0.05, vrrm: 20, maxI: 1 };

export function zener(bv: number): Params {
  return { kind: 'zener', is: 1e-14, n: 1, rs: 2, bv, ibv: 1e-3, nbv: 1.2, maxP: 1 };
}

export const LED_COLORS = {
  red: { vf: 1.9, rgb: '#ff3b30', wavelength: 625 },
  orange: { vf: 2.0, rgb: '#ff8a1f', wavelength: 605 },
  yellow: { vf: 2.1, rgb: '#ffd60a', wavelength: 590 },
  green: { vf: 2.2, rgb: '#34c759', wavelength: 565 },
  blue: { vf: 3.1, rgb: '#2f7bff', wavelength: 470 },
  white: { vf: 3.2, rgb: '#f4f7ff', wavelength: 0 },
} as const;
export type LedColor = keyof typeof LED_COLORS;

/** LED model fitted so that Vf (at 20 mA) matches the colour's typical forward voltage. */
export function led(color: LedColor): Params {
  const vf = LED_COLORS[color].vf;
  const n = 2;
  const rs = color === 'blue' || color === 'white' ? 15 : 10;
  const is = 0.02 / Math.exp((vf - 0.02 * rs) / (n * VT));
  return { kind: 'led', color, is, n, rs, irated: 0.02, maxI: 0.03 };
}

export const PHOTODIODE: Params = { kind: 'photo', is: 1e-10, n: 1.1, rs: 1, resp: 7e-8, lux: 300, maxI: 0.05 };

export const NPN_2N3904: Params = { polarity: 'npn', is: 6.73e-15, bf: 150, br: 0.74, maxI: 0.2, maxP: 0.625 };
export const PNP_2N3906: Params = { polarity: 'pnp', is: 1.41e-15, bf: 150, br: 4, maxI: 0.2, maxP: 0.625 };
export const NMOS_2N7000: Params = { polarity: 'n', vto: 2.0, kp: 0.1, lambda: 0.01, maxI: 0.2, maxP: 0.4 };
export const PMOS_BS250: Params = { polarity: 'p', vto: 2.5, kp: 0.05, lambda: 0.01, maxI: 0.18, maxP: 0.83 };

export const OPAMP_IDEALISH: Params = { a0: 1e6, gbw: 10e6, sr: 10e6, rin: 1e12, rout: 1, hhi: 0.01, hlo: 0.01, iq: 1e-3 };
export const LM741: Params = { a0: 2e5, gbw: 1e6, sr: 0.5e6, rin: 2e6, rout: 75, hhi: 1.0, hlo: 1.0, iq: 1.7e-3, maxI: 0.025 };
export const LM358: Params = { a0: 1e5, gbw: 1e6, sr: 0.3e6, rin: 1e9, rout: 50, hhi: 1.5, hlo: 0.005, iq: 0.5e-3, maxI: 0.04 };
export const LM324: Params = { a0: 1e5, gbw: 1.2e6, sr: 0.5e6, rin: 1e9, rout: 50, hhi: 1.5, hlo: 0.005, iq: 0.7e-3, maxI: 0.04 };
