import { useEffect, useRef } from 'react';
import * as haptic from '@/lib/haptics';
import { play, setTone, stopAll } from '@/lib/sound';
import { useCircuit } from '@/store/circuit';
import { useSim } from './store';
import type { Snapshot } from './snapshot';

/** Fixed pitch of an active buzzer's built-in oscillator. */
const ACTIVE_BUZZER_HZ = 2300;

/** The pitch the circuit is making right now (the first sounding buzzer), or null. */
export function soundingTone(snap: Snapshot | null, parts: { id: string; type: string }[]): number | null {
  if (!snap) return null;
  for (const p of parts) {
    const live = snap.parts[p.id];
    if (!live || live.failed) continue;
    if (p.type === 'buzzer' && (live.pinV[0] ?? 0) - (live.pinV[1] ?? 0) > 2) return ACTIVE_BUZZER_HZ;
    if (p.type === 'piezo' && live.extra.sounding) return Number(live.extra.freq) || null;
  }
  return null;
}

/**
 * Sounds and haptics that follow the running circuit: buzzer tones, a pop or crack when a part fails
 * (fuse, capacitor, LED…), a click when a relay switches. Mount once per workbench.
 */
export function useCircuitFeedback(): void {
  const failed = useRef(new Set<string>());
  const relays = useRef(new Map<string, boolean>());

  useEffect(() => {
    const unsub = useSim.subscribe((st, prev) => {
      if (st.snapshot === prev.snapshot && st.status === prev.status) return;
      const parts = useCircuit.getState().doc.parts;
      const snap = st.status === 'running' ? st.snapshot : null;
      setTone(soundingTone(snap, parts));
      if (!st.snapshot || st.status === 'off') {
        failed.current.clear();
        relays.current.clear();
        return;
      }
      for (const p of parts) {
        const live = st.snapshot.parts[p.id];
        if (!live) continue;
        if (live.failed && !failed.current.has(p.id)) {
          failed.current.add(p.id);
          play(p.type === 'fuse' || p.type === 'ecap' || p.type === 'cap' ? 'pop' : 'crack');
          haptic.error();
        } else if (!live.failed) failed.current.delete(p.id);
        if (p.type === 'relay') {
          const on = !!live.extra.energized;
          const was = relays.current.get(p.id);
          if (was !== undefined && was !== on) {
            play('click');
            haptic.bump();
          }
          relays.current.set(p.id, on);
        }
      }
    });
    return () => {
      unsub();
      stopAll();
    };
  }, []);
}
