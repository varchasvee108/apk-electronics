import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import type { Diagnostic } from '@sim/types';
import { formatEng } from '@sim/units';
import { BenchCanvas, type CanvasApi } from '@/canvas/BenchCanvas';
import { evaluate, newMemory, remember, type CheckMemory, type CheckResult } from '@/model/lessonCheck';
import { LESSONS, type Lesson } from '@/model/lessons';
import { partDef, partLabel } from '@/model/parts';
import { WIRE_COLORS, newId, type CircuitDoc } from '@/model/types';
import { confirm, notify } from '@/lib/dialog';
import { exportCircuit, shareScreenshot } from '@/lib/share';
import { controller } from '@/sim/controller';
import { useSim } from '@/sim/store';
import { useCircuit, type ViewMode } from '@/store/circuit';
import { saveCircuit, setProgress } from '@/store/db';
import { C, R, S, T, TOUCH } from '@/theme';
import { Inspector } from './Inspector';
import { Instruments, type InstrumentTab } from './Instruments';
import { PartsTray } from './PartsTray';
import { Badge, Button, Card, Chip, Icon, IconButton, Segmented, Toggle } from './ui';

type PanelTab = 'parts' | 'inspect' | 'instruments' | 'lesson';

const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: 'Real time (1 s/s)' },
  { value: 0.5, label: '½ × slow' },
  { value: 0.1, label: '1/10 ×' },
  { value: 0.01, label: '1/100 × (10 ms/s)' },
  { value: 1e-3, label: '1 ms per second' },
  { value: 1e-4, label: '100 µs per second' },
  { value: 1e-5, label: '10 µs per second' },
  { value: 1e-6, label: '1 µs per second' },
];

export function Workbench({ initialDoc, persist, lesson, autoPower }: { initialDoc: CircuitDoc; persist: boolean; lesson?: Lesson; autoPower?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 760 && width > height * 1.05;
  const doc = useCircuit((s) => s.doc);
  const dirty = useCircuit((s) => s.dirty);
  const selection = useCircuit((s) => s.selection);
  const view = useCircuit((s) => s.view);
  const [tab, setTab] = useState<PanelTab>(lesson ? 'lesson' : wide ? 'inspect' : 'parts');
  // evaluated here, not in the lesson tab, so time-based checks keep counting while another tab is open
  const lessonDone = useLessonStore((s) => s.done);
  // show the success message as soon as the goal is reached, whichever tab is open
  const [shownDone, setShownDone] = useState(false);
  if (lessonDone !== shownDone) {
    setShownDone(lessonDone);
    if (lessonDone && lesson) setTab('lesson');
  }
  const [instTab, setInstTab] = useState<InstrumentTab>('meter');
  const [showParts, setShowParts] = useState(true);
  const [showVoltage, setShowVoltage] = useState(false);
  const [showFlow, setShowFlow] = useState(true);
  const [diagOpen, setDiagOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const api = useRef<CanvasApi | null>(null);

  // load the document once; this screen owns the simulator while mounted
  const loaded = doc.id === initialDoc.id;
  const latest = useRef({ doc: initialDoc, dirty: false });
  useEffect(() => {
    const token = controller.claim();
    controller.powerOff();
    useCircuit.getState().load(initialDoc);
    controller.setDoc(useCircuit.getState().doc);
    const t = autoPower ? setTimeout(() => controller.powerOn(), 300) : undefined;
    return () => {
      if (t) clearTimeout(t);
      controller.release(token);
      // save edits made after the last autosave (the store may already hold the next screen's circuit)
      if (persist && latest.current.dirty) saveCircuit(latest.current.doc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDoc.id]);

  // live netlist + autosave
  useEffect(() => {
    if (!loaded) return;
    latest.current = { doc, dirty };
    controller.setDoc(doc);
    if (!persist || !dirty) return;
    const t = setTimeout(() => {
      useCircuit.getState().markSaved();
      latest.current = { doc, dirty: false };
    }, 800);
    return () => clearTimeout(t);
  }, [doc, dirty, persist, loaded]);

  // jump to the inspector when something new is selected
  const [lastSel, setLastSel] = useState(selection);
  if (lastSel !== selection) {
    setLastSel(selection);
    // show the settings of whatever was just selected (the lesson stays one tap away); an open
    // instrument stays put so its readings (or the I–V tracer's part choice) aren't yanked away
    if ((selection.parts.length || selection.wires.length) && tab !== 'instruments') setTab('inspect');
  }

  const onReady = useCallback((a: CanvasApi) => {
    api.current = a;
  }, []);
  const center = useCallback(() => api.current?.center() ?? { x: 30, y: 10 }, []);

  const panel = (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <Segmented<PanelTab>
            options={[
              ...(!wide ? [{ value: 'parts' as const, label: 'Parts' }] : []),
              { value: 'inspect', label: 'Inspect' },
              { value: 'instruments', label: 'Instruments' },
              ...(lesson ? [{ value: 'lesson' as const, label: lesson.challenge ? 'Challenge' : 'Lesson' }] : []),
            ]}
            value={tab}
            onChange={(t) => {
              setTab(t);
              setCollapsed(false);
            }}
          />
        </ScrollView>
        {!wide && (
          <IconButton icon={collapsed ? 'chevron-up' : 'chevron-down'} label={collapsed ? 'Expand panel' : 'Collapse panel'} onPress={() => setCollapsed(!collapsed)} />
        )}
      </View>
      <View style={{ flex: 1, display: collapsed && !wide ? 'none' : 'flex' }}>
        {tab === 'parts' && <PartsTray center={center} onAdded={() => setTab('inspect')} />}
        {tab === 'inspect' && <Inspector />}
        {tab === 'instruments' && <Instruments tab={instTab} setTab={setInstTab} />}
        {lesson && <LessonTracker lesson={lesson} />}
        {tab === 'lesson' && lesson && <LessonPanel lesson={lesson} />}
      </View>
    </View>
  );

  if (!loaded) return <View style={[styles.root, { paddingTop: insets.top }]} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar persist={persist} onMenu={() => setMenuOpen(true)} onSpeed={() => setSpeedOpen(true)} wide={wide} />
      <View style={[styles.body, !wide && { flexDirection: 'column' }]}>
        {wide && showParts && (
          <View style={styles.left}>
            <PartsTray center={center} />
          </View>
        )}
        <View style={styles.canvasWrap}>
          {view === 'netlist' ? <NetlistView /> : <BenchCanvas onReady={onReady} showVoltage={showVoltage} showFlow={showFlow} />}
          <ToolStrip
            wide={wide}
            showParts={showParts}
            toggleParts={() => setShowParts(!showParts)}
            showVoltage={showVoltage}
            setShowVoltage={setShowVoltage}
            showFlow={showFlow}
            setShowFlow={setShowFlow}
            fit={() => api.current?.fit()}
            zoom={(f) => api.current?.zoom(f)}
          />
        </View>
        <View style={wide ? styles.right : [styles.bottom, { height: collapsed ? 66 : Math.max(260, height * 0.42) }]}>{panel}</View>
      </View>
      <StatusBar onDiagnostics={() => setDiagOpen(true)} bottomInset={insets.bottom} wide={wide} />
      <DiagnosticsSheet open={diagOpen} onClose={() => setDiagOpen(false)} />
      <MoreMenu open={menuOpen} onClose={() => setMenuOpen(false)} persist={persist} snapshot={() => api.current?.snapshot() ?? null} />
      <SpeedMenu open={speedOpen} onClose={() => setSpeedOpen(false)} />
    </View>
  );
}

// ------------------------------------------------------------------ top bar

function TopBar({ persist, onMenu, onSpeed, wide }: { persist: boolean; onMenu: () => void; onSpeed: () => void; wide: boolean }) {
  const doc = useCircuit((s) => s.doc);
  const view = useCircuit((s) => s.view);
  const canUndo = useCircuit((s) => s.past.length > 0);
  const canRedo = useCircuit((s) => s.future.length > 0);
  const status = useSim((s) => s.status);
  const timeScale = useSim((s) => s.timeScale);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(doc.name);
  const [docName, setDocName] = useState(doc.name);
  if (docName !== doc.name) {
    setDocName(doc.name);
    setName(doc.name);
  }
  const st = useCircuit.getState();
  const on = status !== 'off';
  return (
    <View style={styles.top}>
      <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {editing && persist ? (
        <TextInput
          accessibilityLabel="Circuit name"
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => {
            st.rename(name);
            setEditing(false);
          }}
          onBlur={() => {
            st.rename(name);
            setEditing(false);
          }}
          style={styles.nameInput}
        />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Circuit name ${doc.name}${persist ? ', tap to rename' : ''}`} onPress={() => persist && setEditing(true)} style={styles.nameBtn}>
          <Text style={styles.name} numberOfLines={1}>
            {doc.name}
          </Text>
          {persist && <Icon name="create-outline" size={14} color={C.ink3} />}
        </Pressable>
      )}
      {wide && (
        <Segmented<ViewMode>
          options={[
            ...(doc.board === 'breadboard' ? [{ value: 'breadboard' as const, label: 'Breadboard', icon: 'grid-outline' as const }] : []),
            { value: 'schematic', label: 'Schematic', icon: 'git-network-outline' },
            { value: 'netlist', label: 'Netlist', icon: 'list-outline' },
          ]}
          value={view}
          onChange={st.setView}
        />
      )}
      <View style={{ flex: 1 }} />
      {wide && <IconButton icon="arrow-undo" label="Undo" disabled={!canUndo} onPress={st.undo} />}
      {wide && <IconButton icon="arrow-redo" label="Redo" disabled={!canRedo} onPress={st.redo} />}
      {on && (
        <>
          <IconButton
            icon={status === 'paused' ? 'play' : 'pause'}
            label={status === 'paused' ? 'Resume' : 'Pause'}
            onPress={() => (status === 'paused' ? controller.resume() : controller.pause())}
          />
          {status === 'paused' && <IconButton icon="play-skip-forward" label="Step one division" onPress={() => controller.stepDiv()} />}
        </>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Simulation speed" onPress={onSpeed} style={styles.speedBtn}>
        <Icon name="speedometer-outline" size={18} color={C.ink2} />
        {wide && <Text style={styles.speedText}>{timeScale >= 0.01 ? `${timeScale}×` : `${formatEng(timeScale, 's')}/s`}</Text>}
      </Pressable>
      <Button
        icon="power"
        label={wide ? (on ? 'Power off' : 'Power on') : undefined}
        accessibilityLabel={on ? 'Power off' : 'Power on'}
        kind={on ? 'danger' : 'power'}
        onPress={() => (on ? controller.powerOff() : controller.powerOn())}
      />
      <IconButton icon="ellipsis-vertical" label="More" onPress={onMenu} />
    </View>
  );
}

// ------------------------------------------------------------------ floating tool strip

function ToolStrip(props: {
  wide: boolean;
  showParts: boolean;
  toggleParts: () => void;
  showVoltage: boolean;
  setShowVoltage: (b: boolean) => void;
  showFlow: boolean;
  setShowFlow: (b: boolean) => void;
  fit: () => void;
  zoom: (f: number) => void;
}) {
  const tool = useCircuit((s) => s.tool);
  const view = useCircuit((s) => s.view);
  const board = useCircuit((s) => s.doc.board);
  const wireColor = useCircuit((s) => s.wireColor);
  const canUndo = useCircuit((s) => s.past.length > 0);
  const st = useCircuit.getState();
  if (view === 'netlist') return null;
  return (
    <>
      <View style={[styles.strip, { left: S.sm, top: S.sm }]}>
        {props.wide && <IconButton icon={props.showParts ? 'chevron-back-circle-outline' : 'add-circle-outline'} label={props.showParts ? 'Hide parts' : 'Show parts'} onPress={props.toggleParts} />}
        <IconButton icon="hand-left-outline" label="Select and move" active={tool === 'select'} onPress={() => st.setTool('select')} />
        <IconButton icon="scan-outline" label="Multi-select" active={tool === 'multi'} onPress={() => st.setTool('multi')} />
        <IconButton icon="git-commit-outline" label="Draw wires" active={tool === 'wire'} onPress={() => st.setTool('wire')} />
        {!props.wide && (
          <IconButton icon="swap-horizontal" label="Toggle breadboard / schematic" onPress={() => st.setView(view === 'schematic' && board === 'breadboard' ? 'breadboard' : 'schematic')} />
        )}
        {!props.wide && <IconButton icon="arrow-undo" label="Undo" disabled={!canUndo} onPress={st.undo} />}
      </View>
      {tool === 'wire' && (
        <View style={[styles.strip, styles.colors, { left: S.sm, top: S.sm + 64, flexWrap: 'wrap', maxWidth: props.wide ? undefined : 200 }]}>
          {WIRE_COLORS.map((c) => (
            <Pressable
              key={c.value}
              accessibilityRole="button"
              accessibilityLabel={`${c.name} wire colour`}
              onPress={() => st.setWireColor(c.value)}
              style={[styles.colorDot, { backgroundColor: c.value }, wireColor === c.value && { borderColor: C.ink, borderWidth: 3 }]}
            />
          ))}
        </View>
      )}
      <View style={[styles.strip, { right: S.sm, top: props.wide ? S.sm : S.sm + 64 }]}>
        <IconButton icon="remove-circle-outline" label="Zoom out" onPress={() => props.zoom(1 / 1.4)} />
        <IconButton icon="add-circle-outline" label="Zoom in" onPress={() => props.zoom(1.4)} />
        <IconButton icon="contract-outline" label="Fit to view" onPress={props.fit} />
        <IconButton icon="color-palette-outline" label="Colour wires by voltage" active={props.showVoltage} onPress={() => props.setShowVoltage(!props.showVoltage)} />
        <IconButton icon="flash-outline" label="Animate current flow" active={props.showFlow} onPress={() => props.setShowFlow(!props.showFlow)} />
      </View>
    </>
  );
}

// ------------------------------------------------------------------ status bar & diagnostics

function StatusBar({ onDiagnostics, bottomInset, wide }: { onDiagnostics: () => void; bottomInset: number; wide: boolean }) {
  const status = useSim((s) => s.status);
  const simTime = useSim((s) => s.simTime);
  const speed = useSim((s) => s.speed);
  const timeScale = useSim((s) => s.timeScale);
  const diags = useSim((s) => s.diagnostics);
  const error = useSim((s) => s.error);
  const errors = diags.filter((d) => d.severity === 'error').length + (error ? 1 : 0);
  const warns = diags.filter((d) => d.severity === 'warning').length;
  return (
    <View style={[styles.status, { paddingBottom: Math.max(bottomInset, 4) }]}>
      <View style={[styles.dot, { backgroundColor: status === 'running' ? C.power : status === 'paused' ? C.warn : status === 'error' ? C.danger : C.borderStrong }]} />
      <Text style={T.small}>{status === 'off' ? 'Power off' : status === 'error' ? 'Stopped: error' : status === 'paused' ? 'Paused' : 'Running'}</Text>
      {status !== 'off' && (
        <Text style={[T.caption, { marginLeft: S.sm, flexShrink: 1 }]} numberOfLines={1}>
          t = {formatEng(simTime, 's')}
          {wide ? ` · speed ${speed >= timeScale * 0.9 ? 'on target' : `${formatEng(speed, 's')}/s (CPU-limited)`}` : ''}
        </Text>
      )}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${errors} errors and ${warns} warnings`} onPress={onDiagnostics} style={styles.diagBtn}>
        {errors > 0 && <Badge text={`${errors} error${errors > 1 ? 's' : ''}`} tone="danger" />}
        {warns > 0 && <Badge text={`${warns} warning${warns > 1 ? 's' : ''}`} tone="warn" />}
        {errors + warns === 0 && <Badge text="No problems" tone="ok" />}
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel="About model accuracy" onPress={() => router.push('/about')} style={styles.noteBtn}>
        <Icon name="information-circle-outline" size={16} color={C.ink3} />
        {wide && <Text style={T.caption}>Model approximations</Text>}
      </Pressable>
    </View>
  );
}

function DiagnosticsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const diags = useSim((s) => s.diagnostics);
  const error = useSim((s) => s.error);
  const all: Diagnostic[] = [...(error ? [error] : []), ...diags];
  const show = (d: Diagnostic) => {
    const st = useCircuit.getState();
    if (d.partId) st.select({ parts: [d.partId] });
    else if (d.node !== undefined) st.setFocusNet(d.node);
    onClose();
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={T.title}>Circuit check</Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.sm }}>
          {all.length === 0 && <Text style={T.body}>No problems found. Power on to check for overloads and damaged parts.</Text>}
          {all.map((d, i) => (
            <Card key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                <Icon
                  name={d.severity === 'error' ? 'alert-circle' : d.severity === 'warning' ? 'warning' : 'information-circle'}
                  color={d.severity === 'error' ? C.danger : d.severity === 'warning' ? C.warn : C.info}
                />
                <Text style={[T.label, { flex: 1 }]}>{d.title}</Text>
                {(d.partId || d.node !== undefined) && <Chip label="Show" onPress={() => show(d)} />}
              </View>
              <Text style={[T.small, { marginTop: 6 }]}>{d.message}</Text>
            </Card>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ menus

function MoreMenu({ open, onClose, persist, snapshot }: { open: boolean; onClose: () => void; persist: boolean; snapshot: () => string | null }) {
  const doc = useCircuit((s) => s.doc);
  const [failures, setFailures] = useState(controller.failures);
  const st = useCircuit.getState();
  const act = (fn: () => void | Promise<void>) => async () => {
    onClose();
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={styles.menu}>
        {!persist && (
          <MenuItem
            icon="save-outline"
            label="Save a copy to My circuits"
            onPress={act(() => {
              const copy = { ...doc, id: newId('c'), origin: undefined, name: `${doc.name} (copy)` };
              saveCircuit(copy);
              router.replace(`/bench/${copy.id}`);
            })}
          />
        )}
        {persist && <MenuItem icon="save-outline" label="Save now" onPress={act(() => st.markSaved())} />}
        {persist && (
          <MenuItem
            icon="copy-outline"
            label="Duplicate circuit"
            onPress={act(() => {
              const copy = { ...doc, id: newId('c'), name: `${doc.name} (copy)` };
              saveCircuit(copy);
              router.replace(`/bench/${copy.id}`);
            })}
          />
        )}
        <MenuItem icon="share-outline" label="Export as JSON" onPress={act(() => exportCircuit(doc))} />
        <MenuItem
          icon="camera-outline"
          label="Share screenshot"
          onPress={act(async () => {
            const b64 = snapshot();
            if (!b64) throw new Error('Could not capture the canvas.');
            await shareScreenshot(b64, doc.name);
          })}
        />
        <MenuItem icon="list-outline" label="Show netlist" onPress={act(() => st.setView('netlist'))} />
        <MenuItem icon="git-network-outline" label="Schematic view" onPress={act(() => st.setView('schematic'))} />
        {doc.board === 'breadboard' && <MenuItem icon="grid-outline" label="Breadboard view" onPress={act(() => st.setView('breadboard'))} />}
        <View style={{ paddingHorizontal: S.lg }}>
          <Toggle
            label="Parts can be damaged"
            value={failures}
            onChange={(v) => {
              setFailures(v);
              controller.setFailures(v);
            }}
          />
        </View>
        <MenuItem
          icon="trash-outline"
          label="Clear the circuit"
          danger
          onPress={act(async () => {
            if (await confirm('Clear the circuit?', 'All parts and wires will be removed (you can undo).', 'Clear', true))
              st.apply((d) => {
                d.parts = [];
                d.wires = [];
                d.probes = {};
              });
          })}
        />
      </View>
    </Modal>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="menuitem" onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: C.sunken }]}>
      <Icon name={icon} color={danger ? C.danger : C.ink2} />
      <Text style={[T.body, danger && { color: C.danger }]}>{label}</Text>
    </Pressable>
  );
}

function SpeedMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ts = useSim((s) => s.timeScale);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.menu}>
        <Text style={[T.label, { padding: S.lg, paddingBottom: S.sm }]}>Simulation speed</Text>
        <Text style={[T.caption, { paddingHorizontal: S.lg, marginBottom: S.sm }]}>Slow motion lets you watch fast events (a 1 kHz square wave at 100 µs/s takes 10 s per cycle).</Text>
        {SPEEDS.map((s) => (
          <Pressable
            key={s.value}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: ts === s.value }}
            onPress={() => {
              controller.setTimeScale(s.value);
              onClose();
            }}
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: C.sunken }]}
          >
            <Icon name={ts === s.value ? 'radio-button-on' : 'radio-button-off'} color={ts === s.value ? C.accent : C.ink3} />
            <Text style={T.body}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ netlist view

function NetlistView() {
  const doc = useCircuit((s) => s.doc);
  const snap = useSim((s) => s.snapshot);
  const ex = useSim((s) => s.ex);
  const lines = useMemo(() => {
    if (!ex) return [];
    const nm = (n: number) => ex.netlist.nodeNames[n] ?? `N${n}`;
    return ex.netlist.elements.map((e) => {
      const p = Object.entries(e.params)
        .filter(([k]) => !['hex', 'source', 'program', 'kind'].includes(k))
        .slice(0, 4)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? formatEng(v) : String(v)}`)
        .join(' ');
      return `${(e.label ?? e.id).padEnd(10)} ${e.type.padEnd(6)} ${e.nodes.map(nm).join(' · ')}   ${p}`;
    });
  }, [ex]);
  if (!ex) return null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.surface }} contentContainerStyle={{ padding: S.lg, paddingTop: 72 }}>
      <Text style={T.title}>Netlist</Text>
      <Text style={[T.small, { marginBottom: S.md }]}>
        Extracted live from the {doc.board === 'breadboard' ? 'breadboard connections' : 'schematic wires'}: {ex.netlist.nodeNames.length} nodes, {ex.netlist.elements.length} elements.
      </Text>
      <Text style={T.label}>Nodes</Text>
      {ex.netlist.nodeNames.map((n, i) => (
        <Text key={i} style={[T.mono, { fontSize: 12 }]}>
          {String(i).padStart(3)}  {n}
          {snap ? `   ${formatEng(snap.nodeV[i] ?? 0, 'V')}` : ''}
        </Text>
      ))}
      <Text style={[T.label, { marginTop: S.lg }]}>Elements</Text>
      {lines.map((l, i) => (
        <Text key={i} style={[T.mono, { fontSize: 12 }]}>
          {l}
        </Text>
      ))}
      <Text style={[T.caption, { marginTop: S.lg }]}>
        Parts: {doc.parts.map((p) => `${partLabel(p, doc.parts)} (${partDef(p.type).name})`).join(', ')}
      </Text>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ lesson panel

interface LessonState {
  results: CheckResult[];
  done: boolean;
}

const useLessonStore = create<LessonState>(() => ({ results: [], done: false }));

/**
 * Runs a lesson's checks on every snapshot and remembers time-based events (blinks, a blown fuse…).
 * Always mounted, so nothing is missed while the inspector or instruments tab is open.
 */
function LessonTracker({ lesson }: { lesson: Lesson }) {
  const doc = useCircuit((s) => s.doc);
  const snap = useSim((s) => s.snapshot);
  const ex = useSim((s) => s.ex);
  const mem = useRef<CheckMemory>(newMemory());
  // the lesson screen remounts the workbench per lesson (key), so state starts fresh
  useEffect(() => {
    mem.current = newMemory();
    useLessonStore.setState({ results: [], done: false });
    setProgress(lesson.id, 'started');
  }, [lesson]);
  useEffect(() => {
    const ctx = { doc, snap, ex, mem: mem.current, trace: controller.trace, serial: (id: string) => controller.serialText(id) };
    remember(lesson.checks, ctx);
    const results = lesson.checks.map((c) => evaluate(c, ctx));
    const wasDone = useLessonStore.getState().done;
    const done = wasDone || (!!snap && results.every((x) => x.ok));
    if (done && !wasDone) setProgress(lesson.id, 'done');
    useLessonStore.setState({ results, done });
  }, [doc, snap, ex, lesson]);
  return null;
}

function LessonPanel({ lesson }: { lesson: Lesson }) {
  const snap = useSim((s) => s.snapshot);
  const [hints, setHints] = useState(0);
  const results = useLessonStore((s) => s.results);
  const done = useLessonStore((s) => s.done);
  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const next = idx >= 0 ? LESSONS[idx + 1] : undefined;
  return (
    <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }}>
      <Text style={T.caption}>{lesson.challenge ? 'Challenge' : `Lesson · ~${lesson.minutes} min`}</Text>
      <Text style={T.title}>{lesson.title}</Text>
      <Card style={{ marginTop: S.md, backgroundColor: C.accentSoft, borderColor: C.accentSoft }}>
        <Text style={[T.label, { color: C.accentInk }]}>Goal</Text>
        <Text style={T.body}>{lesson.goal}</Text>
      </Card>
      {lesson.intro.map((p, i) => (
        <Text key={i} style={[T.body, { marginTop: S.md, lineHeight: 22 }]}>
          {p}
        </Text>
      ))}
      <Text style={[T.label, { marginTop: S.lg }]}>Checks</Text>
      {lesson.checks.map((c, i) => (
        <View key={i} style={styles.checkRow} accessible accessibilityLabel={`${c.label}: ${results[i]?.ok ? 'passed' : 'not yet'}`}>
          <Icon name={results[i]?.ok ? 'checkmark-circle' : 'ellipse-outline'} color={results[i]?.ok ? C.ok : C.ink3} />
          <View style={{ flex: 1 }}>
            <Text style={T.body}>{c.label}</Text>
            {!!results[i]?.detail && <Text style={T.caption}>{results[i].detail}</Text>}
          </View>
        </View>
      ))}
      {!snap && !done && <Text style={[T.small, { marginTop: S.sm }]}>Press Power on: Bench checks your circuit automatically while it runs.</Text>}
      {done && (
        <Card style={{ marginTop: S.md, backgroundColor: C.okSoft, borderColor: C.okSoft }}>
          <Text style={[T.label, { color: C.ok }]}>✓ Well done — goal reached!</Text>
          {next && !lesson.challenge && <Button icon="arrow-forward" label={`Next: ${next.title}`} kind="primary" style={{ marginTop: S.sm }} onPress={() => router.replace(`/learn/${next.id}`)} />}
        </Card>
      )}
      {lesson.hints.length > 0 && (
        <>
          <Text style={[T.label, { marginTop: S.lg }]}>Hints</Text>
          {lesson.hints.slice(0, hints).map((h, i) => (
            <Text key={i} style={[T.small, { marginTop: 6 }]}>
              {i + 1}. {h}
            </Text>
          ))}
          {hints < lesson.hints.length && <Button icon="bulb-outline" label={hints ? 'Another hint' : 'Show a hint'} onPress={() => setHints(hints + 1)} style={{ marginTop: S.sm }} />}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: S.sm, minHeight: 56, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  nameBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, flexShrink: 1, minHeight: TOUCH, paddingHorizontal: 4 },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  nameInput: { minWidth: 160, minHeight: 40, borderWidth: 1, borderColor: C.accent, borderRadius: R.sm, paddingHorizontal: S.sm, fontSize: 16, color: C.ink },
  speedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: TOUCH, paddingHorizontal: S.sm, borderRadius: R.md, backgroundColor: C.sunken },
  speedText: { fontSize: 13, fontWeight: '600', color: C.ink2 },
  body: { flex: 1, flexDirection: 'row' },
  left: { width: 240, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border },
  canvasWrap: { flex: 1, overflow: 'hidden' },
  right: { width: 380, backgroundColor: C.surface, borderLeftWidth: 1, borderLeftColor: C.border },
  bottom: { backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  tabs: { flexDirection: 'row', alignItems: 'center', padding: S.sm, borderBottomWidth: 1, borderBottomColor: C.border },
  strip: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  colors: { gap: 6, padding: 8 },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: C.border },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, paddingTop: 4, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  diagBtn: { flexDirection: 'row', gap: 6, minHeight: 40, alignItems: 'center', paddingHorizontal: 4 },
  noteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 4 },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15,20,25,0.35)' },
  sheet: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 460, backgroundColor: C.bg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: S.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  menu: { position: 'absolute', right: S.md, top: 60, width: 320, maxWidth: '92%', backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: S.sm, borderWidth: 1, borderColor: C.border, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: TOUCH, paddingHorizontal: S.lg },
  checkRow: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', paddingVertical: 6 },
});
