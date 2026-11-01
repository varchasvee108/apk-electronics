import { decodeCircuit, encodeCircuit } from '@/lib/shareLink';
import { blankFor, buildSteps, stepStates } from '../buildAlong';
import { EXAMPLES } from '../examples';
import { summarize, streak } from '../progress';
import { ALL_LESSONS, UNITS } from '../learning/curriculum';
import { hole } from '../breadboard';

describe('build-along', () => {
  test.each(EXAMPLES.map((e) => [e.id, e]))('%s can be built step by step', (_id, ex) => {
    const target = ex.build();
    const steps = buildSteps(target);
    expect(steps.length).toBe(target.parts.length + target.wires.length);
    const doc = blankFor(target, 'b1');
    expect(stepStates(doc, steps).every((s) => s === 'todo')).toBe(true);
    expect(stepStates(target, steps).every((s) => s === 'done')).toBe(true);
    // doing each step in order completes it
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.kind === 'part') doc.parts.push({ ...s.target, props: { ...s.target.props } });
      else doc.wires.push({ ...s.target });
      expect(stepStates(doc, steps)[i]).toBe('done');
    }
  });

  test('another hole of the same strip counts, a wrong value is flagged', () => {
    const target = EXAMPLES.find((e) => e.id === 'led-resistor')!.build();
    const steps = buildSteps(target);
    const doc = blankFor(target, 'b2');
    const rIdx = steps.findIndex((s) => s.kind === 'part' && s.target.type === 'resistor');
    const r = steps[rIdx];
    if (r.kind !== 'part') throw new Error('no resistor');
    // one row higher (same strips), different value
    doc.parts.push({ ...r.target, y: r.target.y - 1, props: { ...r.target.props, r: 1 } });
    expect(stepStates(doc, steps)[rIdx]).toBe('wrongValue');
    doc.parts[0].props.r = r.target.props.r;
    expect(stepStates(doc, steps)[rIdx]).toBe('done');
    void hole;
  });
});

describe('share links', () => {
  test.each(EXAMPLES.map((e) => [e.id, e]))('%s survives a link round trip', (_id, ex) => {
    const doc = ex.build();
    const back = decodeCircuit(encodeCircuit(doc));
    expect(back.parts.map((p) => [p.type, p.x, p.y, p.rot])).toEqual(doc.parts.map((p) => [p.type, p.x, p.y, p.rot]));
    expect(back.wires.map((w) => [w.a, w.b])).toEqual(doc.wires.map((w) => [w.a, w.b]));
    const uno = back.parts.find((p) => p.type === 'arduino');
    if (uno) expect(String(uno.props.hex).length).toBeGreaterThan(20);
  });

  test('typical circuits fit in a QR code', () => {
    const small = EXAMPLES.filter((e) => ['led-resistor', 'arduino-blink', 'ultrasonic'].includes(e.id));
    for (const e of small) expect(`bench://open?c=${encodeCircuit(e.build())}`.length).toBeLessThan(2800);
  });
});

describe('progress summary', () => {
  test('streak counts consecutive days up to today or yesterday', () => {
    expect(streak(['2026-10-29', '2026-10-30', '2026-10-31'], '2026-11-01')).toBe(3);
    expect(streak(['2026-10-30', '2026-11-01'], '2026-11-01')).toBe(1);
    expect(streak([], '2026-11-01')).toBe(0);
  });

  test('summarises lessons, suggests the next one and awards badges', () => {
    const first = ALL_LESSONS[0];
    const s = summarize({ units: UNITS, lessons: ALL_LESSONS, progress: { [first.id]: 'done' }, quizzes: { u1: { best: 1, total: 3 } }, days: ['2026-11-01'], today: '2026-11-01', quizId: (u) => `quiz-${u}` });
    expect(s.lessonsDone).toBe(1);
    expect(s.badges.find((b) => b.id === 'first')!.earned).toBe(true);
    expect(s.review.some((r) => r.unit.id === 'u1')).toBe(true);
    expect(s.nextUp).not.toBeNull();
    expect(s.daily).not.toBeNull();
  });
});
