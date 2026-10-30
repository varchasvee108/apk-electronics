import { Canvas, Circle, Group, Line, Picture, Rect, RoundedRect, useCanvasRef, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
import { nodeAt } from '@/model/netlist';
import { partBounds, partLabel, pinPositions } from '@/model/parts';
import { ptKey, type Pt } from '@/model/types';
import { controller } from '@/sim/controller';
import { useSim } from '@/sim/store';
import { useCircuit } from '@/store/circuit';
import { C } from '@/theme';
import { boardPicture, gridPicture } from './board';
import { Label, U, alpha, textWidth } from './draw';
import { docBounds, hitPart, hitWire, netSegments, snap } from './hit';
import { PartView } from './PartView';
import { NetLine, WireView } from './WireView';

export interface CanvasApi {
  fit(): void;
  center(): Pt;
  snapshot(): string | null;
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
  const mode = useSharedValue<'pan' | 'part' | 'wire' | 'wireEnd' | 'marquee' | 'press' | 'none'>('none');
  const wireEnds = useSharedValue<{ id: string; ax: number; ay: number; bx: number; by: number; sel: boolean }[]>([]);
  const grabbed = useSharedValue({ id: '', end: 'a' as 'a' | 'b' });
  const lastFocal = useSharedValue({ x: 0, y: 0 });
  const pStart = useSharedValue({ x: 0, y: 0 });
  const pEnd = useSharedValue({ x: 0, y: 0 });
  const boxes = useSharedValue<Box[]>([]);
  const selIds = useSharedValue<string[]>([]);
  const toolSv = useSharedValue<string>(tool);
  const runningSv = useSharedValue(false);
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
    wireEnds.set(hidden ? [] : doc.wires.map((w) => ({ id: w.id, ax: w.a.x, ay: w.a.y, bx: w.b.x, by: w.b.y, sel: selection.wires.includes(w.id) })));
  }, [doc.wires, doc.board, sch, selection.wires, wireEnds]);
  useEffect(() => {
    toolSv.set(tool);
    if (tool !== 'wire') pendingWire.current = null;
  }, [tool, toolSv]);
  useEffect(() => {
    runningSv.set(powered);
  }, [powered, runningSv]);

  const ex = useSim((s) => s.ex);
  const segments = useMemo(() => (sch && doc.board === 'breadboard' && ex ? netSegments(doc, ex.partPins) : []), [sch, doc, ex]);

  // ---------------------------------------------------------------- camera helpers
  const fit = useCallback(() => {
    const b = docBounds(doc, !sch);
    // leave room for the floating tool strips at the top
    const top = 72;
    const pad = 12;
    const w = size.w - pad * 2;
    const h = size.h - top - pad;
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

  useEffect(() => {
    onReady?.({
      fit,
      center: () => toWorld(size.w / 2, size.h / 2),
      snapshot: () => {
        const img = canvasRef.current?.makeImageSnapshot();
        return img ? img.encodeToBase64() : null;
      },
    });
  }, [onReady, fit, toWorld, size, canvasRef]);

  // ---------------------------------------------------------------- JS-side handlers
  const onDragStart = useCallback((id: string) => {
    const st = useCircuit.getState();
    if (!st.selection.parts.includes(id)) st.select({ parts: [id] }, st.tool === 'multi');
  }, []);

  const onDragEnd = useCallback(
    (dx: number, dy: number) => {
      const ids = drag.ids.get();
      if (ids.length && (dx || dy)) useCircuit.getState().movePartsBy(ids, dx, dy);
      drag.ids.set([]);
      drag.dx.set(0);
      drag.dy.set(0);
    },
    [drag.ids, drag.dx, drag.dy],
  );

  const press = useCallback((id: string, down: boolean) => {
    useCircuit.getState().setProp(id, 'pressed', down, 'live');
  }, []);

  const onWire = useCallback((ax: number, ay: number, bx: number, by: number) => {
    if (ax === bx && ay === by) return;
    useCircuit.getState().addWire({ x: ax, y: ay }, { x: bx, y: by });
  }, []);

  const onWireEnd = useCallback((id: string, end: 'a' | 'b', x: number, y: number) => {
    useCircuit.getState().moveWireEnd(id, end, { x, y });
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
      const g = snap(w);
      if (st.tool === 'probe') {
        st.placeProbe(st.probeTool, g);
        return;
      }
      if (st.tool === 'wire') {
        const start = pendingWire.current;
        if (start) {
          if (start.x !== g.x || start.y !== g.y) st.addWire(start, g);
          pendingWire.current = null;
          setPendingWireUi(null);
        } else {
          pendingWire.current = g;
          setPendingWireUi(g);
        }
        return;
      }
      const part = hitPart(st.doc, w);
      if (part) {
        const running = useSim.getState().status !== 'off';
        if (running && part.type === 'toggle') st.setProp(part.id, 'pos', !part.props.pos);
        else if (running && part.type === 'dipswitch') {
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
      const wire = wiresVisible ? hitWire(st.doc, w) : null;
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
    [toWorld],
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
      const n = cur ? nodeAt(cur, snap(w)) : undefined;
      if (n !== undefined) st.togglePin(`net:${n}`);
    },
    [toWorld],
  );

  // ---------------------------------------------------------------- gestures (pan / pinch on the UI thread)
  const pan = usePanGesture({
    maxPointers: 1,
    minDistance: 4,
    onBegin: (e) => {
      'worklet';
      const w = { x: (e.x - tx.get()) / sc.get(), y: (e.y - ty.get()) / sc.get() };
      mode.set('pan');
      const t = toolSv.get();
      if (t === 'wire') {
        mode.set('wire');
        pStart.set({ x: Math.round(w.x), y: Math.round(w.y) });
        pEnd.set(pStart.get());
        return;
      }
      if (t === 'select' || t === 'multi') {
        const ends = wireEnds.get();
        const grab = (onlySelected: boolean, tol: number): boolean => {
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
            return true;
          }
          return false;
        };
        if (t === 'select' && grab(true, 0.6)) return;
        const bs = boxes.get();
        for (let i = bs.length - 1; i >= 0; i--) {
          const b = bs[i];
          if (w.x >= b.x0 && w.x <= b.x1 && w.y >= b.y0 && w.y <= b.y1) {
            if (runningSv.get() && b.type === 'button') {
              mode.set('press');
              pStart.set({ x: i, y: 0 });
              scheduleOnRN(press, b.id, true);
              return;
            }
            mode.set('part');
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
        drag.dx.set(e.translationX / sc.get());
        drag.dy.set(e.translationY / sc.get());
      } else if (m === 'wire' || m === 'wireEnd') {
        pEnd.set({ x: (e.x - tx.get()) / sc.get(), y: (e.y - ty.get()) / sc.get() });
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
      } else if (m === 'wire' && !e.canceled) {
        scheduleOnRN(onWire, pStart.get().x, pStart.get().y, Math.round(pEnd.get().x), Math.round(pEnd.get().y));
      } else if (m === 'wireEnd' && !e.canceled) {
        const g = grabbed.get();
        scheduleOnRN(onWireEnd, g.id, g.end, Math.round(pEnd.get().x), Math.round(pEnd.get().y));
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
    minDuration: 550,
    onActivate: (e) => handleLongPress(e.x, e.y),
  });
  const gesture = useSimultaneousGestures(pinch, useCompetingGestures(pan, longPress, tap));

  // ---------------------------------------------------------------- derived drawing values
  const camera = useDerivedValue(() => [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: sc.get() }]);
  const wireOn = useDerivedValue(() => (mode.get() === 'wire' || mode.get() === 'wireEnd' ? 1 : 0));
  const wP1 = useDerivedValue(() => vec(pStart.get().x, pStart.get().y));
  const wP2 = useDerivedValue(() => vec(Math.round(pEnd.get().x), Math.round(pEnd.get().y)));
  const marqueeOn = useDerivedValue(() => (mode.get() === 'marquee' ? 1 : 0));
  const mx = useDerivedValue(() => Math.min(pStart.get().x, pEnd.get().x));
  const my = useDerivedValue(() => Math.min(pStart.get().y, pEnd.get().y));
  const mw = useDerivedValue(() => Math.abs(pEnd.get().x - pStart.get().x));
  const mh = useDerivedValue(() => Math.abs(pEnd.get().y - pStart.get().y));

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
              {Object.entries(doc.probes).map(([k, p]) =>
                p && PROBE_STYLE[k] ? <ProbeMark key={k} p={p} {...PROBE_STYLE[k]} /> : p && k.startsWith('la') ? <ProbeMark key={k} p={p} color="#8E4EC6" text={`L${k.slice(2)}`} /> : null,
              )}
              {tool === 'wire' && pendingWireUi && <Circle cx={pendingWireUi.x} cy={pendingWireUi.y} r={0.4} color={alpha(C.accent, 0.6)} />}
              <Group opacity={wireOn}>
                <Line p1={wP1} p2={wP2} color={useCircuit.getState().wireColor} strokeWidth={0.27} strokeCap="round" />
                <Circle c={wP2} r={0.3} color={alpha(C.accent, 0.7)} />
              </Group>
              <Group opacity={marqueeOn}>
                <Rect x={mx} y={my} width={mw} height={mh} color={alpha(C.accent, 0.12)} />
              </Group>
              {focusNet !== null && focusPts[0] && (
                <Bubble
                  x={focusPts[0].x + 0.6}
                  y={focusPts[0].y - 0.8}
                  lines={[controller.nodeName(focusNet), snapshot ? formatEng(snapshot.nodeV[focusNet] ?? 0, 'V') : 'power on to measure']}
                />
              )}
              {snapshot &&
                pinned.map((id) => {
                  if (id.startsWith('net:')) {
                    const n = Number(id.slice(4));
                    const pt = ex?.netPoints[n]?.[0];
                    if (!pt) return null;
                    return <Bubble key={id} x={pt.x + 0.6} y={pt.y - 0.8} lines={[controller.nodeName(n), formatEng(snapshot.nodeV[n] ?? 0, 'V')]} pinned />;
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
                      lines={[partLabel(part, doc.parts), `V ${formatEng(live.v, 'V')}`, `I ${formatEng(live.i, 'A')}`, `P ${formatEng(live.p, 'W')}`]}
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
