/**
 * Web storage: the same API as db.ts, backed by localStorage (expo-sqlite on the web needs
 * cross-origin isolation headers that a static host may not send).
 */
import type { CircuitDoc } from '@/model/types';

export interface CircuitRow {
  id: string;
  name: string;
  board: string;
  origin: string | null;
  updated: number;
}
export type LessonStatus = 'started' | 'done';

const K_CIRCUITS = 'bench.circuits';
const K_PROGRESS = 'bench.progress';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: keep working in memory
  }
}

const circuits = (): Record<string, CircuitDoc> => read(K_CIRCUITS, {});

export function getDb(): null {
  return null;
}

export function listCircuits(): CircuitRow[] {
  return Object.values(circuits())
    .map((d) => ({ id: d.id, name: d.name, board: d.board, origin: d.origin ?? null, updated: d.updatedAt }))
    .sort((a, b) => b.updated - a.updated);
}

export function loadCircuit(id: string): CircuitDoc | null {
  return circuits()[id] ?? null;
}

export function saveCircuit(doc: CircuitDoc): void {
  const all = circuits();
  all[doc.id] = { ...doc, updatedAt: Date.now() };
  write(K_CIRCUITS, all);
}

export function deleteCircuit(id: string): void {
  const all = circuits();
  delete all[id];
  write(K_CIRCUITS, all);
}

export function renameCircuit(id: string, name: string): void {
  const doc = loadCircuit(id);
  if (doc) saveCircuit({ ...doc, name });
}

export function getProgress(): Record<string, LessonStatus> {
  return read(K_PROGRESS, {});
}

export function setProgress(lessonId: string, status: LessonStatus): void {
  const p = getProgress();
  if (p[lessonId] === 'done' && status === 'started') return;
  p[lessonId] = status;
  write(K_PROGRESS, p);
}

export function resetProgress(): void {
  write(K_PROGRESS, {});
}

export function kvGet(key: string): string | null {
  return read<Record<string, string>>('bench.kv', {})[key] ?? null;
}

export function kvSet(key: string, value: string): void {
  const kv = read<Record<string, string>>('bench.kv', {});
  kv[key] = value;
  write('bench.kv', kv);
}
