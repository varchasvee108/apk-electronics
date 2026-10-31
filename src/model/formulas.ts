import { formatEng as f } from '@sim/units';
import type { PartLive } from '@/sim/controller';
import type { PartInstance } from './types';

export interface Why {
  title: string;
  /** Symbolic formula. */
  formula: string;
  /** The same formula with live numbers substituted. */
  live?: string;
  note: string;
}

const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

/** The physics in play for a part, with live numbers when the circuit is running. */
export function explain(part: PartInstance, live: PartLive | null): Why[] {
  const p = part.props;
  const L = live;
  switch (part.type) {
    case 'resistor': {
      const r = n(p.r, 1000);
      return [
        {
          title: "Ohm's law",
          formula: 'I = V / R',
          live: L ? `I = ${f(L.v, 'V')} / ${f(r, 'Ω')} = ${f(L.i, 'A')}` : undefined,
          note: 'The current through a resistor is proportional to the voltage across it.',
        },
        {
          title: 'Power dissipated',
          formula: 'P = V · I = I² · R',
          live: L ? `P = ${f(L.v, 'V')} × ${f(L.i, 'A')} = ${f(Math.abs(L.v * L.i), 'W')}  (rating ${f(n(p.maxP, 0.25), 'W')})` : undefined,
          note: 'Above its power rating a resistor overheats. Bench shows smoke and eventually burns it open.',
        },
      ];
    }
    case 'led':
      return [
        {
          title: 'Current-limiting resistor',
          formula: 'R = (V_supply − V_f) / I_LED',
          live: L ? `V_f = ${f(L.v, 'V')},  I_LED = ${f(L.i, 'A')},  brightness ≈ ${Math.round(Math.min(1, n(L.extra.brightness, 0)) * 100)} %` : undefined,
          note: 'An LED holds roughly its forward voltage, so a series resistor must set the current. 5–20 mA is typical; above 30 mA it is damaged.',
        },
      ];
    case 'diode':
    case 'zener':
    case 'schottky':
    case 'photodiode':
      return [
        {
          title: 'Shockley diode equation',
          formula: 'I = Iₛ · (e^(V / n·V_T) − 1)',
          live: L ? `V = ${f(L.v, 'V')} → I = ${f(L.i, 'A')}` : undefined,
          note:
            part.type === 'zener'
              ? 'Reverse-biased above V_Z the Zener conducts and holds the voltage almost constant.'
              : 'Every extra ≈60 mV across the junction multiplies the current by ten, so the drop stays near 0.6–0.7 V for silicon.',
        },
      ];
    case 'cap':
    case 'ecap': {
      const c = n(p.c, 1e-6);
      return [
        {
          title: 'Charge and energy',
          formula: 'Q = C · V,   E = ½ · C · V²',
          live: L ? `Q = ${f(c, 'F')} × ${f(L.v, 'V')} = ${f(c * L.v, 'C')},  E = ${f(0.5 * c * L.v * L.v, 'J')}` : undefined,
          note: 'A capacitor stores charge. Its voltage cannot jump: it changes only as current flows in or out.',
        },
        {
          title: 'Capacitor current & RC time constant',
          formula: 'I = C · dV/dt,   τ = R · C',
          live: L ? `I = ${f(L.i, 'A')}` : undefined,
          note: 'Charging through a resistor R, the voltage reaches 63 % of its final value after one τ and ~99 % after 5τ.',
        },
      ];
    }
    case 'inductor': {
      const l = n(p.l, 1e-3);
      return [
        {
          title: 'Inductor voltage',
          formula: 'V = L · dI/dt,   τ = L / R',
          live: L ? `I = ${f(L.i, 'A')},  E = ½·L·I² = ${f(0.5 * l * L.i * L.i, 'J')}` : undefined,
          note: 'An inductor resists changes in current. Interrupting the current produces a voltage spike.',
        },
      ];
    }
    case 'pot':
    case 'potsensor': {
      const pos = n(p.pos, 0.5);
      return [
        {
          title: 'Voltage divider',
          formula: 'V_W = V₁ + (V₃ − V₁) · position',
          live: L ? `V_W = ${f(L.pinV[0] ?? 0, 'V')} + (${f(L.pinV[2] ?? 0, 'V')} − ${f(L.pinV[0] ?? 0, 'V')}) × ${pos.toFixed(2)} ≈ ${f((L.pinV[0] ?? 0) + ((L.pinV[2] ?? 0) - (L.pinV[0] ?? 0)) * pos, 'V')} (measured ${f(L.pinV[1] ?? 0, 'V')})` : undefined,
          note: 'The wiper splits the track into R₁ = R·pos and R₂ = R·(1−pos). A load on the wiper pulls the measured value below the ideal one.',
        },
      ];
    }
    case 'npn':
    case 'pnp': {
      const ib = n(L?.extra.ib, 0);
      const ic = n(L?.extra.ic, 0);
      return [
        {
          title: 'Transistor current gain',
          formula: 'I_C = β · I_B   (active region),   V_BE ≈ 0.65 V',
          live: L ? `I_B = ${f(ib, 'A')},  I_C = ${f(ic, 'A')},  I_C/I_B = ${Math.abs(ib) > 1e-12 ? (ic / ib).toFixed(0) : '—'},  V_BE = ${f(n(L.extra.vbe, 0), 'V')},  ${String(L.extra.region)}` : undefined,
          note: 'In saturation (a switch fully on) I_C/I_B falls below β and V_CE drops to ~0.1 V. To switch reliably give it I_B ≥ I_C/β × 2–5.',
        },
      ];
    }
    case 'nmos':
    case 'pmos':
      return [
        {
          title: 'MOSFET drain current',
          formula: 'I_D = K/2 · (V_GS − V_th)²   (saturation)',
          live: L ? `V_GS = ${f(n(L.extra.vgs, 0), 'V')},  I_D = ${f(L.i, 'A')},  ${String(L.extra.region)}` : undefined,
          note: 'Below the threshold the channel is off. Well above it the MOSFET acts as a small resistance R_DS(on).',
        },
      ];
    case 'opamp':
    case 'lm741':
    case 'lm358':
    case 'lm324': {
      const vd = n(L?.els['']?.extra?.vd ?? L?.els.a?.extra?.vd, 0);
      return [
        {
          title: 'Negative feedback',
          formula: 'V_out = A · (V₊ − V₋)  ⇒  with feedback V₊ ≈ V₋',
          live: L ? `V₊ − V₋ = ${f(vd, 'V')}  (tiny when feedback works)` : undefined,
          note: 'Inverting gain = −R_f/R_in; non-inverting gain = 1 + R_f/R_g. If the output is pinned at a rail, the op-amp is saturated and the rule V₊ ≈ V₋ no longer holds.',
        },
      ];
    }
    case 'ne555': {
      const vcc = n(L?.extra.vcc, 0);
      return [
        {
          title: '555 thresholds',
          formula: 'charge until ⅔·V_CC, discharge until ⅓·V_CC,   f = 1.44 / ((R₁ + 2R₂)·C)',
          live: L ? `V_CC = ${f(vcc, 'V')} → thresholds ${f(vcc / 3, 'V')} and ${f((2 * vcc) / 3, 'V')};  output ${String(L.extra.out)}` : undefined,
          note: 'High time = 0.693·(R₁+R₂)·C, low time = 0.693·R₂·C.',
        },
      ];
    }
    case 'tip120': {
      const q1 = L?.els.q1?.extra ?? {};
      const ib = n(q1.ib, 0) + n(L?.els.r1?.i, 0);
      const ic = n(L?.extra.ic, 0) + n(q1.ic, 0);
      const vbe = L ? (L.pinV[0] ?? 0) - (L.pinV[2] ?? 0) : 0;
      const vce = L ? (L.pinV[1] ?? 0) - (L.pinV[2] ?? 0) : 0;
      return [
        {
          title: 'Darlington gain',
          formula: 'I_C ≈ β₁ · β₂ · I_B,   V_BE ≈ 2 × 0.7 V',
          live: L ? `I_B = ${f(ib, 'A')},  I_C = ${f(ic, 'A')},  gain ≈ ${Math.abs(ib) > 1e-9 ? Math.round(ic / ib) : '—'},  V_BE = ${f(vbe, 'V')},  V_CE = ${f(vce, 'V')}` : undefined,
          note: 'Huge gain means a tiny base current switches amps. The cost: V_CE stays near 0.8 V or more even when fully on, so it dissipates P = V_CE · I_C.',
        },
      ];
    }
    case 'lm317':
      return [
        {
          title: 'Setting the output',
          formula: 'V_out = 1.25 V · (1 + R2 / R1)',
          live: L ? `V(OUT) − V(ADJ) = ${f(L.v, 'V')},  P = ${f(Math.abs(L.p), 'W')}${L.extra.dropout ? '  (in dropout: raise V_in)' : ''}` : undefined,
          note: 'R1 (OUT → ADJ) sets the current 1.25 V / R1; the same current through R2 (ADJ → GND) adds 1.25 V · R2 / R1. Keep V_in at least 1.7 V above V_out.',
        },
      ];
    case 'lm35': {
      const t = n(p.tempC, 25);
      return [
        {
          title: '10 mV per degree',
          formula: 'V_out = 10 mV/°C × T',
          live: `${t} °C → expected ${f(t * 0.01, 'V')}${L ? `, measured ${f(L.v, 'V')}` : ''}`,
          note: 'On an Arduino: T = reading × 5 V / 1023 / 10 mV ≈ reading × 0.49 °C.',
        },
      ];
    }
    case 'fuse': {
      const rating = n(p.rating, 0.5);
      return [
        {
          title: 'Fuse rating',
          formula: 'blows when I stays above the rating (I²R heats the wire)',
          live: L ? (L.failed ? 'Blown: the circuit is open.' : `I = ${f(Math.abs(L.i), 'A')} of ${f(rating, 'A')} (${Math.round((Math.abs(L.i) / rating) * 100)} %)`) : undefined,
          note: 'Pick a rating a little above the normal current. 2× the rating blows it in about a tenth of a second; a short circuit, instantly.',
        },
      ];
    }
    case 'lamp': {
      const [vr, ir] = String(p.type ?? '6:0.2').split(':').map(Number);
      return [
        {
          title: 'A resistance that depends on temperature',
          formula: 'R_hot = V_rated / I_rated,   R_cold ≈ R_hot / 10,   I ∝ V^0.6',
          live: L ? `R now = ${f(n(L.extra.r, 0), 'Ω')} (hot ${f(vr / ir, 'Ω')}),  I = ${f(Math.abs(L.i), 'A')},  P = ${f(Math.abs(L.p), 'W')}` : undefined,
          note: 'Doubling the voltage does not double the current: the filament gets hotter and its resistance rises. Light output rises much faster than power.',
        },
      ];
    }
    case 'servo': {
      const pw = n(L?.extra.pw, 0);
      return [
        {
          title: 'Pulse width → angle',
          formula: 'angle = (t_pulse − 1 ms) / 1 ms × 180°,   one pulse every 20 ms',
          live: L ? (pw > 0 ? `pulse ${f(pw, 's')} → target ${Math.round(n(L.extra.target, 0))}°, now ${Math.round(n(L.extra.angle, 0))}°` : 'No control pulses yet: the servo holds still.') : undefined,
          note: 'The servo compares the requested angle with a potentiometer on its shaft and drives its motor until they match.',
        },
      ];
    }
    case 'rgbled':
      return [
        {
          title: 'Additive colour',
          formula: 'R + G = yellow,  R + B = magenta,  G + B = cyan,  R + G + B = white',
          live: L ? `R ${f(n(L.els.r?.i, 0), 'A')},  G ${f(n(L.els.g?.i, 0), 'A')},  B ${f(n(L.els.b?.i, 0), 'A')}` : undefined,
          note: 'Each colour is its own LED with its own forward voltage, so each needs its own resistor.',
        },
      ];
    case 'lm7805':
      return [
        {
          title: 'Linear regulator heat',
          formula: 'P = (V_in − V_out) · I_out',
          live: L ? `P = (${f(n(L.extra.vin, 0), 'V')} − ${f(L.v, 'V')}) × ${f(L.i, 'A')} = ${f(L.p, 'W')}` : undefined,
          note: 'Everything above 5 V is burned as heat. It needs V_in ≥ 7 V to regulate (dropout ≈ 2 V).',
        },
      ];
    case 'battery':
      return [
        {
          title: 'Internal resistance',
          formula: 'V_terminal = EMF − I · r',
          live: L ? `V = ${f(L.v, 'V')} while delivering ${f(L.i, 'A')}` : undefined,
          note: 'The terminal voltage sags under load. A short circuit is limited only by r.',
        },
      ];
    case 'supply':
      return [
        {
          title: 'Constant voltage / constant current',
          formula: 'CV: V = V_set while I < I_lim;   CC: I = I_lim',
          live: L ? `${String(L.extra.mode)}: ${f(L.v, 'V')} at ${f(L.i, 'A')}` : undefined,
          note: 'The current limit protects your circuit from mistakes.',
        },
      ];
    case 'funcgen':
    case 'acsource': {
      const a = n(p.amp, 1);
      const fr = n(p.freq, 1000);
      return [
        {
          title: 'Signal basics',
          formula: 'T = 1/f,   V_rms = V_peak / √2 (sine),   ω = 2πf',
          live: `T = ${f(1 / fr, 's')},  V_rms = ${f(a / Math.SQRT2, 'V')},  ω = ${f(2 * Math.PI * fr, 'rad/s')}`,
          note: 'Capacitive reactance X_C = 1/(ωC) falls with frequency; inductive reactance X_L = ωL rises.',
        },
      ];
    }
    case 'ldr':
      return [
        {
          title: 'Light-dependent resistance',
          formula: 'R ≈ 20 kΩ · (lux / 10)^−0.7',
          live: `${Math.round(n(p.lux, 300))} lx → R ≈ ${f(Math.min(1e6, 20e3 * Math.pow(Math.max(0.1, n(p.lux, 300)) / 10, -0.7)), 'Ω')}`,
          note: 'Use it with a fixed resistor as a divider so the voltage follows the light.',
        },
      ];
    case 'thermistor': {
      const T = n(p.tempC, 25) + 273.15;
      const r = n(p.r25, 10000) * Math.exp(n(p.beta, 3950) * (1 / T - 1 / 298.15));
      return [
        {
          title: 'NTC β equation',
          formula: 'R = R₂₅ · e^(β·(1/T − 1/298.15 K))',
          live: `${n(p.tempC, 25)} °C → R = ${f(r, 'Ω')}`,
          note: 'Resistance falls as temperature rises.',
        },
      ];
    }
    case 'motor':
      return [
        {
          title: 'Back-EMF',
          formula: 'V = I·R + k·ω,   τ = k·I',
          live: L ? `${Math.round(n(L.extra.rpm, 0))} rpm, back-EMF ${f(n(L.extra.backEmf, 0), 'V')}, I = ${f(L.i, 'A')}` : undefined,
          note: 'A spinning motor generates a voltage that opposes the supply, so its current drops as it speeds up.',
        },
      ];
    case 'relay':
      return [
        {
          title: 'Coil current',
          formula: 'I_coil = V_coil / R_coil;  pull-in ≈ 50 mA, drop-out ≈ 15 mA',
          live: L ? `I_coil = ${f(L.i, 'A')} → ${L.extra.energized ? 'energised (COM–NO)' : 'released (COM–NC)'}` : undefined,
          note: 'Fit a flyback diode across the coil to absorb the spike when it switches off.',
        },
      ];
    default:
      if (part.type.startsWith('ic') || part.type === 'cd4017') {
        return [
          {
            title: 'Logic levels',
            formula: 'input reads 1 above ≈ V_CC/2, 0 below',
            live: L ? `V_CC = ${f(L.v, 'V')}, pins (1 → n): ${String(L.extra.levels ?? '')}` : undefined,
            note: 'Every chip needs VCC and GND connected. Unused inputs must be tied high or low.',
          },
        ];
      }
      return [];
  }
}
