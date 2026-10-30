import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { assemble } from '@sim/avr/assembler';
import { parseIntelHex } from '@sim/avr/intelhex';
import { STARTER_PROGRAMS } from '@sim/avr/programs';
import { BAND_NAMES, BAND_COLORS, formatEng, resistorBands } from '@sim/units';
import { notify } from '@/lib/dialog';
import { pickTextFile } from '@/lib/share';
import { explain } from '@/model/formulas';
import { nodeAt } from '@/model/netlist';
import { partDef, partLabel, type PropSpec } from '@/model/parts';
import { WIRE_COLORS, type PartInstance } from '@/model/types';
import { controller } from '@/sim/controller';
import { useSim } from '@/sim/store';
import { useCircuit } from '@/store/circuit';
import { C, R, S, T } from '@/theme';
import { Badge, Button, Card, Chip, KV, SectionTitle, Slider, Toggle, ValueInput } from './ui';

const SOURCE_TYPES = new Set(['battery', 'supply', 'funcgen', 'acsource']);

export function Inspector() {
  const doc = useCircuit((s) => s.doc);
  const sel = useCircuit((s) => s.selection);
  const part = sel.parts.length === 1 ? doc.parts.find((p) => p.id === sel.parts[0]) : undefined;
  if (part) return <PartInspector part={part} />;
  if (sel.parts.length + sel.wires.length > 1) return <MultiInspector />;
  if (sel.wires.length === 1) return <WireInspector id={sel.wires[0]} />;
  return <EmptyInspector />;
}

function EmptyInspector() {
  const focusNet = useCircuit((s) => s.focusNet);
  const snap = useSim((s) => s.snapshot);
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={T.title}>Inspector</Text>
      <Text style={[T.small, { marginTop: S.sm }]}>
        Tap a part to edit it, tap a hole or wire to see the voltage of that net, long-press to pin a live readout on the canvas.
      </Text>
      {focusNet !== null && (
        <Card style={{ marginTop: S.lg }}>
          <Text style={T.label}>{controller.nodeName(focusNet)}</Text>
          <Text style={[T.hero, { marginTop: 4 }]}>{snap ? formatEng(snap.nodeV[focusNet] ?? 0, 'V') : '—'}</Text>
          <Text style={T.caption}>{snap ? 'relative to ground' : 'Power on to measure'}</Text>
        </Card>
      )}
      <SectionTitle>Gestures</SectionTitle>
      <Text style={T.small}>• Drag a part to move it; it snaps into holes.</Text>
      <Text style={T.small}>• Wire tool: drag from hole to hole, or tap one then the other.</Text>
      <Text style={T.small}>• Select a wire, then drag either end to plug it into another hole.</Text>
      <Text style={T.small}>• Pinch to zoom; drag empty space (or use two fingers) to pan.</Text>
      <Text style={T.small}>• Tap any hole to see which holes are connected to it and their voltage.</Text>
      <Text style={T.small}>• While running: tap switches, hold push buttons.</Text>
    </ScrollView>
  );
}

function MultiInspector() {
  const sel = useCircuit((s) => s.selection);
  const st = useCircuit.getState();
  return (
    <View style={styles.pad}>
      <Text style={T.title}>{sel.parts.length + sel.wires.length} items selected</Text>
      <View style={styles.actions}>
        <Button icon="refresh" label="Rotate" onPress={st.rotateSelection} />
        <Button icon="copy-outline" label="Duplicate" onPress={st.duplicateSelection} />
        <Button icon="trash-outline" label="Delete" kind="danger" onPress={st.deleteSelection} />
      </View>
    </View>
  );
}

function WireInspector({ id }: { id: string }) {
  const wire = useCircuit((s) => s.doc.wires.find((w) => w.id === id));
  const snap = useSim((s) => s.snapshot);
  const ex = useSim((s) => s.ex);
  const st = useCircuit.getState();
  if (!wire) return null;
  const n = ex ? nodeAt(ex, wire.a) : undefined;
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={T.title}>Wire</Text>
      {n !== undefined && <Text style={T.small}>{controller.nodeName(n)}</Text>}
      {snap && n !== undefined && (
        <Card style={{ marginTop: S.md }}>
          <KV k="Voltage" v={formatEng(snap.nodeV[n] ?? 0, 'V')} />
          <KV k="Current along wire" v={formatEng(snap.wireI[id] ?? 0, 'A')} />
        </Card>
      )}
      <Text style={[T.caption, { marginTop: S.sm }]}>Drag either end of the selected wire on the canvas to move it to another hole.</Text>
      <SectionTitle>Colour</SectionTitle>
      <View style={styles.swatches}>
        {WIRE_COLORS.map((c) => (
          <Pressable
            key={c.value}
            accessibilityLabel={`${c.name} wire`}
            accessibilityRole="button"
            onPress={() => st.setWireColorFor([id], c.value)}
            style={[styles.swatch, { backgroundColor: c.value }, wire.color === c.value && styles.swatchOn]}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button icon="trash-outline" label="Delete wire" kind="danger" onPress={st.deleteSelection} />
      </View>
    </ScrollView>
  );
}

function PartInspector({ part }: { part: PartInstance }) {
  const doc = useCircuit((s) => s.doc);
  const pinned = useCircuit((s) => s.pinned);
  const live = useSim((s) => s.snapshot?.parts[part.id] ?? null);
  const status = useSim((s) => s.status);
  const st = useCircuit.getState();
  const def = partDef(part.type);
  const label = partLabel(part, doc.parts);
  const whys = explain(part, live);
  const [showWhy, setShowWhy] = useState(true);
  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={T.caption}>{def.category}</Text>
          <Text style={T.title}>
            {label} · {def.name}
          </Text>
          {def.value && <Text style={T.small}>{def.value(part.props)}</Text>}
        </View>
        <Button icon="book-outline" compact accessibilityLabel="Datasheet" onPress={() => router.push(`/library/${part.type}`)} />
      </View>

      {part.type === 'resistor' && <Bands ohms={Number(part.props.r) || 0} />}

      {status !== 'off' && live && (
        <Card style={{ marginTop: S.md }}>
          {live.failed ? (
            <>
              <Badge text={`Damaged (${live.failReason})`} tone="danger" />
              <Text style={[T.small, { marginVertical: S.sm }]}>Fix the cause first (add a resistor, lower the voltage, flip the polarity), then replace the part.</Text>
              <Button icon="construct-outline" label="Repair part" kind="primary" onPress={() => controller.repair(part.id)} />
            </>
          ) : (
            <>
              <KV k="Voltage" v={formatEng(live.v, 'V')} />
              <KV k="Current" v={formatEng(live.i, 'A')} />
              {SOURCE_TYPES.has(part.type) ? <KV k="Power delivered" v={formatEng(Math.max(0, -live.p), 'W')} /> : <KV k="Power" v={formatEng(live.p, 'W')} />}
              {Object.entries(live.extra)
                .filter(([k]) => ['mode', 'region', 'rpm', 'out', 'energized', 'brightness'].includes(k))
                .map(([k, v]) => (
                  <KV key={k} k={k[0].toUpperCase() + k.slice(1)} v={typeof v === 'number' ? (k === 'brightness' ? `${Math.round(Math.min(1, v) * 100)} %` : v.toFixed(0)) : String(v)} />
                ))}
              <LoadBar load={live.load} />
            </>
          )}
        </Card>
      )}

      {def.props.length > 0 && <SectionTitle>Settings</SectionTitle>}
      {def.props.map((spec) => (
        <PropEditor key={spec.key} part={part} spec={spec} />
      ))}

      {part.type === 'arduino' && <ProgramEditor part={part} />}

      {whys.length > 0 && (
        <>
          <SectionTitle right={<Chip label={showWhy ? 'Hide' : 'Show'} onPress={() => setShowWhy(!showWhy)} />}>Why is this happening?</SectionTitle>
          {showWhy &&
            whys.map((w) => (
              <Card key={w.title} style={styles.why}>
                <Text style={T.label}>{w.title}</Text>
                <Text style={styles.formula}>{w.formula}</Text>
                {w.live && <Text style={styles.formulaLive}>{w.live}</Text>}
                <Text style={[T.small, { marginTop: 6 }]}>{w.note}</Text>
              </Card>
            ))}
        </>
      )}

      <SectionTitle>Actions</SectionTitle>
      <View style={styles.actions}>
        <Button icon="refresh" label="Rotate" onPress={st.rotateSelection} />
        <Button icon="copy-outline" label="Duplicate" onPress={st.duplicateSelection} />
        <Button icon={pinned.includes(part.id) ? 'pin' : 'pin-outline'} label={pinned.includes(part.id) ? 'Unpin' : 'Pin readout'} onPress={() => st.togglePin(part.id)} />
        <Button icon="trash-outline" label="Delete" kind="danger" onPress={st.deleteSelection} />
      </View>
    </ScrollView>
  );
}

function LoadBar({ load }: { load: number }) {
  const pct = Math.min(1.5, load) / 1.5;
  const tone = load > 1 ? C.danger : load > 0.75 ? C.warn : C.ok;
  return (
    <View style={{ marginTop: S.sm }} accessible accessibilityLabel={`Load ${Math.round(load * 100)} percent of rating`}>
      <View style={styles.loadRow}>
        <Text style={T.caption}>Load vs rating</Text>
        <Text style={[T.caption, { color: tone, fontWeight: '700' }]}>{Math.round(load * 100)} %</Text>
      </View>
      <View style={styles.loadTrack}>
        <View style={[styles.loadFill, { width: `${pct * 100}%`, backgroundColor: tone }]} />
        <View style={[styles.loadMark, { left: `${(1 / 1.5) * 100}%` }]} />
      </View>
    </View>
  );
}

function Bands({ ohms }: { ohms: number }) {
  const bands = resistorBands(ohms);
  const names = bands.map((c) => {
    const i = BAND_COLORS.indexOf(c);
    return i >= 0 ? BAND_NAMES[i] : c === '#c9a43a' ? 'gold' : 'silver';
  });
  return (
    <View style={styles.bandsRow} accessible accessibilityLabel={`Colour bands: ${names.join(', ')}`}>
      <View style={styles.bandsBody}>
        {bands.map((c, i) => (
          <View key={i} style={[styles.band, { backgroundColor: c }]} />
        ))}
      </View>
      <Text style={T.caption}>{names.join(' · ')}</Text>
    </View>
  );
}

function PropEditor({ part, spec }: { part: PartInstance; spec: PropSpec }) {
  const st = useCircuit.getState();
  const v = part.props[spec.key];
  const set = (val: number | string | boolean, coalesce = false) =>
    st.setProp(part.id, spec.key, val, spec.key === 'pressed' ? 'live' : coalesce ? 'coalesce' : undefined);
  if (spec.kind === 'bool') return <Toggle label={spec.label} value={!!v} onChange={(b) => set(b)} />;
  if (spec.kind === 'enum')
    return (
      <View style={{ marginBottom: S.sm }}>
        <Text style={styles.propLabel}>{spec.label}</Text>
        <View style={styles.chips}>
          {(spec.options ?? []).map((o) => (
            <Chip key={String(o.value)} label={o.label} active={v === o.value} onPress={() => set(o.value)} />
          ))}
        </View>
      </View>
    );
  if (spec.kind === 'slider') {
    const num = typeof v === 'number' ? v : (spec.min ?? 0);
    const unit = spec.unit ?? '';
    const shown = spec.key === 'pos' ? `${Math.round(num * 100)} %` : spec.key === 'duty' ? `${Math.round(num * 100)} %` : formatEng(num, unit);
    return (
      <View style={{ marginBottom: S.xs }}>
        <View style={styles.loadRow}>
          <Text style={styles.propLabel}>{spec.label}</Text>
          <Text style={T.mono}>{shown}</Text>
        </View>
        <Slider
          label={spec.label}
          value={num}
          min={spec.min ?? 0}
          max={spec.max ?? 1}
          step={spec.step}
          log={spec.key === 'lux' || spec.key === 'ilim'}
          onChange={(x) => set(x, true)}
        />
      </View>
    );
  }
  return (
    <View style={{ marginBottom: S.sm }}>
      <Text style={styles.propLabel}>{spec.label}</Text>
      <ValueInput label={spec.label} value={typeof v === 'number' ? v : 0} unit={spec.unit} onChange={(x) => set(x)} />
    </View>
  );
}

// ------------------------------------------------------------------ Arduino program editor

function ProgramEditor({ part }: { part: PartInstance }) {
  const st = useCircuit.getState();
  const programId = String(part.props.program ?? '');
  const starter = STARTER_PROGRAMS.find((p) => p.id === programId);
  const [tab, setTab] = useState<'cpp' | 'asm' | 'hex'>('asm');
  const [asm, setAsm] = useState<string>(String(part.props.source || starter?.asm || ''));
  const [hexText, setHexText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState('');
  const loaded = !!part.props.hex;

  const loadHex = (hex: string, program: string, source = '') => {
    try {
      parseIntelHex(hex);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
      return;
    }
    st.apply((d) => {
      const p = d.parts.find((q) => q.id === part.id);
      if (p) {
        p.props.hex = hex;
        p.props.program = program;
        p.props.source = source;
      }
    });
    setErrors([]);
  };

  const build = () => {
    const r = assemble(asm);
    if (!r.ok) {
      setErrors(r.errors.map((e) => `Line ${e.line}: ${e.message}`));
      setInfo('');
      return;
    }
    setInfo(`Assembled ${r.size} bytes of flash.`);
    loadHex(r.hex, starter && asm === starter.asm ? starter.id : 'custom', asm);
  };

  const pick = async () => {
    try {
      const f = await pickTextFile();
      if (!f) return;
      loadHex(f.text, f.name.replace(/\.hex$/i, ''), '');
      setInfo(`Loaded ${f.name}`);
    } catch (e) {
      notify('Could not read file', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <SectionTitle>Program</SectionTitle>
      <View style={styles.chips}>
        {STARTER_PROGRAMS.map((p) => (
          <Chip
            key={p.id}
            label={p.title}
            active={programId === p.id}
            onPress={() => {
              setAsm(p.asm);
              const r = assemble(p.asm);
              if (r.ok) loadHex(r.hex, p.id, p.asm);
            }}
          />
        ))}
      </View>
      {starter && (
        <Card style={{ marginTop: S.sm }}>
          <Text style={T.label}>{starter.title}</Text>
          <Text style={T.small}>{starter.summary}</Text>
          <Text style={[T.caption, { marginTop: 4 }]}>Wiring: {starter.wiring}</Text>
        </Card>
      )}
      <View style={[styles.chips, { marginTop: S.sm }]}>
        <Chip label="Arduino C++ (reference)" active={tab === 'cpp'} onPress={() => setTab('cpp')} />
        <Chip label="AVR assembly" active={tab === 'asm'} onPress={() => setTab('asm')} />
        <Chip label="Import .hex" active={tab === 'hex'} onPress={() => setTab('hex')} />
      </View>
      <Text style={[T.caption, { marginVertical: S.sm }]}>
        {tab === 'cpp'
          ? 'Read-only reference. Bench cannot compile C++ on the device (that needs avr-gcc). The program that actually runs is the equivalent assembly in the next tab.'
          : tab === 'asm'
            ? 'Edit and tap Assemble: Bench assembles AVR code on the device and flashes the emulated ATmega328P.'
            : 'To run your own C++: in the Arduino IDE use Sketch → Export Compiled Binary, then import the .hex (or paste its text).'}
      </Text>
      {tab === 'cpp' && <Text style={styles.code}>{starter?.cpp ?? '// Custom program loaded from assembly or HEX'}</Text>}
      {tab === 'asm' && (
        <>
          <TextInput
            accessibilityLabel="Assembly source"
            multiline
            value={asm}
            onChangeText={setAsm}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={[styles.code, styles.codeEdit]}
          />
          <Button icon="hammer-outline" label="Assemble & upload" kind="primary" onPress={build} style={{ marginTop: S.sm }} />
        </>
      )}
      {tab === 'hex' && (
        <>
          <Button icon="document-outline" label="Choose .hex file" onPress={pick} />
          <TextInput
            accessibilityLabel="Intel HEX text"
            multiline
            value={hexText}
            onChangeText={setHexText}
            placeholder=":100000000C945C000C946E00…"
            placeholderTextColor={C.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.code, styles.codeEdit, { minHeight: 100, marginTop: S.sm }]}
          />
          <Button icon="cloud-upload-outline" label="Load pasted HEX" onPress={() => loadHex(hexText.trim(), 'custom')} style={{ marginTop: S.sm }} />
        </>
      )}
      {errors.map((e) => (
        <Text key={e} style={[T.small, { color: C.danger, marginTop: 4 }]}>
          {e}
        </Text>
      ))}
      {!!info && <Text style={[T.small, { color: C.ok, marginTop: 4 }]}>{info}</Text>}
      {!loaded && <Badge text="No program loaded" tone="warn" />}
    </>
  );
}

const styles = StyleSheet.create({
  pad: { padding: S.lg, paddingBottom: 60 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  propLabel: { fontSize: 13, fontWeight: '600', color: C.ink2, marginBottom: 4 },
  why: { marginBottom: S.sm, backgroundColor: C.surface2 },
  formula: { fontFamily: 'monospace', fontSize: 14, color: C.accentInk, marginTop: 6 },
  formulaLive: { fontFamily: 'monospace', fontSize: 13, color: C.ink, marginTop: 4, backgroundColor: C.accentSoft, padding: 6, borderRadius: R.sm },
  loadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadTrack: { height: 8, backgroundColor: C.sunken, borderRadius: 4, marginTop: 4, overflow: 'hidden' },
  loadFill: { height: 8 },
  loadMark: { position: 'absolute', width: 2, height: 8, backgroundColor: C.ink3 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.border },
  swatchOn: { borderColor: C.ink, borderWidth: 3 },
  bandsRow: { marginTop: S.md, gap: 6 },
  bandsBody: { flexDirection: 'row', height: 24, width: 150, borderRadius: 12, backgroundColor: '#E9D3A8', paddingHorizontal: 16, gap: 8, alignItems: 'stretch' },
  band: { width: 10 },
  code: { fontFamily: 'monospace', fontSize: 12, color: C.ink, backgroundColor: C.surface2, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border },
  codeEdit: { minHeight: 220, textAlignVertical: 'top' },
});
