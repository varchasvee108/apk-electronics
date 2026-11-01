import { create } from 'zustand';
import type { Pt } from '@/model/types';

/** Where the build-along wants the next part or wire (drawn as pulsing targets on the canvas). */
interface Guide {
  pins: Pt[];
  line: [Pt, Pt] | null;
}

export const useGuide = create<Guide>(() => ({ pins: [], line: null }));
