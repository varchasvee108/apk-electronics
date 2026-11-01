import { Simulator } from '@sim/simulator';
import { ReadingAverager } from '@/sim/averager';
import { buildSnapshot } from '@/sim/snapshot';
import { hole } from '../breadboard';
import { railNear } from '../build';
import { newMemory, remember } from '../lessonCheck';
import { originalChecks, evaluateLearningCheck } from '../learning/checks';
import { ALL_LESSONS, QUIZZES, UNITS } from '../learning/curriculum';
import { PRACTICE_LESSONS, PRACTICE_UNITS } from '../learning/practice';
import type { LearningLesson } from '../learning/types';
import { extractNetlist } from '../netlist';
import { newId, ptKey, type CircuitDoc, type Pt } from '../types';

/** Run a lesson circuit like the app does and report whether every check passed at some frame. */
function passes(lesson: LearningLesson, fix: ((d: CircuitDoc) => void) | null, seconds: number, maxStep = 5e-4): boolean {
  const doc = lesson.build!();
  fix?.(doc);
  const ex = extractNetlist(doc);
  const sim = new Simulator(ex.netlist, { maxStep });
  sim.startTransient();
  const mem = newMemory();
  const node = (p?: Pt) => (p ? ex.nodeOf.get(ptKey(p)) ?? null : null);
  for (let t = 0.04; t <= seconds + 1e-9; t += 0.04) {
    const avg = new ReadingAverager(
      sim.devices.map((d) => d.id),
      sim.nodeCount,
    );
    avg.trackPair(node(doc.probes['dmm+']), node(doc.probes['dmm-']));
    avg.sample(sim);
    sim.advance(t, { onStep: (s) => void avg.sample(s) });
    const snap = buildSnapshot(sim, doc, ex, avg);
    const ctx = { doc, snap, ex, mem, trace: { t: [], ch: {} }, serial: (id: string) => (sim.device(id) as unknown as { rt?: { serial: string } })?.rt?.serial ?? '' };
    remember(originalChecks(lesson.checks), ctx);
    if (lesson.checks.every((c) => evaluateLearningCheck(c, ctx).ok)) return true;
  }
  return false;
}

const wire = (d: CircuitDoc, a: Pt | string, b: Pt | string) =>
  d.wires.push({ id: newId('w'), a: typeof a === 'string' ? hole(a) : a, b: typeof b === 'string' ? hole(b) : b, color: '#3e63dd' });
const part = (d: CircuitDoc, id: string) => d.parts.find((p) => p.id === id)!;
const put = (d: CircuitDoc, id: string, at: string, rot: 0 | 1 | 2 | 3 = 0) => Object.assign(part(d, id), { ...hole(at), rot });

const FIXES: Record<string, { fix: (d: CircuitDoc) => void; seconds: number; untouchedPasses?: boolean }> = {
  'fault-backwards-led': { fix: (d) => put(d, 'd1', 'd14'), seconds: 0.2 },
  'fault-same-strip': { fix: (d) => put(d, 'r1', 'c10'), seconds: 0.2 },
  'fault-open-loop': { fix: (d) => wire(d, 'a15', railNear('top', '-', 16)), seconds: 0.2 },
  'fault-split-rail': {
    fix: (d) => {
      wire(d, { x: 32, y: 2 }, { x: 34, y: 2 });
      wire(d, { x: 32, y: 3 }, { x: 34, y: 3 });
    },
    seconds: 0.2,
  },
  'fault-wrong-value': { fix: (d) => (part(d, 'r1').props.r = 470), seconds: 0.2 },
  'fault-transistor': { fix: (d) => put(d, 'q1', 'e19', 2), seconds: 0.2 },
  'fault-short': { fix: (d) => (d.wires = d.wires.filter((w) => !(w.a.x === 41 && w.a.y === 2 && w.b.y === 3))), seconds: 0.2 },
  'fault-common-ground': { fix: (d) => wire(d, railNear('bottom', '-', 28), { x: 29, y: 28 }), seconds: 2.4 },
  'pir-light': {
    fix: (d) => {
      wire(d, { x: 41, y: -8 }, 'a30');
      part(d, 'pir1').props.motion = true;
    },
    seconds: 0.3,
  },
  'ultrasonic-range': { fix: (d) => (part(d, 'us1').props.dist = 15), seconds: 0.4 },
  'lcd-wire-e': { fix: (d) => wire(d, { x: 55, y: 44 }, { x: 32, y: 28 }), seconds: 0.25 },
  'stepper-power': { fix: (d) => wire(d, { x: 24, y: -8 }, railNear('top', '+', 25)), seconds: 0.8 },
  'hbridge-reverse': { fix: (d) => wire(d, 'j30', { x: 31, y: 20 }), seconds: 4.4 },
  'piezo-pitch': { fix: (d) => (part(d, 'c555').props.c = 220e-9), seconds: 0.05 },
  'soil-wet': { fix: (d) => (part(d, 'sm1').props.moisture = 80), seconds: 0.2 },
  'battery-runs-down': { fix: () => undefined, seconds: 40, untouchedPasses: true },
};

describe('sensor and troubleshooting lessons', () => {
  test('are registered with units and quizzes', () => {
    for (const u of PRACTICE_UNITS) {
      expect(UNITS.some((x) => x.id === u.id)).toBe(true);
      expect(QUIZZES[u.id].length).toBeGreaterThan(2);
    }
    for (const l of PRACTICE_LESSONS) expect(ALL_LESSONS.filter((x) => x.id === l.id)).toHaveLength(1);
    expect(Object.keys(FIXES).sort()).toEqual(PRACTICE_LESSONS.map((l) => l.id).sort());
  });

  test.each(PRACTICE_LESSONS.map((l) => [l.id, l]))('%s: broken at first, solved by the fix', (id, lesson) => {
    const f = FIXES[id];
    const step = id.startsWith('piezo') ? 2e-5 : id === 'battery-runs-down' ? 5e-3 : 5e-4;
    if (!f.untouchedPasses) expect(passes(lesson, null, f.seconds, step)).toBe(false);
    expect(passes(lesson, f.fix, f.seconds, step)).toBe(true);
  });
});
