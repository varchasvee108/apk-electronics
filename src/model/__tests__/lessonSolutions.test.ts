import { Simulator } from '@sim/simulator';
import { ReadingAverager } from '@/sim/averager';
import { buildSnapshot, type Snapshot } from '@/sim/snapshot';
import { colX, hole } from '../breadboard';
import { DocBuilder, railNear } from '../build';
import { astable555 } from '../examples';
import { CHALLENGES, LESSONS, type Lesson } from '../lessons';
import { evaluate, newMemory, remember, type CheckContext } from '../lessonCheck';
import { extractNetlist, topologyKey } from '../netlist';
import type { CircuitDoc, Pt } from '../types';

/**
 * Every lesson is solved here the way a learner would (wires, values, switches, button presses),
 * and must then pass its automatic checks. The untouched starting circuit must NOT pass.
 */

type At = Pt | string;
const P = (a: At): Pt => (typeof a === 'string' ? hole(a) : a);

class Bench {
  doc: CircuitDoc;
  sim: Simulator;
  mem = newMemory();
  passed = false;
  private key: string;
  private lastSample = -1;
  trace = { t: [] as number[], ch: {} as Record<string, number[]> };

  constructor(
    doc: CircuitDoc,
    private lesson: Lesson,
    maxStep = 2e-3,
  ) {
    this.doc = JSON.parse(JSON.stringify(doc));
    const ex = extractNetlist(this.doc);
    this.sim = new Simulator(ex.netlist, { maxStep });
    this.key = topologyKey(ex.netlist);
    this.sim.startTransient();
  }

  /** Apply a document edit the way the app's controller does (params in place, else hot-swap). */
  edit(fn: (d: CircuitDoc) => void): void {
    fn(this.doc);
    const ex = extractNetlist(this.doc);
    const key = topologyKey(ex.netlist);
    if (key === this.key) {
      for (const e of ex.netlist.elements) {
        const dev = this.sim.device(e.id);
        if (!dev) continue;
        for (const [k, v] of Object.entries(e.params)) if (dev.params[k] !== v) dev.setParam(k, v);
      }
      this.sim.markDiscontinuity();
    } else {
      const next = new Simulator(ex.netlist, { maxStep: this.sim.maxStep });
      next.adoptFrom(this.sim);
      this.sim = next;
      this.key = key;
    }
  }

  wire(a: At, b: At): void {
    this.edit((d) => d.wires.push({ id: `w${d.wires.length}x`, a: P(a), b: P(b), color: '#3e63dd' }));
  }
  prop(id: string, key: string, value: number | string | boolean): void {
    this.edit((d) => {
      d.parts.find((p) => p.id === id)!.props[key] = value;
    });
  }
  /** What the inspector's Repair / Replace fuse button does. */
  repair(id: string): void {
    for (const d of this.sim.devices) if (d.partId === id || d.id === id) this.sim.repair(d.id);
  }
  probe(kind: keyof CircuitDoc['probes'], at: At): void {
    this.edit((d) => {
      d.probes[kind] = P(at);
    });
    this.avg = null;
  }

  private avg: ReadingAverager | null = null;
  private avgSim: Simulator | null = null;

  /** Averager for the current simulator (rebuilt after a hot swap), tracking the meter probes. */
  private averager(): ReadingAverager {
    if (!this.avg || this.avgSim !== this.sim) {
      this.avg = new ReadingAverager(
        this.sim.devices.map((d) => d.id),
        this.sim.nodeCount,
      );
      this.avgSim = this.sim;
      const ex = extractNetlist(this.doc);
      const node = (q?: Pt) => (q ? ex.nodeOf.get(`${q.x},${q.y}`) : undefined);
      const a = node(this.doc.probes['dmm+']);
      const b = node(this.doc.probes['dmm-']);
      this.avg.trackPair(a ?? null, b ?? null);
      this.avg.sample(this.sim);
    }
    return this.avg;
  }

  /** What the app would display now (readings averaged since the previous snapshot). */
  private snapshot(): Snapshot {
    const avg = this.averager();
    const snap = buildSnapshot(this.sim, this.doc, extractNetlist(this.doc), avg);
    avg.reset();
    return snap;
  }

  /** Run for `seconds`, evaluating the checks like the app does (on ~25 Hz snapshots). */
  run(seconds: number): void {
    const end = this.sim.t + seconds;
    this.sim.advance(end, {
      onStep: (s) => {
        this.averager().sample(s);
        // scope-style trace of CH1 / CH2 for frequency checks
        for (const k of ['ch1', 'ch2'] as const) {
          const q = this.doc.probes[k];
          if (!q) continue;
          const ex = extractNetlist(this.doc);
          (this.trace.ch[k] ??= []).push(s.nodeVoltage(ex.nodeOf.get(`${q.x},${q.y}`) ?? 0));
        }
        if (this.doc.probes.ch1 || this.doc.probes.ch2) this.trace.t.push(s.t);
        if (s.t - this.lastSample < 0.04) return;
        this.lastSample = s.t;
        this.check();
      },
    });
    this.check();
  }

  check(): void {
    const serial = (id: string) => (this.sim.device(id) as unknown as { rt?: { serial: string } })?.rt?.serial ?? '';
    const ctx: CheckContext = { doc: this.doc, snap: this.snapshot(), ex: extractNetlist(this.doc), mem: this.mem, trace: this.trace, serial };
    remember(this.lesson.checks, ctx);
    if (this.lesson.checks.every((c) => evaluate(c, ctx).ok)) this.passed = true;
  }

  report(): string {
    const serial = (id: string) => (this.sim.device(id) as unknown as { rt?: { serial: string } })?.rt?.serial ?? '';
    const ctx: CheckContext = { doc: this.doc, snap: this.snapshot(), ex: extractNetlist(this.doc), mem: this.mem, trace: this.trace, serial };
    return this.lesson.checks.map((c) => `${c.label}: ${JSON.stringify(evaluate(c, ctx))}`).join('\n');
  }
}

const press = (b: Bench, id: string, hold = 0.05) => {
  b.prop(id, 'pressed', true);
  b.run(hold);
  b.prop(id, 'pressed', false);
  b.run(0.05);
};

interface Solution {
  maxStep?: number;
  /** Time to run the unsolved circuit before asserting it does not pass. */
  idle?: number;
  solve(b: Bench): void;
}

const SOLUTIONS: Record<string, Solution> = {
  'first-circuit': {
    solve(b) {
      b.wire(railNear('top', '+', 10), 'a10');
      b.wire('a14', railNear('top', '-', 14));
      b.run(0.1);
    },
  },
  'ohms-law': { solve: (b) => (b.prop('r1', 'r', 4700), b.run(0.1)) },
  series: { solve: (b) => (b.wire('a14', 'a20'), b.run(0.1)) },
  parallel: {
    solve(b) {
      b.wire(railNear('top', '+', 10), 'a10');
      b.wire(railNear('top', '+', 20), 'a20');
      b.wire('a14', railNear('top', '-', 14));
      b.wire('a24', railNear('top', '-', 24));
      b.run(0.1);
    },
  },
  bulbs: {
    idle: 1,
    solve(b) {
      const a = hole('a14');
      b.edit((d) => {
        d.wires = d.wires.filter((w) => !(w.a.x === a.x && w.a.y === a.y));
      });
      b.wire(railNear('top', '+', 20), 'a20');
      b.wire('a14', railNear('top', '-', 14));
      b.run(1);
    },
  },
  divider: { solve: (b) => (b.prop('r2', 'r', 1000), b.run(0.1)) },
  rc: { idle: 4, solve: (b) => (b.prop('r1', 'r', 4700), b.run(4)) },
  rl: { maxStep: 1e-4, solve: (b) => (b.probe('ch1', 'b14'), b.run(0.05)) },
  'diode-direction': {
    solve(b) {
      // what two taps on Rotate do: the diode turns around in place
      b.edit((d) => {
        const p = d.parts.find((q) => q.id === 'd1')!;
        p.rot = 0;
        p.x = colX(14);
      });
      b.run(0.1);
    },
  },
  'rectifier-filter': {
    maxStep: 2e-4,
    idle: 0.3,
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'cx', type: 'ecap', x: colX(24), y: hole('d24').y, rot: 0, props: { c: 100e-6, vmax: 25 } }));
      b.run(0.3);
    },
  },
  'zener-regulator': {
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'zx', type: 'zener', x: colX(18), y: hole('d18').y, rot: 2, props: { bv: 5.1 } }));
      b.run(0.1);
    },
  },
  'led-resistor': {
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'rx', type: 'resistor', x: colX(16), y: hole('c16').y, rot: 0, props: { r: 470, maxP: 0.25 } }));
      b.run(0.1);
    },
  },
  'rgb-mixing': {
    solve(b) {
      b.wire('j30', railNear('bottom', '+', 30));
      b.wire('j32', railNear('bottom', '+', 32));
      b.run(0.1);
    },
  },
  'bjt-switch': {
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'rb', type: 'resistor', x: colX(12), y: hole('d12').y, rot: 0, props: { r: 10e3, maxP: 0.25 } }));
      b.prop('sw1', 'pressed', true);
      b.run(0.1);
    },
  },
  'bjt-bias': { solve: (b) => (b.prop('r1', 'r', 22e3), b.run(0.1)) },
  mosfet: { solve: (b) => (b.wire('a19', 'a31'), b.prop('s1', 'pos', true), b.run(0.1)) },
  'opamp-gain': {
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'rf', type: 'resistor', x: colX(31), y: hole('h31').y, rot: 0, props: { r: 20e3, maxP: 0.25 } }));
      b.wire('i35', 'i30');
      b.run(0.1);
    },
  },
  comparator: {
    solve(b) {
      b.wire('g42', 'g31');
      b.prop('ldr1', 'lux', 5);
      b.run(0.3);
      b.prop('ldr1', 'lux', 2000);
      b.run(0.3);
    },
  },
  lowpass: { solve: (b) => (b.prop('r1', 'r', 1600), b.run(0.01)) },
  '555-1hz': { idle: 5, solve: (b) => (b.prop('r555b', 'r', 68e3), b.run(5)) },
  'and-gate': { solve: (b) => (b.wire('g32', 'g40'), b.prop('s1', 'pos', true), b.prop('s2', 'pos', true), b.run(0.05)) },
  'half-adder': {
    idle: 0.05,
    solve(b) {
      b.prop('s1', 'pos', true);
      b.prop('s2', 'pos', true);
      b.run(0.05);
      b.wire('g11', 'i40');
      b.wire('g15', 'i41');
      b.run(0.05);
    },
  },
  'schmitt-oscillator': {
    idle: 2.5,
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'rf', type: 'resistor', x: colX(12), y: hole('j12').y, rot: 0, props: { r: 47e3, maxP: 0.25 } }));
      b.run(2.5);
    },
  },
  'flipflop-divider': { idle: 6, solve: (b) => (b.wire('g45', 'g41'), b.run(6)) },
  counter: { idle: 5, solve: (b) => (b.wire('j22', 'i41'), b.run(5)) },
  'shift-register': {
    idle: 0.3,
    solve(b) {
      b.wire('g30', 'c44');
      b.run(0.05);
      // shift in 1, 0, 0 and latch; then 1, 1 and latch
      b.prop('sdata', 'pos', true);
      press(b, 'bclk');
      b.prop('sdata', 'pos', false);
      press(b, 'bclk');
      press(b, 'bclk');
      press(b, 'blatch');
      b.prop('sdata', 'pos', true);
      press(b, 'bclk');
      press(b, 'bclk');
      press(b, 'blatch');
    },
  },
  sequencer: { idle: 4, solve: (b) => (b.wire('j22', 'a42'), b.run(4)) },
  'seven-seg': {
    solve(b) {
      b.wire('d44', 'd33');
      b.wire('d49', 'd34');
      b.wire('i44', 'i33');
      b.run(0.05);
    },
  },
  'bcd-decoder': { solve: (b) => (b.prop('sA', 'pos', true), b.prop('sC', 'pos', true), b.run(0.05)) },
  'arduino-blink': { maxStep: 1e-3, idle: 2.2, solve: (b) => (b.wire({ x: 30, y: 28 }, 'j30'), b.run(2.2)) },
  'arduino-button': {
    maxStep: 1e-3,
    solve(b) {
      b.wire({ x: 42, y: 28 }, 'j40');
      b.wire('j42', railNear('bottom', '-', 42));
      b.prop('sw1', 'pressed', true);
      b.run(0.05);
    },
  },
  'arduino-pot': {
    maxStep: 1e-3,
    idle: 0.3,
    solve(b) {
      b.wire({ x: 37, y: 52 }, { x: 38, y: 47 });
      b.prop('rv1', 'pos', 0.9);
      b.run(0.35);
    },
  },
  lm317: { solve: (b) => (b.prop('r2', 'r', 720), b.run(0.05)) },
  fuse: {
    solve(b) {
      b.run(0.05);
      b.prop('sw1', 'pressed', true);
      b.run(0.05);
      b.prop('sw1', 'pressed', false);
      b.run(0.05);
      b.repair('f1');
      b.run(0.1);
    },
  },
  darlington: {
    idle: 1,
    solve(b) {
      b.edit((d) => d.parts.push({ id: 'rb', type: 'resistor', x: colX(28), y: hole('d28').y, rot: 0, props: { r: 1000, maxP: 0.25 } }));
      b.prop('sw1', 'pressed', true);
      b.run(1);
    },
  },
  lm35: {
    solve(b) {
      b.prop('u1', 'tempC', 37);
      b.probe('dmm+', 'b31');
      b.probe('dmm-', railNear('top', '-', 34));
      b.run(0.05);
    },
  },
  'servo-knob': {
    maxStep: 1e-3,
    idle: 0.6,
    solve(b) {
      b.wire({ x: 37, y: 52 }, { x: 38, y: 47 });
      b.prop('rv1', 'pos', 0.5);
      b.run(0.7);
    },
  },
  // ---------------------------------------------------------------- challenges
  'ch-3v3': {
    solve(b) {
      b.edit((d) => {
        d.parts.push({ id: 'ra', type: 'resistor', x: colX(10), y: hole('c10').y, rot: 0, props: { r: 5600, maxP: 0.25 } });
        d.parts.push({ id: 'rb', type: 'resistor', x: colX(14), y: hole('d14').y, rot: 0, props: { r: 3300, maxP: 0.25 } });
      });
      b.wire(railNear('top', '+', 10), 'a10');
      b.wire('a18', railNear('top', '-', 18));
      b.probe('dmm+', 'e14');
      b.probe('dmm-', railNear('top', '-', 22));
      b.run(0.05);
    },
  },
  'ch-three-leds': {
    solve(b) {
      // three parallel branches: rail → 680 Ω → LED → rail
      for (const c of [10, 20, 30]) {
        b.edit((d) => {
          d.parts.push({ id: `r${c}`, type: 'resistor', x: colX(c), y: hole(`c${c}`).y, rot: 0, props: { r: 680, maxP: 0.25 } });
          d.parts.push({ id: `d${c}`, type: 'led', x: colX(c + 4), y: hole(`d${c + 4}`).y, rot: 0, props: { color: 'red' } });
        });
        b.wire(railNear('top', '+', c), `a${c}`);
        b.wire(`a${c + 5}`, railNear('top', '-', c + 5));
      }
      b.run(0.05);
    },
  },
  'ch-1khz': {
    maxStep: 2e-5,
    idle: 0.02,
    solve(b) {
      b.edit((d) => {
        const db = new DocBuilder('x');
        db.doc = d;
        astable555(db, 20, { r1: 1000, r2: 6800, c: 100e-9, led: false });
        d.probes.ch1 = hole('g22');
      });
      b.run(0.03);
    },
  },
  'ch-divide10': {
    maxStep: 5e-4,
    idle: 1.5,
    solve(b) {
      b.edit((d) => {
        const db = new DocBuilder('x');
        db.doc = d;
        astable555(db, 20, { r1: 1000, r2: 10e3, c: 1e-6, led: false });
        db.part('cd4017', 'e40', { id: 'u2' });
        db.wire(railNear('top', '+', 40), 'a40');
        db.wire('j47', railNear('bottom', '-', 47));
        db.wire('a43', railNear('top', '-', 43)); // INH low
        db.wire('a41', railNear('top', '-', 41)); // RST low
        db.wire('j22', 'a42'); // CLK
        d.probes.ch1 = hole('g22');
        d.probes.ch2 = hole('b44'); // CO
      });
      b.run(1.5);
    },
  },
  'ch-night': {
    idle: 0.2,
    solve(b) {
      b.edit((d) => {
        const db = new DocBuilder('x');
        db.doc = d;
        db.part('npn', 'e30', { id: 'q1' });
        db.part('resistor', 'b27', { props: { r: 47e3 }, id: 'rb' });
        db.wire(railNear('top', '+', 27), 'a27');
        db.part('ldr', 'c31', { id: 'ldr1' });
        db.wire('a33', railNear('top', '-', 33));
        db.wire('a30', railNear('top', '-', 30));
        db.part('resistor', 'b36', { props: { r: 470 }, id: 'rc' });
        db.wire(railNear('top', '+', 36), 'a36');
        db.part('led', 'c40', { id: 'd1' });
        db.wire('d41', 'd32');
      });
      b.prop('ldr1', 'lux', 5);
      b.run(0.2);
      b.prop('ldr1', 'lux', 2000);
      b.run(0.2);
    },
  },
  'ch-160hz': {
    solve(b) {
      b.edit((d) => {
        d.parts.push({ id: 'r1', type: 'resistor', x: colX(20), y: hole('c20').y, rot: 0, props: { r: 10e3, maxP: 0.25 } });
        d.parts.push({ id: 'c1', type: 'cap', x: colX(24), y: hole('d24').y, rot: 0, props: { c: 100e-9, vmax: 50 } });
      });
      b.run(0.01);
    },
  },
};

const ALL = [...LESSONS, ...CHALLENGES];

describe('every lesson is solvable and not pre-solved', () => {
  test('every lesson and challenge has a scripted solution', () => {
    const missing = ALL.filter((l) => !SOLUTIONS[l.id]).map((l) => l.id);
    expect(missing).toEqual([]);
  });

  test.each(ALL.filter((l) => SOLUTIONS[l.id]).map((l) => [l.id]))('%s', (id) => {
    const lesson = ALL.find((l) => l.id === id)!;
    const sol = SOLUTIONS[id];
    const idle = new Bench(lesson.build(), lesson, sol.maxStep);
    idle.run(sol.idle ?? 0.1);
    expect(idle.passed).toBe(false);
    const b = new Bench(lesson.build(), lesson, sol.maxStep);
    sol.solve(b);
    if (!b.passed) throw new Error(`${id} not passed:\n${b.report()}`);
  });
});
