import { kvGet, kvSet } from './db';
const BOOKMARKS = 'learning.bookmarks.v1';
const STUDY = 'learning.study.v1';
export interface StudyRecord {
  steps: number[];
  answers: Record<string, number>;
}
function read(key: string): unknown {
  try {
    return JSON.parse(kvGet(key) ?? 'null');
  } catch {
    return null;
  }
}
export function getBookmarks(): string[] {
  const raw = read(BOOKMARKS);
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}
export function setBookmark(id: string, saved: boolean): void {
  const ids = new Set(getBookmarks());
  if (saved) ids.add(id);
  else ids.delete(id);
  kvSet(BOOKMARKS, JSON.stringify([...ids]));
}
function studyRecords(): Record<string, unknown> {
  const raw = read(STUDY);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}
export function getStudy(id: string): StudyRecord {
  const raw = studyRecords()[id];
  if (!raw || typeof raw !== 'object') return { steps: [], answers: {} };
  const record = raw as Partial<StudyRecord>;
  const steps = Array.isArray(record.steps) ? record.steps.filter((v) => Number.isInteger(v) && v >= 0) : [];
  const answers =
    record.answers && typeof record.answers === 'object'
      ? Object.fromEntries(Object.entries(record.answers).filter(([k, v]) => /^\d+$/.test(k) && Number.isInteger(v) && v >= 0))
      : {};
  return { steps, answers };
}
export function saveStudy(id: string, record: StudyRecord): void {
  const all = studyRecords();
  all[id] = { steps: [...new Set(record.steps)], answers: record.answers };
  kvSet(STUDY, JSON.stringify(all));
}
export function resetLearningStudy(): void {
  kvSet(STUDY, '{}');
}
