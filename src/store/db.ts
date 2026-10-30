import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { CircuitDoc } from '@/model/types';

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync('bench.db');
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS circuits (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      json TEXT NOT NULL,
      board TEXT NOT NULL,
      origin TEXT,
      updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      lesson_id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);
  return db;
}

export interface CircuitRow {
  id: string;
  name: string;
  board: string;
  origin: string | null;
  updated: number;
}

export function listCircuits(): CircuitRow[] {
  return getDb().getAllSync<CircuitRow>('SELECT id, name, board, origin, updated FROM circuits ORDER BY updated DESC');
}

export function loadCircuit(id: string): CircuitDoc | null {
  const row = getDb().getFirstSync<{ json: string }>('SELECT json FROM circuits WHERE id = ?', id);
  if (!row) return null;
  try {
    return JSON.parse(row.json) as CircuitDoc;
  } catch {
    return null;
  }
}

export function saveCircuit(doc: CircuitDoc): void {
  const updated = Date.now();
  getDb().runSync(
    'INSERT OR REPLACE INTO circuits (id, name, json, board, origin, updated) VALUES (?, ?, ?, ?, ?, ?)',
    doc.id,
    doc.name,
    JSON.stringify({ ...doc, updatedAt: updated }),
    doc.board,
    doc.origin ?? null,
    updated,
  );
}

export function deleteCircuit(id: string): void {
  getDb().runSync('DELETE FROM circuits WHERE id = ?', id);
}

export function renameCircuit(id: string, name: string): void {
  const doc = loadCircuit(id);
  if (!doc) return;
  saveCircuit({ ...doc, name });
}

export type LessonStatus = 'started' | 'done';

export function getProgress(): Record<string, LessonStatus> {
  const rows = getDb().getAllSync<{ lesson_id: string; status: LessonStatus }>('SELECT lesson_id, status FROM progress');
  return Object.fromEntries(rows.map((r) => [r.lesson_id, r.status]));
}

export function setProgress(lessonId: string, status: LessonStatus): void {
  const cur = getProgress()[lessonId];
  if (cur === 'done' && status === 'started') return;
  getDb().runSync('INSERT OR REPLACE INTO progress (lesson_id, status, updated) VALUES (?, ?, ?)', lessonId, status, Date.now());
}

export function resetProgress(): void {
  getDb().runSync('DELETE FROM progress');
}

export function kvGet(key: string): string | null {
  return getDb().getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  getDb().runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
}
