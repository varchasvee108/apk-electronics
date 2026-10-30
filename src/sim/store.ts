import { create } from 'zustand';
import type { Diagnostic } from '@sim/types';
import type { DmmMode, Snapshot } from './controller';

export type SimStatus = 'off' | 'running' | 'paused' | 'error';

interface SimState {
  status: SimStatus;
  snapshot: Snapshot | null;
  diagnostics: Diagnostic[];
  error: Diagnostic | null;
  simTime: number;
  speed: number;
  timeScale: number;
  dmmMode: DmmMode;
  /** Bumped whenever new trace samples may exist. */
  traceVersion: number;
}

export const useSim = create<SimState>(() => ({
  status: 'off',
  snapshot: null,
  diagnostics: [],
  error: null,
  simTime: 0,
  speed: 0,
  timeScale: 1,
  dmmMode: 'V',
  traceVersion: 0,
}));
