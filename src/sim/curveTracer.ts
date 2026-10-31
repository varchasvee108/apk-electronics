import { Simulator } from '@sim/simulator';
import type { ElementSpec, Netlist } from '@sim/types';
import { formatEng } from '@sim/units';
import { partDef } from '@/model/parts';
import type { PartInstance } from '@/model/types';

export interface Curve {
  label: string;
  /** Device voltage (V) and current (A) at each sweep point. */
  v: number[];
  i: number[];
}

export interface TraceResult {
  title: string;
  xLabel: string;
  yLabel: string;
  curves: Curve[];
  note: string;
}

type TwoTerm = { lo: number; hi: number; rs: number; points?: number; settle?: number; note: string };

/** Sweep ranges for two-terminal parts: source voltage lo…hi through a series resistance rs. */
function twoTermRange(part: PartInstance): TwoTerm | null {
  const p = part.props;
  switch (part.type) {
    case 'resistor':
    case 'ldr':
    case 'thermistor':
    case 'fuse':
      return { lo: -5, hi: 5, rs: 1e-3, note: 'A straight line through the origin: Ohm’s law. The slope is 1 / R.' };
    case 'diode':
    case 'schottky':
      return { lo: -10, hi: 3, rs: 10, note: 'Almost no current until about 0.6 V (0.3 V for a Schottky), then the current shoots up exponentially.' };
    case 'led':
      return { lo: -6, hi: 6, rs: 100, note: 'Like a diode but with a higher knee: about 1.9 V for red up to 3.1 V for blue. Above the knee a tiny voltage change makes a big current change, which is why LEDs need a resistor.' };
    case 'zener': {
      const bv = typeof p.bv === 'number' ? p.bv : 5.1;
      return { lo: -(bv + 4), hi: 3, rs: 50, note: `Forward it is an ordinary diode; reversed it conducts sharply at its Zener voltage (−${bv} V here) and holds that voltage over a wide range of currents.` };
    }
    case 'photodiode':
      return { lo: -5, hi: 1, rs: 10, note: 'Reverse-biased, the current is set by the light level (try changing it and tracing again), not by the voltage.' };
    case 'lamp': {
      const vr = Number(String(p.type ?? '6:0.2').split(':')[0]) || 6;
      return { lo: 0, hi: vr * 1.2, rs: 1e-3, points: 25, settle: 0.6, note: 'Not a straight line: as the voltage rises the filament heats up and its resistance increases, so the curve bends over (I ∝ V^0.6).' };
    }
    case 'buzzer':
      return { lo: -5, hi: 6, rs: 1, note: 'Blocks reverse voltage; forward it behaves like a diode in series with a resistor.' };
    default:
      return null;
  }
}

/** Expand a part into elements with its pins mapped onto the given node numbers. */
function expandPart(part: PartInstance, pinNodes: number[], names: string[]): ElementSpec[] {
  const def = partDef(part.type);
  const internal = new Map<string, number>();
  return def.expand(part, {
    id: part.id,
    pin: (k) => pinNodes[k],
    internal: (name) => {
      let n = internal.get(name);
      if (n === undefined) {
        n = names.length;
        names.push(`${part.id}.${name}`);
        internal.set(name, n);
      }
      return n;
    },
  });
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1));
}

/**
 * Curve tracer: sweeps the part on its own (out of the circuit) and returns its I–V characteristic.
 * Two-terminal parts give one curve; transistors give a family of output curves.
 */
export function traceCurves(part: PartInstance): TraceResult {
  const def = partDef(part.type);
  const two = twoTermRange(part);
  if (two) {
    // node 1 = pin 1 (+), ground = pin 2; the source drives node "s" through rs
    const names = ['0', 'a', 's'];
    const els: ElementSpec[] = [
      ...expandPart(part, [1, 0], names),
      { id: '__vs', type: 'V', nodes: [2, 0], params: { v: 0 } },
      { id: '__rs', type: 'R', nodes: [2, 1], params: { r: two.rs, maxP: 0 } },
    ];
    const sim = new Simulator({ nodeNames: names, elements: els } as Netlist, { failures: false });
    const vs = sim.device('__vs')!;
    const curve: Curve = { label: def.name, v: [], i: [] };
    const sweep = (vals: number[]) => {
      if (two.settle) sim.startTransient();
      for (const v of vals) {
        vs.setParam('v', v);
        if (two.settle) {
          sim.markDiscontinuity();
          sim.advance(sim.t + two.settle);
        } else if (!sim.dcOp()) continue;
        const va = sim.v('a');
        const i = sim.read('__rs').i;
        if (Number.isFinite(va) && Number.isFinite(i)) {
          curve.v.push(va);
          curve.i.push(i);
        }
      }
    };
    // sweep outwards from 0 V so each solve starts close to the last one
    const n = two.points ?? 81;
    const neg = two.lo < 0 ? linspace(0, two.lo, Math.max(2, Math.round((n * -two.lo) / (two.hi - two.lo)))) : [];
    const pos = linspace(0, two.hi, Math.max(2, n - neg.length));
    if (neg.length) {
      sweep(neg);
      curve.v.reverse();
      curve.i.reverse();
      const keepV = curve.v.slice();
      const keepI = curve.i.slice();
      curve.v.length = 0;
      curve.i.length = 0;
      sim.device('__vs')!.setParam('v', 0);
      sweep(pos);
      curve.v.unshift(...keepV);
      curve.i.unshift(...keepI);
    } else sweep(pos);
    return { title: `${def.name} I–V curve`, xLabel: 'V across the part', yLabel: 'I through it', curves: [curve], note: two.note };
  }

  // ---------------------------------------------------------------- transistors: output characteristics
  const family = (opts: {
    pins: number[];
    drive: 'ib' | 'vgs';
    steps: number[];
    vmax: number;
    sign: number;
    label: (s: number) => string;
    title: string;
    note: string;
  }): TraceResult => {
    const names = ['0', 'b', 'c'];
    // pins: index of the part pin that is [emitter/source, base/gate, collector/drain]
    const pinNodes: number[] = [];
    pinNodes[opts.pins[0]] = 0;
    pinNodes[opts.pins[1]] = 1;
    pinNodes[opts.pins[2]] = 2;
    const els: ElementSpec[] = [
      ...expandPart(part, pinNodes, names),
      { id: '__vc', type: 'V', nodes: [2, 0], params: { v: 0 } },
      opts.drive === 'ib'
        ? { id: '__drv', type: 'I', nodes: opts.sign > 0 ? [0, 1] : [1, 0], params: { i: 0 } }
        : { id: '__drv', type: 'V', nodes: [1, 0], params: { v: 0 } },
    ];
    const sim = new Simulator({ nodeNames: names, elements: els } as Netlist, { failures: false });
    const vc = sim.device('__vc')!;
    const drv = sim.device('__drv')!;
    const curves: Curve[] = [];
    for (const step of opts.steps) {
      drv.setParam(opts.drive === 'ib' ? 'i' : 'v', opts.drive === 'ib' ? step : opts.sign * step);
      const c: Curve = { label: opts.label(step), v: [], i: [] };
      for (const v of linspace(0, opts.vmax, 61)) {
        vc.setParam('v', opts.sign * v);
        if (!sim.dcOp()) continue;
        c.v.push(v);
        c.i.push(Math.max(0, opts.sign * sim.read('__vc').i));
      }
      curves.push(c);
      vc.setParam('v', 0);
      sim.dcOp();
    }
    return { title: opts.title, xLabel: opts.drive === 'ib' ? (opts.sign > 0 ? 'V_CE' : '−V_CE') : opts.sign > 0 ? 'V_DS' : '−V_DS', yLabel: opts.drive === 'ib' ? 'I_C' : 'I_D', curves, note: opts.note };
  };

  switch (part.type) {
    case 'npn':
    case 'pnp': {
      const sign = part.type === 'npn' ? 1 : -1;
      return family({
        pins: [0, 1, 2],
        drive: 'ib',
        steps: [10e-6, 20e-6, 30e-6, 40e-6, 50e-6],
        vmax: 10,
        sign,
        label: (s) => `I_B ${formatEng(s, 'A')}`,
        title: `${def.name}: output curves`,
        note: 'Each curve is one base current. Past about 0.2 V the curves go flat: the collector current is β × I_B whatever V_CE is (active region). On the far left the transistor is saturated.',
      });
    }
    case 'tip120':
      return family({
        pins: [2, 0, 1],
        drive: 'ib',
        steps: [0.1e-3, 0.2e-3, 0.3e-3, 0.4e-3, 0.5e-3],
        vmax: 5,
        sign: 1,
        label: (s) => `I_B ${formatEng(s, 'A')}`,
        title: 'TIP120: output curves',
        note: 'A fraction of a milliamp of base current controls around an amp. Notice that the curves only rise once V_CE passes about 0.7–1 V: a Darlington never saturates as hard as a single transistor.',
      });
    case 'nmos':
    case 'pmos': {
      const sign = part.type === 'nmos' ? 1 : -1;
      return family({
        pins: [0, 1, 2],
        drive: 'vgs',
        steps: [2.5, 3, 3.5, 4, 5],
        vmax: 10,
        sign,
        label: (s) => `${sign > 0 ? '' : '−'}V_GS ${s} V`,
        title: `${def.name}: output curves`,
        note: 'Each curve is one gate voltage. Below the threshold no current flows at all. At small V_DS the MOSFET acts like a resistor (the steep part); further right the current levels off (saturation).',
      });
    }
    default:
      throw new Error('Select a two-terminal part (resistor, diode, LED, Zener, bulb, LDR…), a transistor or a MOSFET to trace its curve.');
  }
}

/** Part types the curve tracer understands. */
export function canTrace(type: string): boolean {
  return ['resistor', 'ldr', 'thermistor', 'fuse', 'diode', 'schottky', 'led', 'zener', 'photodiode', 'lamp', 'buzzer', 'npn', 'pnp', 'tip120', 'nmos', 'pmos'].includes(type);
}
