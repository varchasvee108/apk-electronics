import { Simulator } from '@sim/simulator';
import { ReadingAverager } from '@/sim/averager';
import { buildSnapshot, type Snapshot } from '@/sim/snapshot';
import { CHALLENGES, LESSONS, sandboxDoc } from '../lessons';
import { evaluate, newMemory, remember, type CheckContext } from '../lessonCheck';
import { extractNetlist } from '../netlist';
import type { CircuitDoc } from '../types';

/** The app's own snapshot path: averaged readings over the last frame. */
function snapshotOf(doc: CircuitDoc, s: Simulator): Snapshot {
  const ex = extractNetlist(doc);
  const avg = new ReadingAverager(
    s.devices.map((d) => d.id),
    s.nodeCount,
  );
  avg.sample(s);
  return buildSnapshot(s, doc, ex, avg);
}

describe('lessons', () => {
  test.each([...LESSONS, ...CHALLENGES].map((l) => [l.id]))('%s starting circuit loads and simulates', (id) => {
    const lesson = [...LESSONS, ...CHALLENGES].find((l) => l.id === id)!;
    const doc = lesson.build();
    const ex = extractNetlist(doc);
    expect(ex.errors).toEqual([]);
    const s = new Simulator(ex.netlist, { maxStep: 1e-3 });
    s.startTransient();
    expect(() => s.advance(0.02)).not.toThrow();
  });

  test('sandbox loads', () => {
    expect(extractNetlist(sandboxDoc()).errors).toEqual([]);
  });

  test('first-circuit: unsolved fails, solved passes', () => {
    const lesson = LESSONS.find((l) => l.id === 'first-circuit')!;
    const check = (doc: CircuitDoc) => {
      const s = new Simulator(extractNetlist(doc).netlist);
      s.startTransient();
      s.advance(0.01);
      const ctx: CheckContext = { doc, snap: snapshotOf(doc, s), ex: extractNetlist(doc), mem: newMemory(), trace: { t: [], ch: {} }, serial: () => '' };
      remember(lesson.checks, ctx);
      return lesson.checks.every((c) => evaluate(c, ctx).ok);
    };
    const doc = lesson.build();
    expect(check(doc)).toBe(false);
    doc.wires.push({ id: 'w1', a: { x: 10, y: 2 }, b: { x: 11, y: 6 }, color: '#f00' });
    doc.wires.push({ id: 'w2', a: { x: 15, y: 6 }, b: { x: 16, y: 3 }, color: '#000' });
    expect(check(doc)).toBe(true);
  });

  test('led lesson: 470 Ω gives 15 mA and passes', () => {
    const lesson = LESSONS.find((l) => l.id === 'led-resistor')!;
    const doc = lesson.build();
    doc.parts.push({ id: 'rx', type: 'resistor', x: 17, y: 8, rot: 0, props: { r: 470, maxP: 0.25 } }); // c16 → c20
    const ex = extractNetlist(doc);
    const s = new Simulator(ex.netlist);
    s.startTransient();
    s.advance(0.01);
    const ctx: CheckContext = { doc, snap: snapshotOf(doc, s), ex, mem: newMemory(), trace: { t: [], ch: {} }, serial: () => '' };
    expect(lesson.checks.map((c) => evaluate(c, ctx).ok)).toEqual([true, true]);
  });
});
