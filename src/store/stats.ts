import { kvGet, kvSet } from './db';

/** Days with learning activity (YYYY-MM-DD) and best quiz scores, kept in the key-value table. */
const DAYS = 'stats.days.v1';
const QUIZ = 'stats.quiz.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = kvGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const today = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Note that the learner did something today (a lesson step, a quiz, a build). */
export function recordActivity(): void {
  try {
    const days = read<string[]>(DAYS, []);
    const t = today();
    if (days[days.length - 1] === t) return;
    kvSet(DAYS, JSON.stringify([...days.filter((d) => d !== t), t].slice(-400)));
  } catch {
    // storage unavailable
  }
}

export function activityDays(): string[] {
  const d = read<unknown>(DAYS, []);
  return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string') : [];
}

export interface QuizScore {
  best: number;
  total: number;
  last: number;
}

export function quizScores(): Record<string, QuizScore> {
  const q = read<Record<string, QuizScore>>(QUIZ, {});
  return q && typeof q === 'object' ? q : {};
}

export function saveQuizScore(unit: string, correct: number, total: number): void {
  try {
    const all = quizScores();
    const prev = all[unit];
    all[unit] = { best: Math.max(prev?.best ?? 0, correct), total, last: correct };
    kvSet(QUIZ, JSON.stringify(all));
    recordActivity();
  } catch {
    // storage unavailable
  }
}
