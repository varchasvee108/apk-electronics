import type { LearningLesson, LearningUnit } from './learning/types';

/**
 * Learning progress summary: per-unit completion, a day streak, what to do next, what to review and
 * badges. Pure, so it is easy to test and cheap to recompute when the progress screen opens.
 */

export interface UnitProgress {
  unit: LearningUnit;
  done: number;
  total: number;
  quiz: { best: number; total: number } | null;
}

export interface Badge {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

export interface ProgressSummary {
  units: UnitProgress[];
  lessonsDone: number;
  lessonsTotal: number;
  streak: number;
  activeDays: number;
  nextUp: LearningLesson | null;
  review: { unit: LearningUnit; reason: string }[];
  badges: Badge[];
  /** One suggestion per day, stable within the day. */
  daily: LearningLesson | null;
}

/** Consecutive days with activity ending today (or yesterday, so an unfinished day does not break it). */
export function streak(days: string[], todayIso: string): number {
  const set = new Set(days);
  const d = new Date(`${todayIso}T12:00:00`);
  if (!set.has(todayIso)) d.setDate(d.getDate() - 1);
  let n = 0;
  for (;;) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!set.has(iso)) return n;
    n++;
    d.setDate(d.getDate() - 1);
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function summarize(opts: {
  units: LearningUnit[];
  lessons: LearningLesson[];
  progress: Record<string, string>;
  quizzes: Record<string, { best: number; total: number }>;
  days: string[];
  today: string;
  quizId: (unit: string) => string;
}): ProgressSummary {
  const { units, lessons, progress, quizzes, days, today } = opts;
  const practice = lessons.filter((l) => !l.challenge);
  const unitRows: UnitProgress[] = units
    .map((u) => {
      const ls = practice.filter((l) => l.unit === u.id);
      const q = quizzes[u.id];
      return { unit: u, done: ls.filter((l) => progress[l.id] === 'done').length, total: ls.length, quiz: q ? { best: q.best, total: q.total } : null };
    })
    .filter((r) => r.total > 0);
  const lessonsDone = practice.filter((l) => progress[l.id] === 'done').length;
  const started = practice.find((l) => progress[l.id] === 'started');
  const fresh = practice.find((l) => !progress[l.id] && l.prerequisites.every((p) => progress[p] === 'done' || p === l.id));
  const review: ProgressSummary['review'] = [];
  for (const r of unitRows) {
    if (r.quiz && r.quiz.best < Math.ceil(r.quiz.total * 0.7)) review.push({ unit: r.unit, reason: `Quiz best ${r.quiz.best}/${r.quiz.total}` });
    else if (r.done > 0 && r.done < r.total && !r.quiz) review.push({ unit: r.unit, reason: `${r.done}/${r.total} lessons done` });
  }
  const doneIn = (pred: (l: LearningLesson) => boolean) => practice.filter(pred).every((l) => progress[l.id] === 'done') && practice.some(pred);
  const s = streak(days, today);
  const badges: Badge[] = [
    { id: 'first', title: 'First light', detail: 'Finish your first lesson', earned: lessonsDone >= 1 },
    { id: 'ten', title: 'Getting serious', detail: 'Finish 10 lessons', earned: lessonsDone >= 10 },
    { id: 'thirty', title: 'Bench regular', detail: 'Finish 30 lessons', earned: lessonsDone >= 30 },
    { id: 'faults', title: 'Troubleshooter', detail: 'Fix every fault-finding circuit', earned: doneIn((l) => l.unit === 'm-faults') },
    { id: 'sensors', title: 'Sensor wrangler', detail: 'Finish Sensors & modules', earned: doneIn((l) => l.unit === 'm-sensors') },
    { id: 'arduino', title: 'Code meets circuit', detail: 'Finish every Arduino lesson', earned: doneIn((l) => l.track === 'arduino') },
    { id: 'quiz', title: 'Quiz whiz', detail: 'Score full marks on 5 quizzes', earned: Object.values(quizzes).filter((q) => q.total > 0 && q.best >= q.total).length >= 5 },
    { id: 'streak', title: 'On a roll', detail: 'Learn 7 days in a row', earned: s >= 7 },
  ];
  const pool = practice.filter((l) => progress[l.id] !== 'done' && l.mode === 'simulation');
  const daily = pool.length ? pool[hash(today) % pool.length] : null;
  return {
    units: unitRows,
    lessonsDone,
    lessonsTotal: practice.length,
    streak: s,
    activeDays: new Set(days).size,
    nextUp: started ?? fresh ?? null,
    review,
    badges,
    daily,
  };
}
