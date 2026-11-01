import { Simulator } from '@sim/simulator';
import { LESSONS, CHALLENGES, UNITS as ORIGINAL_UNITS } from '../lessons';
import { QUIZZES as ORIGINAL_QUIZZES } from '../quizzes';
import { ALL_LESSONS, LEARNING_LESSONS, UNITS, QUIZZES, findLesson, practiceById } from '../learning/curriculum';
import { WEB_LESSONS } from '../learning/content';
import { evaluateExtraCheck, evaluateLearningCheck, originalChecks } from '../learning/checks';
import { DEFAULT_FILTERS, filterLessons } from '../learning/query';
import { evaluate, newMemory, type CheckContext } from '../lessonCheck';
import { extractNetlist, nodeAt } from '../netlist';
import { ReadingAverager } from '@/sim/averager';
import { buildSnapshot } from '@/sim/snapshot';

describe('additive mobile curriculum', () => {
  test('adds 30 records and seven units without replacing any original lesson', () => {
    expect(WEB_LESSONS).toHaveLength(30);
    expect(LEARNING_LESSONS).toHaveLength(83);
    expect(ALL_LESSONS).toHaveLength(89);
    expect(UNITS).toHaveLength(ORIGINAL_UNITS.length + 9);
    expect(new Set(ALL_LESSONS.map((l) => l.id)).size).toBe(89);
    expect(LEARNING_LESSONS.slice(0, LESSONS.length).map((l) => l.id)).toEqual(LESSONS.map((l) => l.id));
    for (const original of [...LESSONS, ...CHALLENGES]) {
      expect(practiceById(original.id)).toBe(original);
      expect(findLesson(original.id)!.build).toBe(original.build);
      expect(findLesson(original.id)!.checks).toBe(original.checks);
    }
    for (const unit of ORIGINAL_UNITS) expect(QUIZZES[unit.id]).toBe(ORIGINAL_QUIZZES[unit.id]);
  });
  test.each(WEB_LESSONS.map((l) => [l.id]))('%s has complete teaching content and valid prerequisites', (id) => {
    const l = findLesson(id)!;
    expect(l.goal.length).toBeGreaterThan(20);
    expect(l.steps.length).toBeGreaterThanOrEqual(3);
    expect(l.worked.length).toBeGreaterThan(20);
    expect(l.mechanism.length).toBeGreaterThan(30);
    for (const p of l.prerequisites) expect(findLesson(p)).toBeDefined();
    expect(UNITS.some((u) => u.id === l.unit)).toBe(true);
    for (const q of l.questions) {
      expect(q.options[q.answer]).toBeTruthy();
      expect(q.why.length).toBeGreaterThan(20);
    }
    expect(Boolean(l.build)).toBe(l.mode === 'simulation');
    if (l.track === 'raspberry-pi') {
      expect(l.mode).toBe('guide');
      expect(practiceById(l.id)).toBeUndefined();
    }
  });
  test.each(WEB_LESSONS.filter((l) => l.experiment).map((l) => [l.id]))('%s builds and simulates in the unmodified mobile solver', (id) => {
    const lesson = practiceById(id)!;
    expect(lesson.checks.length).toBeGreaterThan(0);
    const doc = lesson.build(),
      ex = extractNetlist(doc);
    expect(ex.errors).toEqual([]);
    const sim = new Simulator(ex.netlist, { maxStep: 1e-3 });
    sim.startTransient();
    expect(() => sim.advance(0.02)).not.toThrow();
    expect(sim.error).toBeNull();
  });
  test.each(['ic-nand', 'ic-xor', 'ic-or'])('%s verifies a real gate output instead of static study', (id) => {
    const lesson = practiceById(id)!,
      doc = lesson.build();
    doc.parts.find((p) => p.id === 's1')!.props.pos = true;
    doc.parts.find((p) => p.id === 's2')!.props.pos = id === 'ic-nand';
    const ex = extractNetlist(doc),
      sim = new Simulator(ex.netlist);
    sim.startTransient();
    sim.advance(0.002);
    const avg = new ReadingAverager(
      sim.devices.map((d) => d.id),
      sim.nodeCount,
    );
    avg.trackPair(nodeAt(ex, doc.probes['dmm+']!) ?? null, nodeAt(ex, doc.probes['dmm-']!) ?? null);
    avg.sample(sim);
    const ctx: CheckContext = { doc, ex, snap: buildSnapshot(sim, doc, ex, avg), mem: newMemory(), trace: { t: [], ch: {} }, serial: () => '' };
    expect(lesson.checks.every((c) => evaluateLearningCheck(c, ctx).ok)).toBe(true);
  });
  test('old checkpoint evaluation is unchanged and new serial/gain checks require evidence', () => {
    const lesson = LESSONS[0],
      doc = lesson.build(),
      ctx: CheckContext = { doc, snap: null, ex: null, mem: newMemory(), trace: { t: [], ch: {} }, serial: () => '' };
    expect(originalChecks(lesson.checks)).toEqual(lesson.checks);
    for (const c of lesson.checks) expect(evaluateLearningCheck(c, ctx)).toEqual(evaluate(c, ctx));
    const serial = { kind: 'serialContains' as const, part: 'uno', text: 'Bench', label: 'Echo' };
    expect(evaluateExtraCheck(serial, ctx)!.ok).toBe(false);
    expect(evaluateExtraCheck(serial, { ...ctx, serial: () => 'Bench\n' })!.ok).toBe(true);
    const a = Array.from({ length: 50 }, (_, i) => Math.sin(i / 4));
    const gain = { kind: 'traceGain' as const, min: 4.1, max: 5.3, label: 'Gain' };
    expect(evaluateExtraCheck(gain, { ...ctx, trace: { t: [], ch: { ch1: a, ch2: a.map((v) => -4.7 * v) } } })!.ok).toBe(true);
    expect(evaluateExtraCheck(gain, ctx)!.ok).toBe(false);
  });
  test('search, track, format, bookmark and progress filters are independent and default order stays intact', () => {
    expect(filterLessons(LEARNING_LESSONS, DEFAULT_FILTERS, {}, [])).toEqual(LEARNING_LESSONS);
    const pi = filterLessons(LEARNING_LESSONS, { ...DEFAULT_FILTERS, track: 'raspberry-pi' }, {}, []);
    expect(pi).toHaveLength(10);
    expect(pi.every((l) => l.mode === 'guide')).toBe(true);
    const saved = filterLessons(LEARNING_LESSONS, { ...DEFAULT_FILTERS, savedOnly: true }, {}, ['ic-nand']);
    expect(saved.map((l) => l.id)).toEqual(['ic-nand']);
    expect(filterLessons(LEARNING_LESSONS, { ...DEFAULT_FILTERS, status: 'done' }, { 'first-circuit': 'done' }, []).map((l) => l.id)).toEqual([
      'first-circuit',
    ]);
    const sorted = filterLessons(LEARNING_LESSONS, { ...DEFAULT_FILTERS, sort: 'duration' }, {}, []);
    expect(sorted.map((l) => l.minutes)).toEqual(sorted.map((l) => l.minutes).sort((a, b) => a - b));
    expect(filterLessons(LEARNING_LESSONS, { ...DEFAULT_FILTERS, query: 'MCP3008' }, {}, []).some((l) => l.id === 'pi-spi-adc')).toBe(true);
  });
});
