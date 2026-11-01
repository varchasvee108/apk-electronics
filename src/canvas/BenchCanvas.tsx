import { Canvas, Circle, DashPathEffect, Group, Line, Path, Picture, Rect, RoundedRect, Skia, useCanvasRef, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useLongPressGesture,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { formatEng } from '@sim/units';
import { allHoles, holeAt } from '@/model/breadboard';
import { loosePins, settleOffset, snapToAnchor } from '@/model/connect';
import { placementFor } from '@/model/placement';
import * as haptic from '@/lib/haptics';
import { useGuide } from '@/store/guide';
import { nodeAt } from '@/model/netlist';
import { partBounds, partDef, partLabel, pinPositions } from '@/model/parts';
import { ptKey, type Pt } from '@/model/types';
import { controller, type Snapshot } from '@/sim/controller';
import { damp } from '@/sim/smooth';
import { useSim } from '@/sim/store';
import { useCircuit } from '@/store/circuit';
import { CANVAS as C } from '@/theme';
import { boardPicture, gridPicture } from './board';
import { Label, U, alpha, textWidth } from './draw';
import { docBounds, hitPart, hitWire, netSegments, snap, wireMid } from './hit';
import { PartView } from './PartView';
import { NetLine, WireView } from './WireView';

export interface CanvasApi {
  fit(): void;
  /** Zoom about the centre of the view (factor > 1 zooms in). */
  zoom(factor: number): void;
  center(): Pt;
  snapshot(): string | null;
  /** Drop a new part of `type` at a point in canvas view coordinates (drag from the parts tray). */
  dropPart(type: string, x: number, y: number): string | null;
}

interface Box {
  id: string;
  type: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PROBE_STYLE: Record<string, { color: string; text: string }> = {
  'dmm+': { color: '#E5484D', text: 'V+' },
  'dmm-': { color: '#2B2F36', text: 'COM' },
  ch1: { color: C.trace[0], text: '1' },
  ch2: { color: C.trace[1], text: '2' },
  ch3: { color: C.trace[2], text: '3' },
  ch4: { color: C.trace[3], text: '4' },
};

export function BenchCanvas({ onReady, showVoltage, showFlow }: { onReady?: (api: CanvasApi) => void; showVoltage: boolean; showFlow: boolean }) {
  const doc = useCircuit((s) => s.doc);
  const view = useCircuit((s) => s.view);
  const selection = useCircuit((s) => s.selection);
  const tool = useCircuit((s) => s.tool);
  const focusNet = useCircuit((s) => s.focusNet);
  const pinned = useCircuit((s) => s.pinned);
  const status = useSim((s) => s.status);
  const snap0 = useSim((s) => s.snapshot);
  const powered = status !== 'off';
  const snapshot = powered ? snap0 : null;
  const sch = view === 'schematic';

  const [size, setSize] = useState({ w: 0, h: 0 });
  const tx = useSharedValue(40);
  const ty = useSharedValue(40);
  const sc = useSharedValue(U);
  const clock = useSharedValue(0);
  const drag = { ids: useSharedValue<string[]>([]), dx: useSharedValue(0), dy: useSharedValue(0) };
  const mode = useSharedValue<'pan' | 'part' | 'wire' | 'wireEnd' | 'bend' | 'marquee' | 'press' | 'none'>('none');
  const wireEnds = useSharedValue<{ id: string; ax: number; ay: number; bx: number; by: number; mx: number; my: number; sel: boolean; via: boolean }[]>([]);
  /** Last hole the dragged wire end snapped to (for the haptic tick on each new hole). */
  const lastSnap = useSharedValue({ x: NaN, y: NaN });
  /** Last whole-hole offset of a dragged part (haptic tick per hole). */
  const lastStep = useSharedValue({ x: 0, y: 0 });
  const grabbed = useSharedValue({ id: '', end: 'a' as 'a' | 'b' });
  const lastFocal = useSharedValue({ x: 0, y: 0 });
  /** Finger position (view pixels) at touch-down, so drags include the movement before activation. */
  const touchStart = useSharedValue({ x: 0, y: 0 });
  /** Long-press (pin a readout) is switched off while a push button is held, so holding never releases it. */
  const longPressOn = useSharedValue(true);
  const pStart = useSharedValue({ x: 0, y: 0 });
  const pEnd = useSharedValue({ x: 0, y: 0 });
  const boxes = useSharedValue<Box[]>([]);
  const selIds = useSharedValue<string[]>([]);
  const toolSv = useSharedValue<string>(tool);
  const runningSv = useSharedValue(false);
  /** Every point a wire end may plug into (pins, plus holes on a breadboard), flattened x,y,x,y... */
  const anchors = useSharedValue<number[]>([]);
  /** Free schematic canvas: any grid point is a valid wire end. */
  const freeSv = useSharedValue(false);
  /** The live wire end has a valid target under the finger. */
  const targetOk = useSharedValue(1);
  /** Ends of the wire being bent (for the live preview). */
  const bendAB = useSharedValue({ ax: 0, ay: 0, bx: 0, by: 0 });
  const pendingWire = useRef<Pt | null>(null);
  const [pendingWireUi, setPendingWireUi] = useState<Pt | null>(null);
  const canvasRef = useCanvasRef();

  useFrameCallback((f) => {
    clock.set(clock.get() + (f.timeSincePreviousFrame ?? 16) / 1000);
  });

  useEffect(() => {
    boxes.set(doc.parts.map((p) => ({ id: p.id, type: p.type, ...partBounds(p) })));
  }, [doc.parts, boxes]);
  useEffect(() => {
    selIds.set(selection.parts);
  }, [selection.parts, selIds]);
  useEffect(() => {
    const hidden = sch && doc.board === 'breadboard';
    wireEnds.set(
      hidden
        ? []
        : doc.wires.map((w) => {
            const m = wireMid(w, !sch);
            return { id: w.id, ax: w.a.x, ay: w.a.y, bx: w.b.x, by: w.b.y, mx: m.x, my: m.y, sel: selection.wires.includes(w.id), via: !!w.via };
          }),
    );
  }, [doc.wires, doc.board, sch, selection.wires, wireEnds]);
  useEffect(() => {
    toolSv.set(tool);
    if (tool !== 'wire') pendingWire.current = null;
  }, [tool, toolSv]);
  useEffect(() => {
    runningSv.set(powered);
  }, [powered, runningSv]);
  useEffect(() => {
    const pts: number[] = [];
    for (const p of doc.parts) for (const q of pinPositions(p)) pts.push(q.x, q.y);
    if (doc.board === 'breadboard') for (const h of allHoles()) pts.push(h.x, h.y);
    anchors.set(pts);
    freeSv.set(doc.board === 'none');
  }, [doc.parts, doc.board, anchors, freeSv]);
  const loose = useMemo(() => (sch ? [] : loosePins(doc)), [doc, sch]);

  const guidePins = useGuide((s) => s.pins);
  const guideLine = useGuide((s) => s.line);
  const pulse = useDerivedValue(() => 0.45 + 0.4 * Math.sin(clock.get() * 5));
  const ex = useSim((s) => s.ex);
  const segments = useMemo(() => (sch && doc.board === 'breadboard' && ex ? netSegments(doc, ex.partPins) : []), [sch, doc, ex]);

  // ---------------------------------------------------------------- camera helpers
  const fit = useCallback(() => {
    const b = docBounds(doc, !sch);
    // leave room for the floating tool strips at the top
    const top = 72;
    const pad = 12;
    const w = size.w - pad * 2;
    // and for the view controls at the bottom (phones)
    const h = size.h - top - 64;
    const s = Math.max(4, Math.min(90, Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0))));
    sc.set(s);
    tx.set(pad + (w - (b.x1 - b.x0) * s) / 2 - b.x0 * s);
    ty.set(top + (h - (b.y1 - b.y0) * s) / 2 - b.y0 * s);
  }, [doc, size, sc, tx, ty, sch]);

  // frame the circuit when a document opens or the view changes
  const fittedFor = useRef('');
  useEffect(() => {
    const key = `${doc.id}:${sch}`;
    if (fittedFor.current !== key && size.w > 100) {
      fittedFor.current = key;
      fit();
    }
  }, [doc.id, sch, size, fit]);

  const toWorld = useCallback((x: number, y: number): Pt => ({ x: (x - tx.get()) / sc.get(), y: (y - ty.get()) / sc.get() }), [tx, ty, sc]);
  /** Finger-sized search radius in grid units (about 22 px on screen, at least half a hole). */
  const touchRadius = useCallback(() => Math.min(2.5, Math.max(0.6, 22 / sc.get())), [sc]);

  useEffect(() => {
    onReady?.({
      fit,
      zoom: (f: number) => {
        const ns = Math.max(4, Math.min(140, sc.get() * f));
        const k = ns / sc.get();
        const cx = size.w / 2;
        const cy = size.h / 2;
        tx.set(cx - (cx - tx.get()) * k);
        ty.set(cy - (cy - ty.get()) * k);
        sc.set(ns);
      },
      center: () => toWorld(size.w / 2, size.h / 2),
      snapshot: () => {
        const img = canvasRef.current?.makeImageSnapshot();
        return img ? img.encodeToBase64() : null;
      },
      dropPart: (type: string, x: number, y: number) => {
        const st = useCircuit.getState();
        const w = toWorld(x, y);
        const def = partDef(type);
        // the finger holds the middle of the part's leads
        const pins = def.pins;
        const cx = pins.reduce((a, q) => a + q.dx, 0) / pins.length;
        const cy = pins.reduce((a, q) => a + q.dy, 0) / pins.length;
        let at = { x: Math.round(w.x - cx), y: Math.round(w.y - cy) };
        if (st.doc.board === 'breadboard') {
          const probe = { ...st.doc, parts: [...st.doc.parts, { id: '__drop', type, x: at.x, y: at.y, rot: 0 as const, props: def.defaults }] };
          const [ox, oy] = settleOffset(probe, new Set(['__drop']), 0, 0);
          at = { x: at.x + ox, y: at.y + oy };
        }
        // a drop far outside everything still lands somewhere sensible
        if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) at = placementFor(type, w, st.doc);
        const id = st.addPart(type, at);
        haptic.tap();
        return id;
      },
    });
  }, [onReady, fit, toWorld, size, canvasRef, sc, tx, ty]);

  // ---------------------------------------------------------------- JS-side handlers
  const onDragStart = useCallback((id: string) => {
    const st = useCircuit.getState();
    if (!st.selection.parts.includes(id)) st.select({ parts: [id] }, st.tool === 'multi');
  }, []);

  const onDragEnd = useCallback(
    (dx: number, dy: number) => {
      const ids = drag.ids.get();
      if (ids.length && (dx || dy)) {
        useCircuit.getState().movePartsBy(ids, dx, dy);
        haptic.tap();
      }
      drag.ids.set([]);
      drag.dx.set(0);
      drag.dy.set(0);
    },
    [drag.ids, drag.dx, drag.dy],
  );

  const press = useCallback((id: string, down: boolean) => {
    useCircuit.getState().setProp(id, 'pressed', down, 'live');
    if (down) haptic.bump();
  }, []);

  const onWire = useCallback((ax: number, ay: number, bx: number, by: number) => {
    if (![ax, ay, bx, by].every(Number.isFinite) || (ax === bx && ay === by)) return;
    if (useCircuit.getState().addWire({ x: ax, y: ay }, { x: bx, y: by })) haptic.tap();
    else haptic.error();
  }, []);

  const onWireEnd = useCallback((id: string, end: 'a' | 'b', x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    useCircuit.getState().moveWireEnd(id, end, { x, y });
    haptic.tap();
  }, []);

  const onBend = useCallback((id: string, x: number, y: number) => {
    useCircuit.getState().bendWire(id, { x, y });
  }, []);

  const onMarquee = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const st = useCircuit.getState();
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const parts = st.doc.parts.filter((p) => {
      const b = partBounds(p);
      return b.x1 >= ax && b.x0 <= bx && b.y1 >= ay && b.y0 <= by;
    });
    const wires = st.doc.wires.filter((w) => [w.a, w.b].every((q) => q.x >= ax && q.x <= bx && q.y >= ay && q.y <= by));
    st.select({ parts: parts.map((p) => p.id), wires: wires.map((w) => w.id) });
  }, []);

  const handleTap = useCallback(
    (x: number, y: number) => {
      const st = useCircuit.getState();
      const w = toWorld(x, y);
      const r = touchRadius();
      const anchor = snapToAnchor(st.doc, w, { radius: r });
      const g = anchor ?? snap(w);
      if (st.tool === 'probe') {
        // a probe must touch metal: the nearest hole or lead (a tap on a part body uses its nearest lead)
        const at = snapToAnchor(st.doc, w, { radius: r, partBodies: true });
        if (at) st.placeProbe(st.probeTool, at);
        return;
      }
      if (st.tool === 'wire') {
        const start = pendingWire.current;
        // nothing to plug into here: keep any started wire waiting for a valid second end
        if (!anchor) return;
        if (start) {
          if (start.x !== anchor.x || start.y !== anchor.y) {
            if (st.addWire(start, anchor)) haptic.tap();
          }
          pendingWire.current = null;
          setPendingWireUi(null);
        } else {
          pendingWire.current = anchor;
          setPendingWireUi(anchor);
          haptic.tick();
        }
        return;
      }
      const part = hitPart(st.doc, w);
      if (part) {
        const running = useSim.getState().status !== 'off';
        if (running && part.type === 'toggle') {
          st.setProp(part.id, 'pos', !part.props.pos);
          haptic.bump();
        } else if (running && part.type === 'dipswitch') {
          haptic.bump();
          const local = { x: w.x - part.x, y: w.y - part.y };
          const k = Math.max(0, Math.min(3, Math.round(part.rot === 0 ? local.x : part.rot === 2 ? -local.x : part.rot === 1 ? local.y : -local.y)));
          st.setProp(part.id, `s${k}`, !part.props[`s${k}`]);
        }
        st.select({ parts: [part.id] }, st.tool === 'multi');
        return;
      }
      const cur = useSim.getState().ex;
      // jumper wires are not drawn in the schematic of a breadboard circuit, so they can't be tapped there
      const wiresVisible = st.view !== 'schematic' || st.doc.board === 'none';
      const wire = wiresVisible ? hitWire(st.doc, w, st.view === 'breadboard') : null;
      if (wire) {
        st.select({ wires: [wire.id] }, st.tool === 'multi');
        st.setFocusNet(cur ? (nodeAt(cur, wire.a) ?? null) : null);
        return;
      }
      const n = cur ? nodeAt(cur, g) : undefined;
      const hole = st.doc.board === 'breadboard' ? holeAt(g) : null;
      if (n !== undefined || hole) {
        st.clearSelection();
        st.setFocusNet(n ?? null);
        return;
      }
      st.clearSelection();
    },
    [toWorld, touchRadius],
  );

  const handleLongPress = useCallback(
    (x: number, y: number) => {
      const st = useCircuit.getState();
      const w = toWorld(x, y);
      const part = hitPart(st.doc, w);
      if (part) {
        st.togglePin(part.id);
        return;
      }
      const cur = useSim.getState().ex;
      const at = snapToAnchor(st.doc, w, { radius: touchRadius() }) ?? snap(w);
      const n = cur ? nodeAt(cur, at) : undefined;
      if (n !== undefined) st.togglePin(`net:${n}`);
    },
    [toWorld, touchRadius],
  );

  // ---------------------------------------------------------------- gestures (pan / pinch on the UI thread)
  /** Nearest anchor to (x, y) within the finger radius; NaN when there is none (UI thread). */
  const nearestAnchor = (x: number, y: number): { x: number; y: number } => {
    'worklet';
    const r = Math.min(2.5, Math.max(0.6, 22 / sc.get()));
    const a = anchors.get();
    let bx = NaN;
    let by = NaN;
    let bd = r * r;
    for (let i = 0; i < a.length; i += 2) {
      const dx = a[i] - x;
      const dy = a[i + 1] - y;
      const d = dx * dx + dy * dy;
      if (d <= bd) {
        bd = d;
        bx = a[i];
        by = a[i + 1];
      }
    }
    if (Number.isNaN(bx) && freeSv.get()) return { x: Math.round(x), y: Math.round(y) };
    return { x: bx, y: by };
  };

  const pan = usePanGesture({
    maxPointers: 1,
    minDistance: 4,
    onBegin: (e) => {
      'worklet';
      const w = { x: (e.x - tx.get()) / sc.get(), y: (e.y - ty.get()) / sc.get() };
      touchStart.set({ x: e.x, y: e.y });
      mode.set('pan');
      const t = toolSv.get();
      if (t === 'wire') {
        const s0 = nearestAnchor(w.x, w.y);
        if (Number.isNaN(s0.x)) {
          // started away from any hole or pin: just pan the view
          mode.set('pan');
          return;
        }
        mode.set('wire');
        pStart.set(s0);
        pEnd.set(s0);
        targetOk.set(0);
        return;
      }
      if (t === 'select' || t === 'multi') {
        const ends = wireEnds.get();
        // grab tolerance never shrinks below a fingertip when zoomed out
        const k = Math.max(1, 14 / sc.get());
        const grab = (onlySelected: boolean, tol0: number): boolean => {
          const tol = tol0 * k;
          for (let i = ends.length - 1; i >= 0; i--) {
            const we = ends[i];
            if (onlySelected && !we.sel) continue;
            const da = Math.hypot(w.x - we.ax, w.y - we.ay);
            const db = Math.hypot(w.x - we.bx, w.y - we.by);
            if (Math.min(da, db) > tol) continue;
            const endA = da <= db;
            mode.set('wireEnd');
            grabbed.set({ id: we.id, end: endA ? 'a' : 'b' });
            pStart.set(endA ? { x: we.bx, y: we.by } : { x: we.ax, y: we.ay });
            pEnd.set(endA ? { x: we.ax, y: we.ay } : { x: we.bx, y: we.by });
            targetOk.set(1);
            return true;
          }
          return false;
        };
        // the bend handle in the middle of a selected wire
        for (let i = ends.length - 1; i >= 0 && t === 'select'; i--) {
          const we = ends[i];
          if (!we.sel) continue;
          if (Math.hypot(w.x - we.mx, w.y - we.my) > 0.6 * k) continue;
          mode.set('bend');
          grabbed.set({ id: we.id, end: 'a' });
          bendAB.set({ ax: we.ax, ay: we.ay, bx: we.bx, by: we.by });
          pEnd.set({ x: we.mx, y: we.my });
          return;
        }
        if (t === 'select' && grab(true, 0.6)) return;
        const bs = boxes.get();
        for (let i = bs.length - 1; i >= 0; i--) {
          const b = bs[i];
          if (w.x >= b.x0 && w.x <= b.x1 && w.y >= b.y0 && w.y <= b.y1) {
            if (runningSv.get() && b.type === 'button') {
              longPressOn.set(false);
              mode.set('press');
              pStart.set({ x: i, y: 0 });
              scheduleOnRN(press, b.id, true);
              return;
            }
            mode.set('part');
            lastStep.set({ x: 0, y: 0 });
            drag.ids.set(selIds.get().includes(b.id) ? selIds.get() : [b.id]);
            drag.dx.set(0);
            drag.dy.set(0);
            scheduleOnRN(onDragStart, b.id);
            return;
          }
        }
        if (t === 'select' && grab(false, 0.4)) return;
        if (t === 'multi') {
          mode.set('marquee');
          pStart.set(w);
          pEnd.set(w);
        }
      }
    },
    onUpdate: (e) => {
      'worklet';
      const m = mode.get();
      if (m === 'pan') {
        tx.set(tx.get() + e.changeX);
        ty.set(ty.get() + e.changeY);
      } else if (m === 'part') {
        const t0 = touchStart.get();
        drag.dx.set((e.x - t0.x) / sc.get());
        drag.dy.set((e.y - t0.y) / sc.get());
        const sx = Math.round(drag.dx.get());
        const sy = Math.round(drag.dy.get());
        const ls = lastStep.get();
        if (sx !== ls.x || sy !== ls.y) {
          lastStep.set({ x: sx, y: sy });
          scheduleOnRN(haptic.tick);
        }
      } else if (m === 'bend') {
        pEnd.set({ x: (e.x - tx.get()) / sc.get(), y: (e.y - ty.get()) / sc.get() });
      } else if (m === 'wire' || m === 'wireEnd') {
        const wx = (e.x - tx.get()) / sc.get();
        const wy = (e.y - ty.get()) / sc.get();
        const s1 = nearestAnchor(wx, wy);
        const ok = !Number.isNaN(s1.x);
        targetOk.set(ok ? 1 : 0);
        // the free end follows the finger and jumps into the hole or pin it would plug into
        pEnd.set(ok ? s1 : { x: wx, y: wy });
        const ls = lastSnap.get();
        if (ok && (s1.x !== ls.x || s1.y !== ls.y)) {
          lastSnap.set({ x: s1.x, y: s1.y });
          scheduleOnRN(haptic.tick);
        }
      } else if (m === 'marquee') {
        pEnd.set({ x: (e.x - tx.get()) / sc.get(), y: (e.y - ty.get()) / sc.get() });
      }
    },
    onFinalize: (e) => {
      'worklet';
      const m = mode.get();
      mode.set('none');
      if (m === 'part') {
        if (e.canceled) {
          drag.dx.set(0);
          drag.dy.set(0);
        }
        scheduleOnRN(onDragEnd, Math.round(drag.dx.get()), Math.round(drag.dy.get()));
      } else if (m === 'press') {
        const b = boxes.get()[pStart.get().x];
        if (b) scheduleOnRN(press, b.id, false);
        longPressOn.set(true);
      } else if (m === 'wire' && !e.canceled) {
        if (targetOk.get()) scheduleOnRN(onWire, pStart.get().x, pStart.get().y, pEnd.get().x, pEnd.get().y);
      } else if (m === 'wireEnd' && !e.canceled) {
        const g = grabbed.get();
        if (targetOk.get()) scheduleOnRN(onWireEnd, g.id, g.end, pEnd.get().x, pEnd.get().y);
      } else if (m === 'bend' && !e.canceled) {
        scheduleOnRN(onBend, grabbed.get().id, pEnd.get().x, pEnd.get().y);
      } else if (m === 'marquee' && !e.canceled) {
        scheduleOnRN(onMarquee, pStart.get().x, pStart.get().y, pEnd.get().x, pEnd.get().y);
      }
    },
  });

  const pinch = usePinchGesture({
    onActivate: (e) => {
      'worklet';
      lastFocal.set({ x: e.focalX, y: e.focalY });
    },
    onUpdate: (e) => {
      'worklet';
      // two fingers also pan (works in every tool, including wire drawing)
      const lf = lastFocal.get();
      tx.set(tx.get() + e.focalX - lf.x);
      ty.set(ty.get() + e.focalY - lf.y);
      lastFocal.set({ x: e.focalX, y: e.focalY });
      const ns = Math.max(4, Math.min(140, sc.get() * e.scaleChange));
      const k = ns / sc.get();
      tx.set(e.focalX - (e.focalX - tx.get()) * k);
      ty.set(e.focalY - (e.focalY - ty.get()) * k);
      sc.set(ns);
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    maxDuration: 350,
    onActivate: (e) => handleTap(e.x, e.y),
  });
  const longPress = useLongPressGesture({
    runOnJS: true,
    enabled: longPressOn,
    minDuration: 550,
    onActivate: (e) => handleLongPress(e.x, e.y),
  });
  const gesture = useSimultaneousGestures(pinch, useCompetingGestures(pan, longPress, tap));

  // ---------------------------------------------------------------- derived drawing values
  const camera = useDerivedValue(() => [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: sc.get() }]);
  const wireOn = useDerivedValue(() => (mode.get() === 'wire' || mode.get() === 'wireEnd' ? 1 : 0));
  const wP1 = useDerivedValue(() => vec(pStart.get().x, pStart.get().y));
  const wP2 = useDerivedValue(() => vec(pEnd.get().x, pEnd.get().y));
  const okOpacity = useDerivedValue(() => targetOk.get());
  const badOpacity = useDerivedValue(() => 1 - targetOk.get());
  const marqueeOn = useDerivedValue(() => (mode.get() === 'marquee' ? 1 : 0));
  const bendOn = useDerivedValue(() => (mode.get() === 'bend' ? 1 : 0));
  const bendPath = useDerivedValue(() => {
    const ab = bendAB.get();
    const v = pEnd.get();
    const b = Skia.PathBuilder.Make();
    b.moveTo(ab.ax, ab.ay);
    b.quadTo(2 * v.x - (ab.ax + ab.bx) / 2, 2 * v.y - (ab.ay + ab.by) / 2, ab.bx, ab.by);
    return b.build();
  });
  const mx = useDerivedValue(() => Math.min(pStart.get().x, pEnd.get().x));
  const my = useDerivedValue(() => Math.min(pStart.get().y, pEnd.get().y));
  const mw = useDerivedValue(() => Math.abs(pEnd.get().x - pStart.get().x));
  const mh = useDerivedValue(() => Math.abs(pEnd.get().y - pStart.get().y));

  // Web-only test hooks: lets automated browser tests map grid points to screen pixels.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const g = globalThis as unknown as { __benchCam?: () => { tx: number; ty: number; sc: number }; __benchStore?: typeof useCircuit; __benchSim?: typeof useSim };
    g.__benchCam = () => ({ tx: tx.get(), ty: ty.get(), sc: sc.get() });
    g.__benchStore = useCircuit;
    g.__benchSim = useSim;
  }, [tx, ty, sc]);

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const nodeOf = ex?.nodeOf;
  const vOf = (p: Pt): number | null => {
    if (!snapshot || !nodeOf) return null;
    const n = nodeOf.get(ptKey(p));
    return n === undefined ? null : (snapshot.nodeV[n] ?? 0);
  };

  const focusPts = useMemo(() => {
    if (focusNet === null || !ex) return [];
    const pts = [...(ex.netPoints[focusNet] ?? [])];
    if (ex.board === 'breadboard') {
      // every hole of the strips / rails this net uses
      const groups = new Set([...ex.groupNode].filter(([, n]) => n === focusNet).map(([g]) => g));
      if (groups.size) for (const h of allHoles()) if (groups.has(holeAt(h)?.group ?? '')) pts.push(h);
    }
    return pts;
  }, [focusNet, ex]);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={styles.fill} collapsable={false}>
          <Canvas style={styles.fill} ref={canvasRef}>
            <Rect x={0} y={0} width={size.w} height={size.h} color={sch ? '#FFFFFF' : C.canvas} />
            <Group transform={camera}>
              <Picture picture={gridPicture()} />
              {doc.board === 'breadboard' && !sch && <Picture picture={boardPicture()} />}
              {sch && doc.board === 'breadboard' && (
                <RoundedRect x={0.3} y={0.3} width={66.4} height={23.4} r={0.8} color={alpha('#0E7C6B', 0.03)} />
              )}
              {focusPts.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={0.42} color={alpha(C.accent, 0.35)} />
              ))}
              {segments.map((s, i) => (
                <NetLine key={i} a={s.a} b={s.b} color={showVoltage && snapshot ? voltageInk(snapshot.nodeV[s.node] ?? 0, snapshot.vmax) : '#1F2328'} />
              ))}
              {(!sch || doc.board === 'none') &&
                doc.wires.map((w) => (
                  <WireView
                    key={w.id}
                    wire={w}
                    current={snapshot?.wireI[w.id] ?? 0}
                    acCurrent={snapshot?.wireAc[w.id] ?? 0}
                    voltage={vOf(w.a)}
                    vmax={snapshot?.vmax ?? 1}
                    selected={selection.wires.includes(w.id)}
                    schematic={sch}
                    showVoltage={showVoltage && !!snapshot}
                    showFlow={showFlow && !!snapshot && useSim.getState().status === 'running'}
                    clock={clock}
                  />
                ))}
              {doc.parts.map((p) => (
                <PartView
                  key={p.id}
                  part={p}
                  live={snapshot?.parts[p.id] ?? null}
                  selected={selection.parts.includes(p.id)}
                  view={sch ? 'sch' : 'bb'}
                  label={partLabel(p, doc.parts)}
                  drag={drag}
                  clock={clock}
                  powered={powered}
                />
              ))}
              {sch && doc.board === 'none' && <Junctions />}
              {/* build-along: where the next part or wire goes */}
              {guideLine && (
                <Line p1={vec(guideLine[0].x, guideLine[0].y)} p2={vec(guideLine[1].x, guideLine[1].y)} color={alpha(C.accent, 0.8)} strokeWidth={0.16} strokeCap="round">
                  <DashPathEffect intervals={[0.35, 0.25]} />
                </Line>
              )}
              {guidePins.map((p, i) => (
                <Group key={`g${i}`} opacity={pulse}>
                  <Circle cx={p.x} cy={p.y} r={0.48} color={alpha(C.accent, 0.25)} />
                  <Circle cx={p.x} cy={p.y} r={0.48} color={C.accent} style="stroke" strokeWidth={0.09} />
                </Group>
              ))}
              {/* leads that are not plugged into anything */}
              {loose.map((p, i) => (
                <Group key={`loose${i}`}>
                  <Circle cx={p.x} cy={p.y} r={0.3} color={alpha(C.danger, 0.18)} />
                  <Circle cx={p.x} cy={p.y} r={0.3} color={C.danger} style="stroke" strokeWidth={0.07} />
                </Group>
              ))}
              {Object.entries(doc.probes).map(([k, p]) =>
                p && PROBE_STYLE[k] ? <ProbeMark key={k} p={p} {...PROBE_STYLE[k]} /> : p && k.startsWith('la') ? <ProbeMark key={k} p={p} color="#8E4EC6" text={`L${k.slice(2)}`} /> : null,
              )}
              {tool === 'wire' && pendingWireUi && <Circle cx={pendingWireUi.x} cy={pendingWireUi.y} r={0.4} color={alpha(C.accent, 0.6)} />}
              <Group opacity={wireOn}>
                <Line p1={wP1} p2={wP2} color={useCircuit.getState().wireColor} strokeWidth={0.27} strokeCap="round" />
                <Circle c={wP1} r={0.3} color={alpha(C.accent, 0.7)} />
                {/* green ring: the end plugs in here; red: nothing to connect to under the finger */}
                <Group opacity={okOpacity}>
                  <Circle c={wP2} r={0.45} color={alpha(C.ok, 0.35)} />
                  <Circle c={wP2} r={0.45} color={C.ok} style="stroke" strokeWidth={0.08} />
                </Group>
                <Group opacity={badOpacity}>
                  <Circle c={wP2} r={0.4} color={alpha(C.danger, 0.25)} />
                  <Circle c={wP2} r={0.4} color={C.danger} style="stroke" strokeWidth={0.08} />
                </Group>
              </Group>
              <Group opacity={bendOn}>
                <Path path={bendPath} style="stroke" strokeWidth={0.2} strokeCap="round" color={alpha(C.select, 0.8)}>
                  <DashPathEffect intervals={[0.4, 0.25]} />
                </Path>
                <Circle c={wP2} r={0.36} color={alpha(C.select, 0.5)} />
              </Group>
              <Group opacity={marqueeOn}>
                <Rect x={mx} y={my} width={mw} height={mh} color={alpha(C.accent, 0.12)} />
              </Group>
              {focusNet !== null && focusPts[0] && (
                <Bubble
                  x={focusPts[0].x + 0.6}
                  y={focusPts[0].y - 0.8}
                  lines={[controller.nodeName(focusNet), snapshot ? netText(snapshot, focusNet) : 'power on to measure']}
                />
              )}
              {snapshot &&
                pinned.map((id) => {
                  if (id.startsWith('net:')) {
                    const n = Number(id.slice(4));
                    const pt = ex?.netPoints[n]?.[0];
                    if (!pt) return null;
                    return <Bubble key={id} x={pt.x + 0.6} y={pt.y - 0.8} lines={[controller.nodeName(n), netText(snapshot, n)]} pinned />;
                  }
                  const part = doc.parts.find((q) => q.id === id);
                  const live = snapshot.parts[id];
                  if (!part || !live) return null;
                  const b = partBounds(part);
                  return (
                    <Bubble
                      key={id}
                      x={b.x1 + 0.3}
                      y={b.y0}
                      pinned
                      lines={[
                        partLabel(part, doc.parts),
                        `V ${formatEng(damp(`${id}.v`, live.v), 'V')}${live.ac ? ` (${formatEng(damp(`${id}.vrms`, live.vrms), 'V')} rms)` : ''}`,
                        `I ${formatEng(damp(`${id}.i`, live.i), 'A')}`,
                        `P ${formatEng(damp(`${id}.p`, live.p), 'W')}`,
                      ]}
                    />
                  );
                })}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
    </View>
  );
}

/** Net readout: damped average, plus the swing when the net carries a changing signal. */
function netText(snapshot: Snapshot, n: number): string {
  const mean = damp(`net${n}`, snapshot.nodeV[n] ?? 0);
  const pp = (snapshot.nodeMax[n] ?? 0) - (snapshot.nodeMin[n] ?? 0);
  return pp > 0.02 * Math.max(Math.abs(snapshot.nodeMax[n] ?? 0), Math.abs(snapshot.nodeMin[n] ?? 0)) + 1e-3
    ? `${formatEng(mean, 'V')} avg · ${formatEng(damp(`net${n}pp`, pp), 'V')} p-p`
    : formatEng(mean, 'V');
}

function voltageInk(v: number, vmax: number): string {
  // reuse the theme ramp but keep schematic lines dark enough
  const t = Math.max(0, Math.min(1, v / Math.max(vmax, 1e-9)));
  return t < 0.02 ? '#1F2328' : `rgb(${Math.round(40 + 190 * t)},${Math.round(90 - 30 * t)},${Math.round(200 - 140 * t)})`;
}

function ProbeMark({ p, color, text }: { p: Pt; color: string; text: string }) {
  const w = Math.max(0.9, textWidth(text, 0.45, true) + 0.4);
  return (
    <Group>
      <Line p1={vec(p.x, p.y)} p2={vec(p.x + 0.6, p.y - 1.2)} color={color} strokeWidth={0.14} strokeCap="round" />
      <Circle cx={p.x} cy={p.y} r={0.22} color={color} />
      <RoundedRect x={p.x + 0.4} y={p.y - 1.85} width={w} height={0.75} r={0.3} color={color} />
      <Label x={p.x + 0.4 + w / 2} y={p.y - 1.3} text={text} size={0.45} align="center" color="#FFFFFF" bold />
    </Group>
  );
}

function Bubble({ x, y, lines, pinned }: { x: number; y: number; lines: string[]; pinned?: boolean }) {
  const w = Math.max(...lines.map((l, i) => textWidth(l, 0.48, i === 0))) + 0.7;
  const h = lines.length * 0.62 + 0.35;
  return (
    <Group>
      <RoundedRect x={x + 0.05} y={y - h + 0.08} width={w} height={h} r={0.3} color="rgba(0,0,0,0.12)" />
      <RoundedRect x={x} y={y - h} width={w} height={h} r={0.3} color="#FFFFFF" />
      <RoundedRect x={x} y={y - h} width={w} height={h} r={0.3} color={pinned ? C.accent : C.borderStrong} style="stroke" strokeWidth={0.06} />
      {lines.map((l, i) => (
        <Label key={i} x={x + 0.35} y={y - h + 0.68 + i * 0.62} text={l} size={0.48} bold={i === 0} color={i === 0 ? C.accentInk : C.ink} />
      ))}
    </Group>
  );
}

/** Junction dots where three or more connections meet (schematic canvas). */
function Junctions() {
  const doc = useCircuit((s) => s.doc);
  const pts = useMemo(() => {
    const count = new Map<string, { p: Pt; n: number }>();
    const add = (p: Pt) => {
      const k = ptKey(p);
      const e = count.get(k) ?? { p, n: 0 };
      e.n++;
      count.set(k, e);
    };
    for (const w of doc.wires) {
      add(w.a);
      add(w.b);
    }
    for (const part of doc.parts) for (const q of pinPositions(part)) add(q);
    return [...count.values()].filter((e) => e.n >= 3).map((e) => e.p);
  }, [doc]);
  return (
    <>
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={0.2} color="#1F2328" />
      ))}
    </>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
