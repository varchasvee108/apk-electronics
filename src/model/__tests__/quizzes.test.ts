import { UNITS } from '../lessons';
import { QUIZZES } from '../quizzes';

describe('unit quizzes', () => {
  test('every unit has a quiz', () => {
    expect(UNITS.filter((u) => !QUIZZES[u.id]).map((u) => u.id)).toEqual([]);
  });

  test.each(Object.entries(QUIZZES))('%s questions are well formed', (_unit, qs) => {
    expect(qs.length).toBeGreaterThanOrEqual(3);
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.why.length).toBeGreaterThan(10);
    }
  });

  test('correct answers are not always in the same position', () => {
    const positions = new Set(Object.values(QUIZZES).flatMap((qs) => qs.map((q) => q.answer)));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });
});
