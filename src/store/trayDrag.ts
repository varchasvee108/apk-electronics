import { create } from 'zustand';

/** A part being dragged from the parts tray (window coordinates of the finger). */
interface TrayDrag {
  type: string | null;
  name: string;
  x: number;
  y: number;
  /** The finger is over the canvas (the drop will place the part). */
  over: boolean;
}

export const useTrayDrag = create<TrayDrag>(() => ({ type: null, name: '', x: 0, y: 0, over: false }));
