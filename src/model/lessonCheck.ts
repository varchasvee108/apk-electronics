import { frequency } from '@sim/measure';
import { formatEng } from '@sim/units';
import type { Snapshot } from '@/sim/controller';
import { hole } from './breadboard';
import type { Check } from './lessons';
import { nodeAt, type Extraction } from './netlist';
import type { CircuitDoc, PartInstance } from './types';

export interface CheckMemory {
  blinks: Record<string, { last: boolean; count: number }>;
  patterns: Record<string, Set<string>>;
  seen: Set<string>;
  darkOn: boolean;
  brightOff: boolean;
}

export const newMemory = (): CheckMemory => ({ blinks: {}, patterns: {}, seen: new Set(), darkOn: false, brightOff: false });

export interface CheckContext {
  doc: CircuitDoc;
  snap: Snapshot | null;
  ex: Extraction | null;
  mem: CheckMemory;
  /** Trace data for scope-based checks. */
  trace: { t: number[]; ch: Record<string, number[]> };
  serial: (partId: string) => string;
}

export interface CheckResult {
  ok: boolean;
  detail: string;
}

const lit = (snap: Snapshot, id: string): boolean => {
  const [partId, suffix] = id.includes('.') ? id.split('.') : [id, ''];
  const live = snap.parts[partId];
  if (!live) return false;
  const rd = suffix ? live.els[suffix] : (live.els[''] ?? live);
  return Number((rd as { extra?: Record<string, unknown> })?.extra?.brightness ?? 0) > 0.2;
};

/** Update the time-based memory from a new snapshot (call on every published snapshot). */
export function remember(checks: Check[], ctx: CheckContext): void {
  const { snap, mem, doc } = ctx;
  if (!snap) return;
  for (const c of checks) {
    if (c.kind === 'blinks') {
      const on = lit(snap, c.part);
      const m = (mem.blinks[c.part] ??= { last: on, count: 0 });
      if (on && !m.last) m.count++;
      m.last = on;
    } else if (c.kind === 'patterns') {
      const key = c.parts.join('|');
      (mem.patterns[key] ??= new Set()).add(c.parts.map((p) => (lit(snap, p) ? '1' : '0')).join(''));
    } else if (c.kind === 'seenAll') {
      for (const p of c.parts) if (lit(snap, p)) mem.seen.add(p);
    } else if (c.kind === 'nightLight') {
      const ldrs = doc.parts.filter((p) => p.type === 'ldr');
      const leds = doc.parts.filter((p) => p.type === 'led');
      if (!ldrs.length || !leds.length) continue;
      const anyLit = leds.some((p) => lit(snap, p.id));
      const lux = ldrs.map((p) => Number(p.props.lux ?? 300));
      if (lux.every((l) => l <= 10) && anyLit) mem.darkOn = true;
      if (lux.every((l) => l >= 1000) && !anyLit) mem.brightOff = true;
    }
  }
}

function pickParts(doc: CircuitDoc, part?: string, type?: string): PartInstance[] {
  if (part) return doc.parts.filter((p) => p.id === part);
  if (type) return doc.parts.filter((p) => p.type === type);
  return [];
}

const inRange = (v: number, min: number, max: number) => v >= min && v <= max;

export function evaluate(c: Check, ctx: CheckContext): CheckResult {
  const { doc, snap, ex, mem } = ctx;
  const need = (): CheckResult => ({ ok: false, detail: 'Power on to measure' });
  switch (c.kind) {
    case 'current':
    case 'partVoltage': {
      if (!snap) return need();
      const parts = pickParts(doc, c.part, c.type);
      if (!parts.length) return { ok: false, detail: c.type ? `Add a ${c.type}` : 'Part missing' };
      const vals = parts.map((p) => {
        const l = snap.parts[p.id];
        return l ? (c.kind === 'current' ? Math.abs(l.i) : l.v) : NaN;
      });
      const good = vals.filter((v) => inRange(v, c.min, c.max)).length;
      const want = c.kind === 'current' ? (c.count ?? 1) : 1;
      const unit = c.kind === 'current' ? 'A' : 'V';
      return { ok: good >= want, detail: vals.map((v) => formatEng(v, unit)).join(', ') };
    }
    case 'voltage': {
      if (!snap || !ex) return need();
      const n = nodeAt(ex, hole(c.at));
      const v = n === undefined ? 0 : (snap.nodeV[n] ?? 0);
      return { ok: inRange(v, c.min, c.max), detail: formatEng(v, 'V') };
    }
    case 'ledOn': {
      if (!snap) return need();
      const parts = c.part ? [c.part] : doc.parts.filter((p) => p.type === 'led').map((p) => p.id);
      const n = parts.filter((p) => lit(snap, p)).length;
      return { ok: n >= (c.count ?? 1), detail: `${n} lit` };
    }
    case 'ledOff': {
      if (!snap) return need();
      const on = lit(snap, c.part);
      return { ok: !on, detail: on ? 'lit' : 'dark' };
    }
    case 'blinks': {
      const m = mem.blinks[c.part];
      return { ok: (m?.count ?? 0) >= c.min, detail: `${m?.count ?? 0} blinks seen` };
    }
    case 'patterns': {
      const s = mem.patterns[c.parts.join('|')];
      return { ok: (s?.size ?? 0) >= c.min, detail: `${s?.size ?? 0} different states seen` };
    }
    case 'seenAll': {
      const n = c.parts.filter((p) => mem.seen.has(p)).length;
      return { ok: n === c.parts.length, detail: `${n} of ${c.parts.length} seen` };
    }
    case 'prop': {
      const parts = pickParts(doc, c.part, c.type);
      const ok = parts.some((p) => {
        const v = p.props[c.key];
        if (c.equals !== undefined) return v === c.equals;
        return typeof v === 'number' && inRange(v, c.min ?? -Infinity, c.max ?? Infinity);
      });
      const v = parts[0]?.props[c.key];
      return { ok, detail: typeof v === 'number' ? formatEng(v) : String(v ?? '—') };
    }
    case 'rcCutoff': {
      const r = doc.parts.find((p) => p.type === 'resistor');
      const cap = doc.parts.find((p) => p.type === 'cap' || p.type === 'ecap');
      if (!r || !cap) return { ok: false, detail: 'Needs a resistor and a capacitor' };
      const fc = 1 / (2 * Math.PI * Number(r.props.r) * Number(cap.props.c));
      return { ok: inRange(fc, c.min, c.max), detail: `fc = ${formatEng(fc, 'Hz')}` };
    }
    case 'f555': {
      const r1 = doc.parts.find((p) => p.id === 'r555a');
      const r2 = doc.parts.find((p) => p.id === 'r555b');
      const cap = doc.parts.find((p) => p.id === 'c555');
      if (!r1 || !r2 || !cap) return { ok: false, detail: 'Timing parts missing' };
      const f = 1.44 / ((Number(r1.props.r) + 2 * Number(r2.props.r)) * Number(cap.props.c));
      return { ok: inRange(f, c.min, c.max), detail: `f = ${formatEng(f, 'Hz')}` };
    }
    case 'scopeFreq':
    case 'freqRatio': {
      const { t, ch } = ctx.trace;
      if (t.length < 20) return need();
      const tFrom = t[Math.floor(t.length / 3)];
      const f = (k: string) => {
        const y = ch[k];
        if (!y) return 0;
        const finite = y.filter(Number.isFinite);
        if (!finite.length) return 0;
        const mid = (Math.max(...finite) + Math.min(...finite)) / 2;
        return frequency(t, y, mid, tFrom);
      };
      if (c.kind === 'scopeFreq') {
        const fr = f(c.ch);
        return { ok: inRange(fr, c.min, c.max), detail: fr ? formatEng(fr, 'Hz') : 'no signal on the probe' };
      }
      const f1 = f('ch1');
      const f2 = f('ch2');
      const ratio = f2 > 0 ? f1 / f2 : 0;
      return { ok: inRange(ratio, c.min, c.max), detail: ratio ? `${ratio.toFixed(2)} : 1` : 'need signals on CH1 and CH2' };
    }
    case 'dmm': {
      if (!snap) return need();
      if (!snap.dmm) return { ok: false, detail: 'Place both meter probes' };
      return { ok: inRange(snap.dmm.v, c.min, c.max), detail: formatEng(snap.dmm.v, 'V') };
    }
    case 'segments': {
      if (!snap) return need();
      const live = snap.parts[c.part];
      const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
      const on = segs.filter((s) => Number(live?.els[s]?.extra?.brightness ?? 0) > 0.2);
      const ok = c.on.every((s) => on.includes(s)) && on.every((s) => c.on.includes(s));
      return { ok, detail: on.length ? `lit: ${on.join(' ')}` : 'nothing lit' };
    }
    case 'serialAbove': {
      const lines = ctx.serial(c.part).split(/\r?\n/).filter((l) => /^\d+$/.test(l.trim()));
      const last = Number(lines[lines.length - 1] ?? NaN);
      return { ok: last > c.value, detail: Number.isFinite(last) ? `last value ${last}` : 'no values yet' };
    }
    case 'nightLight':
      return {
        ok: mem.darkOn && mem.brightOff,
        detail: `${mem.darkOn ? '✓' : '·'} on when dark   ${mem.brightOff ? '✓' : '·'} off when bright`,
      };
    case 'hasPart': {
      const n = doc.parts.filter((p) => p.type === c.type).length;
      return { ok: n >= (c.count ?? 1), detail: `${n} placed` };
    }
    case 'probe':
      return { ok: !!doc.probes[c.probe as keyof CircuitDoc['probes']], detail: doc.probes[c.probe as keyof CircuitDoc['probes']] ? 'placed' : 'not placed' };
    case 'noDamage': {
      if (!snap) return { ok: true, detail: '' };
      const bad = Object.values(snap.parts).filter((p) => p.failed).length;
      return { ok: bad === 0, detail: bad ? `${bad} damaged` : 'all good' };
    }
    default:
      return { ok: false, detail: '' };
  }
}
