import type { LearningLesson, LearningMode, TrackId } from './types';
export interface LessonFilters {
  query: string;
  track: TrackId | 'all';
  mode: LearningMode | 'all';
  status: 'all' | 'not-done' | 'done';
  savedOnly: boolean;
  sort: 'curriculum' | 'title' | 'duration';
}
export const DEFAULT_FILTERS: LessonFilters = { query: '', track: 'all', mode: 'all', status: 'all', savedOnly: false, sort: 'curriculum' };
export function filterLessons(lessons: LearningLesson[], filters: LessonFilters, progress: Record<string, string>, saved: string[]): LearningLesson[] {
  const query = filters.query.trim().toLowerCase();
  const result = lessons.filter(
    (l) =>
      (filters.track === 'all' || l.track === filters.track) &&
      (filters.mode === 'all' || l.mode === filters.mode) &&
      (filters.status === 'all' || (filters.status === 'done' ? progress[l.id] === 'done' : progress[l.id] !== 'done')) &&
      (!filters.savedOnly || saved.includes(l.id)) &&
      (!query || [l.title, l.goal, l.unit, l.track, ...l.intro].join(' ').toLowerCase().includes(query)),
  );
  if (filters.sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title));
  if (filters.sort === 'duration') result.sort((a, b) => a.minutes - b.minutes || a.title.localeCompare(b.title));
  return result;
}
