import { create } from 'zustand';
import { kvGet, kvSet } from './db';

export type ThemePref = 'system' | 'light' | 'dark';

interface Prefs {
  haptics: boolean;
  sounds: boolean;
  /** Applied at launch (the app restarts to switch). */
  theme: ThemePref;
}

const KEY = 'prefs';
const DEFAULTS: Prefs = { haptics: true, sounds: true, theme: 'system' };

/** Read the stored preferences synchronously (also used by the theme before any screen renders). */
export function readPrefs(): Prefs {
  try {
    const raw = kvGet(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface PrefState extends Prefs {
  set(p: Partial<Prefs>): void;
}

export const usePrefs = create<PrefState>((set, get) => ({
  ...readPrefs(),
  set(p) {
    set(p);
    const { haptics, sounds, theme } = { ...get(), ...p };
    try {
      kvSet(KEY, JSON.stringify({ haptics, sounds, theme }));
    } catch {
      // storage unavailable (private browsing): keep the in-memory value
    }
  },
}));
