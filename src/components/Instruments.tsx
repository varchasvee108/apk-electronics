import { Canvas, DashPathEffect, Line, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { resample, spectrum } from '@sim/measure';
import { formatEng } from '@sim/units';
import { partLabel } from '@/model/parts';
import type { ProbeKind } from '@/model/types';
import { LA_CHANNELS, SCOPE_CHANNELS, controller, type DmmMode } from '@/sim/controller';
import { useSim } from '@/sim/store';
import { useCircuit } from '@/store/circuit';
import { C, R, S, T } from '@/theme';
import { Button, Card, Chip, KV, SectionTitle, Segmented } from './ui';

export type InstrumentTab = 'meter' | 'scope' | 'logic' | 'bode' | 'serial';

export function Instruments({ tab, setTab }: { tab: InstrumentTab; setTab: (t: InstrumentTab) => void }) {
  const hasArduino = useCircuit((s) => s.doc.parts.some((p) => p.type === 'arduino'));
  const tabs: { value: InstrumentTab; label: string }[] = [
    { value: 'meter', label: 'Meter' },
    { value: 'scope', label: 'Scope' },
    { value: 'logic', label: 'Logic' },
    { value: 'bode', label: 'Bode' },
    ...(hasArduino ? [{ value: 'serial' as const, label: 'Serial' }] : []),
  ];
  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: S.sm }}>
        <Segmented options={tabs} value={tab} onChange={setTab} />
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingTop: S.xs, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {tab === 'meter' && <Multimeter />}
        {tab === 'scope' && <Scope />}
        {tab === 'logic' && <LogicAnalyzer />}
        {tab === 'bode' && <Bode />}
        {tab === 'serial' && <SerialMonitor />}
      </ScrollView>
    </View>
  );
}

function ProbeChips({ kinds, labels, colors }: { kinds: ProbeKind[]; labels: string[]; colors?: string[] }) {
  const probes = useCircuit((s) => s.doc.probes);
  const tool = useCircuit((s) => s.tool);
  const probeTool = useCircuit((s) => s.probeTool);
  const st = useCircuit.getState();
  return (
    <View style={styles.row}>
      {kinds.map((k, i) => (
        <Chip
          key={k}
          label={`${probes[k] ? '● ' : '○ '}${labels[i]}`}
          color={colors?.[i]}
          active={tool === 'probe' && probeTool === k}
          onPress={() => (tool === 'probe' && probeTool === k ? st.setTool('select') : st.setProbeTool(k))}
        />
      ))}
      <Chip label="Clear" onPress={() => kinds.forEach((k) => probes[k] && st.placeProbe(k, null))} />
    </View>
  );
}

// ------------------------------------------------------------------ multimeter

function Multimeter() {
  const doc = useCircuit((s) => s.doc);
  const status = useSim((s) => s.status);
  const dmm = useSim((s) => s.snapshot?.dmm ?? null);
  const mode = useSim((s) => s.dmmMode);
  const ohms = useMemo(() => (mode === 'Ω' && status === 'off' ? controller.measureOhms(doc) : null), [mode, status, doc]);
  const continuity = mode === 'Ω' && !!ohms && ohms.ohms < 50;
  const both = !!doc.probes['dmm+'] && !!doc.probes['dmm-'];
  let display = '—';
  let sub = '';
  if (!both) sub = 'Place the red (V+) and black (COM) probes on holes or pins.';
  else if (mode === 'Ω') {
    if (status !== 'off') sub = 'Turn the power off to measure resistance (an ohmmeter injects its own test current).';
    else if (ohms) {
      display = Number.isNaN(ohms.ohms) ? '—' : ohms.ohms === Infinity ? 'OL' : formatEng(ohms.ohms, 'Ω', 4);
      sub = ohms.note ?? (continuity ? 'Continuity: connected' : '');
    }
  } else if (status === 'off') sub = 'Power on to measure.';
  else if (dmm) display = mode === 'V' ? formatEng(dmm.v, 'V', 4) : formatEng(dmm.i, 'A', 4);
  return (
    <>
      <View style={styles.lcd} accessible accessibilityLabel={`Multimeter reading ${display}`}>
        <Text style={styles.lcdMode}>{mode === 'V' ? 'DC VOLTS' : mode === 'A' ? 'DC AMPS' : 'OHMS'}</Text>
        <Text style={styles.lcdValue}>{display}</Text>
        {continuity && <Text style={styles.lcdBeep}>◉ BEEP</Text>}
      </View>
      {!!sub && <Text style={[T.small, { marginTop: S.sm }]}>{sub}</Text>}
      <SectionTitle>Mode</SectionTitle>
      <Segmented<DmmMode>
        options={[
          { value: 'V', label: 'Volts' },
          { value: 'A', label: 'Amps' },
          { value: 'Ω', label: 'Ohms / continuity' },
        ]}
        value={mode}
        onChange={(m) => controller.setDmmMode(m)}
      />
      {mode === 'A' && (
        <Text style={[T.caption, { marginTop: S.sm }]}>
          Ammeter mode puts the meter in series: it connects the two probe points with 0 Ω. Break the circuit and bridge the gap with the probes.
        </Text>
      )}
      <SectionTitle>Probes</SectionTitle>
      <ProbeChips kinds={['dmm+', 'dmm-']} labels={['V+ red', 'COM black']} colors={['#E5484D', '#2B2F36']} />
    </>
  );
}

// ------------------------------------------------------------------ oscilloscope

const TIME_DIVS = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1];
const VOLT_DIVS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
const W = 340;
const H = 220;

function linePath(xs: number[], ys: number[]) {
  const b = Skia.PathBuilder.Make();
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(ys[i])) {
      started = false;
      continue;
    }
    const y = Math.max(-5, Math.min(H + 5, ys[i]));
    if (!started) {
      b.moveTo(xs[i], y);
      started = true;
    } else b.lineTo(xs[i], y);
  }
  return b.build();
}

function Grid({ cols = 10, rows = 8 }: { cols?: number; rows?: number }) {
  const lines = [];
  for (let i = 0; i <= cols; i++)
    lines.push(<Line key={`v${i}`} p1={vec((i * W) / cols, 0)} p2={vec((i * W) / cols, H)} color={i === cols / 2 ? C.borderStrong : C.scopeGrid} strokeWidth={1} />);
  for (let j = 0; j <= rows; j++)
    lines.push(<Line key={`h${j}`} p1={vec(0, (j * H) / rows)} p2={vec(W, (j * H) / rows)} color={j === rows / 2 ? C.borderStrong : C.scopeGrid} strokeWidth={1} />);
  return <>{lines}</>;
}

function Scope() {
  useSim((s) => s.traceVersion);
  const status = useSim((s) => s.status);
  const probes = useCircuit((s) => s.doc.probes);
  const [tdivIdx, setTdivIdx] = useState(9);
  const [vdiv, setVdiv] = useState<number[]>([6, 6, 6, 6]);
  const [trigCh, setTrigCh] = useState(0);
  const [trigLevel, setTrigLevel] = useState(0);
  const [rising, setRising] = useState(true);
  const [hold, setHold] = useState(false);
  const [fft, setFft] = useState(false);
  const [cursors, setCursors] = useState<[number, number] | null>(null);
  const [frozen, setFrozen] = useState<{ t: number[]; ch: Record<string, number[]> } | null>(null);
  const tdiv = TIME_DIVS[tdivIdx];
  useEffect(() => controller.setTimePerDiv(tdiv), [tdiv]);
  const tr = controller.trace;
  const data = hold && frozen ? frozen : { t: tr.t, ch: tr.ch };

  // trigger: latest crossing that leaves a full screen after it (trigger at 1 division)
  const span = tdiv * 10;
  const tLast = data.t[data.t.length - 1] ?? 0;
  let t0 = tLast - span;
  const trig = data.ch[SCOPE_CHANNELS[trigCh]];
  let triggered = false;
  if (trig) {
    for (let i = data.t.length - 1; i > 0; i--) {
      if (data.t[i] + span * 0.9 > tLast) continue;
      const a = trig[i - 1];
      const b = trig[i];
      if ((rising && a < trigLevel && b >= trigLevel) || (!rising && a > trigLevel && b <= trigLevel)) {
        t0 = data.t[i] - span * 0.1;
        triggered = true;
        break;
      }
      if (data.t[i] < tLast - span * 4) break;
    }
  }
  const x = (t: number) => ((t - t0) / span) * W;
  const traces = SCOPE_CHANNELS.map((k, c) => {
    const arr = data.ch[k];
    if (!arr || !probes[k]) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    const vd = VOLT_DIVS[vdiv[c]];
    for (let i = 0; i < data.t.length; i++) {
      if (data.t[i] < t0 - span * 0.02 || data.t[i] > t0 + span * 1.02) continue;
      xs.push(x(data.t[i]));
      ys.push(H / 2 - (arr[i] / vd) * (H / 8));
    }
    return { k, c, path: linePath(xs, ys) };
  });

  const measure = (k: ProbeKind) => {
    const arr = data.ch[k];
    if (!arr) return null;
    const vals: number[] = [];
    const ts: number[] = [];
    for (let i = 0; i < data.t.length; i++)
      if (data.t[i] >= t0 && data.t[i] <= t0 + span && Number.isFinite(arr[i])) {
        vals.push(arr[i]);
        ts.push(data.t[i]);
      }
    if (vals.length < 2) return null;
    const mx = Math.max(...vals);
    const mn = Math.min(...vals);
    const mid = (mx + mn) / 2;
    const cross: number[] = [];
    for (let i = 1; i < vals.length; i++) if (vals[i - 1] < mid && vals[i] >= mid) cross.push(ts[i]);
    const freq = cross.length > 1 && mx - mn > 1e-3 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : 0;
    let rms = 0;
    for (let i = 1; i < vals.length; i++) rms += vals[i] * vals[i] * (ts[i] - ts[i - 1]);
    rms = Math.sqrt(rms / Math.max(ts[ts.length - 1] - ts[0], 1e-15));
    return { mx, mn, freq, rms };
  };

  const fftData = useMemo(() => {
    if (!fft) return null;
    const k = SCOPE_CHANNELS[trigCh];
    const arr = data.ch[k];
    if (!arr || data.t.length < 16) return null;
    const N = 1024;
    const samples = resample(data.t, arr, t0, t0 + span, N);
    return spectrum(samples, N / span);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fft, data.t.length, t0, span, trigCh]);

  const anyProbe = SCOPE_CHANNELS.some((k) => probes[k]);
  return (
    <>
      <View style={styles.screen}>
        <Canvas style={{ width: W, height: H }}>
          <Rect x={0} y={0} width={W} height={H} color={C.scopeBg} />
          <Grid />
          {fftData ? (
            (() => {
              const maxF = fftData.freq[fftData.freq.length - 1] || 1;
              const db = fftData.mag.map((m) => 20 * Math.log10(Math.max(m, 1e-6)));
              return (
                <Path
                  path={linePath(
                    fftData.freq.map((f) => (f / maxF) * W),
                    db.map((d) => H * (1 - (d + 80) / 100)),
                  )}
                  style="stroke"
                  strokeWidth={1.5}
                  color={C.trace[trigCh]}
                />
              );
            })()
          ) : (
            <>
              {traces.map((tr2) => (tr2 ? <Path key={tr2.k} path={tr2.path} style="stroke" strokeWidth={2} strokeJoin="round" color={C.trace[tr2.c]} /> : null))}
              <Line p1={vec(0, H / 2 - (trigLevel / VOLT_DIVS[vdiv[trigCh]]) * (H / 8))} p2={vec(12, H / 2 - (trigLevel / VOLT_DIVS[vdiv[trigCh]]) * (H / 8))} color={C.trace[trigCh]} strokeWidth={3} />
              {cursors &&
                cursors.map((cx, i) => (
                  <Line key={i} p1={vec(cx * W, 0)} p2={vec(cx * W, H)} color={C.ink2} strokeWidth={1}>
                    <DashPathEffect intervals={[4, 4]} />
                  </Line>
                ))}
            </>
          )}
        </Canvas>
        <View style={styles.screenInfo}>
          <Text style={T.caption}>
            {fft ? `FFT CH${trigCh + 1} · 0 – ${formatEng(512 / span, 'Hz')} · 20 dB/div` : `${formatEng(tdiv, 's')}/div · ${triggered ? 'Trig’d' : status === 'off' ? 'Stopped' : 'Auto'}${hold ? ' · HOLD' : ''}`}
          </Text>
        </View>
      </View>
      {!anyProbe && <Text style={[T.small, { marginTop: S.sm }]}>Place a channel probe on a hole, pin or wire end, then power on.</Text>}
      {fftData && (
        <Text style={[T.small, { marginTop: 4 }]}>
          Peak:{' '}
          {(() => {
            let bi = 1;
            for (let i = 1; i < fftData.mag.length; i++) if (fftData.mag[i] > fftData.mag[bi]) bi = i;
            return `${formatEng(fftData.freq[bi], 'Hz')} (${formatEng(fftData.mag[bi], 'V')})`;
          })()}
        </Text>
      )}
      <View style={[styles.row, { marginTop: S.sm }]}>
        <Button compact icon="remove" accessibilityLabel="Faster timebase" onPress={() => setTdivIdx(Math.max(0, tdivIdx - 1))} />
        <Text style={[T.mono, { minWidth: 90, textAlign: 'center' }]}>{formatEng(tdiv, 's')}/div</Text>
        <Button compact icon="add" accessibilityLabel="Slower timebase" onPress={() => setTdivIdx(Math.min(TIME_DIVS.length - 1, tdivIdx + 1))} />
        <Chip label={hold ? 'Run' : 'Hold'} active={hold} onPress={() => (hold ? setHold(false) : (setFrozen({ t: [...tr.t], ch: Object.fromEntries(Object.entries(tr.ch).map(([k, v]) => [k, [...v]])) }), setHold(true)))} />
        <Chip label="FFT" active={fft} onPress={() => setFft(!fft)} />
        <Chip label="Cursors" active={!!cursors} onPress={() => setCursors(cursors ? null : [0.3, 0.6])} />
      </View>
      {cursors && (
        <Card style={{ marginTop: S.sm }}>
          <View style={styles.row}>
            <Chip label="◀ A" onPress={() => setCursors([Math.max(0, cursors[0] - 0.02), cursors[1]])} />
            <Chip label="A ▶" onPress={() => setCursors([Math.min(1, cursors[0] + 0.02), cursors[1]])} />
            <Chip label="◀ B" onPress={() => setCursors([cursors[0], Math.max(0, cursors[1] - 0.02)])} />
            <Chip label="B ▶" onPress={() => setCursors([cursors[0], Math.min(1, cursors[1] + 0.02)])} />
          </View>
          <KV k="Δt" v={formatEng(Math.abs(cursors[1] - cursors[0]) * span, 's')} />
          <KV k="1/Δt" v={formatEng(1 / Math.max(1e-15, Math.abs(cursors[1] - cursors[0]) * span), 'Hz')} />
        </Card>
      )}
      <SectionTitle>Channels</SectionTitle>
      {SCOPE_CHANNELS.map((k, c) => {
        const m = probes[k] ? measure(k) : null;
        return (
          <View key={k} style={styles.chRow}>
            <View style={[styles.chDot, { backgroundColor: C.trace[c] }]} />
            <Text style={[T.label, { width: 40 }]}>CH{c + 1}</Text>
            <Chip label="−" onPress={() => setVdiv(vdiv.map((v, i) => (i === c ? Math.max(0, v - 1) : v)))} />
            <Text style={[T.mono, { width: 74, textAlign: 'center' }]}>{formatEng(VOLT_DIVS[vdiv[c]], 'V')}/div</Text>
            <Chip label="+" onPress={() => setVdiv(vdiv.map((v, i) => (i === c ? Math.min(VOLT_DIVS.length - 1, v + 1) : v)))} />
            {m && (
              <Text style={[T.caption, { flex: 1, marginLeft: 6 }]}>
                {formatEng(m.mx - m.mn, 'Vpp')} · {m.freq ? formatEng(m.freq, 'Hz') : 'DC'} · {formatEng(m.rms, 'Vrms')}
              </Text>
            )}
          </View>
        );
      })}
      <SectionTitle>Trigger</SectionTitle>
      <View style={styles.row}>
        {SCOPE_CHANNELS.map((_, c) => (
          <Chip key={c} label={`CH${c + 1}`} active={trigCh === c} color={C.trace[c]} onPress={() => setTrigCh(c)} />
        ))}
        <Chip label={rising ? '↑ rising' : '↓ falling'} onPress={() => setRising(!rising)} />
        <Chip label="− level" onPress={() => setTrigLevel(Number((trigLevel - VOLT_DIVS[vdiv[trigCh]] / 2).toFixed(4)))} />
        <Text style={T.mono}>{formatEng(trigLevel, 'V')}</Text>
        <Chip label="+ level" onPress={() => setTrigLevel(Number((trigLevel + VOLT_DIVS[vdiv[trigCh]] / 2).toFixed(4)))} />
      </View>
      <SectionTitle>Probes</SectionTitle>
      <ProbeChips kinds={SCOPE_CHANNELS} labels={['CH1', 'CH2', 'CH3', 'CH4']} colors={[...C.trace]} />
      <Text style={[T.caption, { marginTop: S.sm }]}>Tip: the time-scale control in the top bar slows the simulation so fast signals stay visible.</Text>
    </>
  );
}

// ------------------------------------------------------------------ logic analyzer

function LogicAnalyzer() {
  useSim((s) => s.traceVersion);
  const probes = useCircuit((s) => s.doc.probes);
  const [tdivIdx, setTdivIdx] = useState(9);
  const [th, setTh] = useState(2.5);
  const tdiv = TIME_DIVS[tdivIdx];
  useEffect(() => controller.setTimePerDiv(tdiv), [tdiv]);
  const tr = controller.trace;
  const span = tdiv * 10;
  const tLast = tr.t[tr.t.length - 1] ?? 0;
  const t0 = tLast - span;
  const rowH = 24;
  const used = LA_CHANNELS.filter((k) => probes[k]);
  const h = Math.max(1, used.length) * rowH + 8;
  return (
    <>
      <View style={styles.screen}>
        <Canvas style={{ width: W, height: h }}>
          <Rect x={0} y={0} width={W} height={h} color={C.scopeBg} />
          {Array.from({ length: 11 }, (_, i) => (
            <Line key={i} p1={vec((i * W) / 10, 0)} p2={vec((i * W) / 10, h)} color={C.scopeGrid} strokeWidth={1} />
          ))}
          {used.map((k, row) => {
            const arr = tr.ch[k] ?? [];
            const xs: number[] = [];
            const ys: number[] = [];
            let prev: number | null = null;
            for (let i = 0; i < tr.t.length; i++) {
              if (tr.t[i] < t0) continue;
              const hi = arr[i] > th ? 1 : 0;
              const xx = ((tr.t[i] - t0) / span) * W;
              const y = 4 + row * rowH + (hi ? 3 : rowH - 5);
              if (prev !== null && prev !== y) {
                xs.push(xx);
                ys.push(prev);
              }
              xs.push(xx);
              ys.push(y);
              prev = y;
            }
            return <Path key={k} path={linePath(xs, ys)} style="stroke" strokeWidth={2} color="#8E4EC6" />;
          })}
        </Canvas>
      </View>
      <View style={[styles.row, { marginTop: S.sm }]}>
        <Button compact icon="remove" accessibilityLabel="Faster timebase" onPress={() => setTdivIdx(Math.max(0, tdivIdx - 1))} />
        <Text style={[T.mono, { minWidth: 90, textAlign: 'center' }]}>{formatEng(tdiv, 's')}/div</Text>
        <Button compact icon="add" accessibilityLabel="Slower timebase" onPress={() => setTdivIdx(Math.min(TIME_DIVS.length - 1, tdivIdx + 1))} />
        <Chip label="Threshold 1.65 V" active={th === 1.65} onPress={() => setTh(1.65)} />
        <Chip label="2.5 V" active={th === 2.5} onPress={() => setTh(2.5)} />
      </View>
      <SectionTitle>Channels (top to bottom)</SectionTitle>
      <Text style={T.small}>{used.length ? used.map((k) => `L${k.slice(2)}`).join(', ') : 'No logic probes placed yet.'}</Text>
      <SectionTitle>Probes</SectionTitle>
      <ProbeChips kinds={LA_CHANNELS} labels={LA_CHANNELS.map((k) => `L${k.slice(2)}`)} />
    </>
  );
}

// ------------------------------------------------------------------ Bode plot

function Bode() {
  const doc = useCircuit((s) => s.doc);
  const [fStart, setFStart] = useState(10);
  const [fStop, setFStop] = useState(1e6);
  const [res, setRes] = useState<ReturnType<typeof controller.bode> | null>(null);
  const [err, setErr] = useState('');
  const run = () => {
    try {
      setErr('');
      setRes(controller.bode(doc, { fStart, fStop }));
    } catch (e) {
      setRes(null);
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const plot = (vals: number[], lo: number, hi: number) => {
    if (!res) return null;
    const lf0 = Math.log10(res.freqs[0]);
    const lf1 = Math.log10(res.freqs[res.freqs.length - 1]);
    return linePath(
      res.freqs.map((f) => ((Math.log10(f) - lf0) / (lf1 - lf0)) * W),
      vals.map((v) => ((hi - v) / (hi - lo)) * 140),
    );
  };
  const minDb = res ? Math.floor(Math.min(...res.db) / 20) * 20 : -60;
  const maxDb = res ? Math.ceil(Math.max(...res.db) / 20) * 20 + 0.0001 : 20;
  const f3 = res ? (() => {
    const ref = res.db[0];
    const k = res.db.findIndex((d) => d < ref - 3);
    return k > 0 ? res.freqs[k] : null;
  })() : null;
  return (
    <>
      <Text style={T.small}>
        Sweeps the function generator (1 V small-signal) and plots CH1 relative to the generator output. Works with the power off: it uses the DC operating point.
      </Text>
      <View style={[styles.row, { marginTop: S.sm }]}>
        {[1, 10, 100].map((f) => (
          <Chip key={f} label={`from ${formatEng(f, 'Hz')}`} active={fStart === f} onPress={() => setFStart(f)} />
        ))}
        {[1e4, 1e5, 1e6, 1e7].map((f) => (
          <Chip key={f} label={`to ${formatEng(f, 'Hz')}`} active={fStop === f} onPress={() => setFStop(f)} />
        ))}
      </View>
      <Button icon="pulse" label="Run AC sweep" kind="primary" onPress={run} style={{ marginTop: S.sm }} />
      {!!err && <Text style={[T.small, { color: C.danger, marginTop: S.sm }]}>{err}</Text>}
      {res && (
        <>
          <Text style={[T.label, { marginTop: S.md }]}>Gain (dB) · {res.output} / {res.input}</Text>
          <View style={styles.screen}>
            <Canvas style={{ width: W, height: 140 }}>
              <Rect x={0} y={0} width={W} height={140} color={C.scopeBg} />
              <Grid cols={Math.round(Math.log10(fStop / fStart))} rows={4} />
              <Path path={plot(res.db, minDb, maxDb) ?? Skia.Path.Make()} style="stroke" strokeWidth={2} color={C.trace[0]} />
            </Canvas>
          </View>
          <Text style={T.caption}>
            {maxDb.toFixed(0)} dB top, {minDb.toFixed(0)} dB bottom · {f3 ? `−3 dB at ${formatEng(f3, 'Hz')}` : 'no −3 dB point in range'}
          </Text>
          <Text style={[T.label, { marginTop: S.md }]}>Phase (°)</Text>
          <View style={styles.screen}>
            <Canvas style={{ width: W, height: 140 }}>
              <Rect x={0} y={0} width={W} height={140} color={C.scopeBg} />
              <Grid cols={Math.round(Math.log10(fStop / fStart))} rows={4} />
              <Path path={plot(res.phase, -180, 180) ?? Skia.Path.Make()} style="stroke" strokeWidth={2} color={C.trace[1]} />
            </Canvas>
          </View>
          <Text style={T.caption}>+180° top, −180° bottom, one decade per division</Text>
        </>
      )}
      <SectionTitle>Output probe</SectionTitle>
      <ProbeChips kinds={['ch1']} labels={['CH1 (output)']} colors={[C.trace[0]]} />
    </>
  );
}

// ------------------------------------------------------------------ serial monitor

function SerialMonitor() {
  const doc = useCircuit((s) => s.doc);
  useSim((s) => s.simTime);
  const boards = doc.parts.filter((p) => p.type === 'arduino');
  const [id, setId] = useState(boards[0]?.id ?? '');
  const [line, setLine] = useState('');
  const text = controller.serialText(id);
  return (
    <>
      <View style={styles.row}>
        {boards.map((b) => (
          <Chip key={b.id} label={partLabel(b, doc.parts)} active={id === b.id} onPress={() => setId(b.id)} />
        ))}
        <Chip label="Clear" onPress={() => controller.clearSerial(id)} />
      </View>
      <Text style={[T.caption, { marginTop: S.sm }]}>9600 baud · output of Serial.print / USART0</Text>
      <ScrollView style={styles.serial} contentContainerStyle={{ padding: S.sm }}>
        <Text style={[T.mono, { fontSize: 12 }]}>{text.slice(-4000) || '(no output yet — power on)'}</Text>
      </ScrollView>
      <View style={[styles.row, { marginTop: S.sm }]}>
        <TextInput
          accessibilityLabel="Text to send"
          value={line}
          onChangeText={setLine}
          placeholder="Send to board…"
          placeholderTextColor={C.inkFaint}
          style={[styles.sendInput]}
          onSubmitEditing={() => {
            controller.writeSerial(id, `${line}\n`);
            setLine('');
          }}
        />
        <Button
          icon="send"
          accessibilityLabel="Send"
          kind="primary"
          onPress={() => {
            controller.writeSerial(id, `${line}\n`);
            setLine('');
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  lcd: { backgroundColor: '#18241F', borderRadius: R.lg, padding: S.lg, minHeight: 110, justifyContent: 'center' },
  lcdMode: { color: '#7FB7A0', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  lcdValue: { color: '#C9FBE5', fontSize: 40, fontFamily: 'monospace', fontWeight: '700' },
  lcdBeep: { color: '#FFD166', fontWeight: '700', marginTop: 4 },
  screen: { borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start', marginTop: S.xs },
  screenInfo: { position: 'absolute', right: 6, top: 4, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 6, borderRadius: 6 },
  chRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  chDot: { width: 12, height: 12, borderRadius: 6 },
  serial: { height: 200, backgroundColor: C.surface2, borderRadius: R.md, borderWidth: 1, borderColor: C.border, marginTop: S.sm },
  sendInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, color: C.ink, backgroundColor: C.surface },
});
