import { formatEng } from '@sim/units';
import { holeAt } from './breadboard';
import { partDef, partLabel, pinPositions } from './parts';
import type { CircuitDoc, PartInstance, Pt, Wire } from './types';
import { ptKey } from './types';

/**
 * Build an example circuit step by step. Steps are derived from the finished circuit: parts first
 * (sources, then chips, then the rest from left to right), then the wires in the order the circuit
 * was drawn. A step counts as done when the learner's circuit has an equivalent part or wire: on a
 * breadboard any hole of the same 5-hole strip (or rail half) is as good as the original hole.
 */

export type BuildStep = { kind: 'part'; target: PartInstance; text: string; detail: string } | { kind: 'wire'; target: Wire; text: string; detail: string };

const NON_POLAR = new Set(['resistor', 'cap', 'inductor', 'ldr', 'thermistor', 'fuse', 'lamp', 'reed', 'tilt', 'flex', 'fsr', 'toggle', 'button']);

/** Breadboard-equivalence key of a point: its strip / rail group, or the exact point off the board. */
function spot(doc: CircuitDoc, p: Pt): string {
  if (doc.board === 'breadboard') {
    const h = holeAt(p);
    if (h) return `#${h.group}`;
  }
  return ptKey(p);
}

/** Human name of a connection point: hole name, rail, or a part's pin. */
function where(target: CircuitDoc, p: Pt): string {
  const h = target.board === 'breadboard' ? holeAt(p) : null;
  if (h) return h.kind === 'rail' ? `the ${h.name}` : h.name;
  for (const part of target.parts) {
    const pin = pinPositions(part).find((q) => q.x === p.x && q.y === p.y);
    if (pin) return `${partLabel(part, target.parts)} ${pin.name}`;
  }
  return `(${p.x}, ${p.y})`;
}

function valueText(part: PartInstance): string {
  const v = partDef(part.type).value?.(part.props);
  return v ? ` ${v}` : '';
}

export function buildSteps(target: CircuitDoc): BuildStep[] {
  const rank = (p: PartInstance) => {
    const d = partDef(p.type);
    if (['battery', 'supply', 'funcgen', 'acsource'].includes(p.type)) return 0;
    if (p.type === 'ground') return 1;
    if (p.type === 'arduino') return 2;
    if (d.dip) return 3;
    return 4;
  };
  const parts = [...target.parts].sort((a, b) => rank(a) - rank(b) || a.x - b.x || a.y - b.y);
  const steps: BuildStep[] = parts.map((p) => {
    const d = partDef(p.type);
    const pins = pinPositions(p);
    const holes = pins.map((q) => holeAt(q)).filter(Boolean);
    const placeText =
      target.board === 'breadboard' && holes.length === pins.length
        ? pins.length <= 3
          ? `with its leads in ${pins.map((q) => `${q.name} → ${where(target, q)}`).join(', ')}`
          : `with pin 1 in ${where(target, pins[0])}`
        : p.type === 'ground'
          ? `at ${where(target, pins[0])}`
          : 'where the highlight shows';
    return {
      kind: 'part',
      target: p,
      text: `Place ${partLabel(p, target.parts)} · ${d.name}${valueText(p)}`,
      detail: placeText.charAt(0).toUpperCase() + placeText.slice(1),
    };
  });
  for (const w of target.wires) steps.push({ kind: 'wire', target: w, text: `Wire ${where(target, w.a)} to ${where(target, w.b)}`, detail: 'Use the Wire tool: drag from one end to the other.' });
  return steps;
}

function sameValues(a: PartInstance, b: PartInstance): boolean {
  for (const spec of partDef(a.type).props) {
    if (spec.kind !== 'value' && spec.kind !== 'enum') continue;
    const x = a.props[spec.key];
    const y = b.props[spec.key];
    if (typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x)) : x !== y) return false;
  }
  return true;
}

/** The learner's part that matches a target part by position (ignoring its values), if any. */
export function matchingPart(doc: CircuitDoc, target: PartInstance, used = new Set<string>()): PartInstance | undefined {
  const want = pinPositions(target).map((q) => spot(doc, q));
  return doc.parts.find((p) => {
    if (used.has(p.id) || p.type !== target.type) return false;
    const have = pinPositions(p).map((q) => spot(doc, q));
    if (have.every((k, i) => k === want[i])) return true;
    return NON_POLAR.has(p.type) && have.length === 2 && have[0] === want[1] && have[1] === want[0];
  });
}

export type StepState = 'done' | 'wrongValue' | 'todo';

/** State of every step against the learner's circuit. */
export function stepStates(doc: CircuitDoc, steps: BuildStep[]): StepState[] {
  const used = new Set<string>();
  const usedWires = new Set<string>();
  return steps.map((s) => {
    if (s.kind === 'part') {
      const p = matchingPart(doc, s.target, used);
      if (!p) return 'todo';
      used.add(p.id);
      return sameValues(p, s.target) ? 'done' : 'wrongValue';
    }
    const a = spot(doc, s.target.a);
    const b = spot(doc, s.target.b);
    const w = doc.wires.find((q) => {
      if (usedWires.has(q.id)) return false;
      const qa = spot(doc, q.a);
      const qb = spot(doc, q.b);
      return (qa === a && qb === b) || (qa === b && qb === a);
    });
    if (!w) return 'todo';
    usedWires.add(w.id);
    return 'done';
  });
}

/** Describe the values a part should have (for the "set its value" hint). */
export function valueHint(target: PartInstance): string {
  const parts = partDef(target.type)
    .props.filter((s) => s.kind === 'value' || s.kind === 'enum')
    .map((s) => {
      const v = target.props[s.key];
      return `${s.label}: ${typeof v === 'number' ? formatEng(v, s.unit ?? '') : String(v)}`;
    });
  return parts.join(', ');
}

/** Points to highlight on the canvas for a step. */
export function stepHighlight(step: BuildStep): { pins: Pt[]; line: [Pt, Pt] | null } {
  if (step.kind === 'part') return { pins: pinPositions(step.target).map((q) => ({ x: q.x, y: q.y })), line: null };
  return { pins: [step.target.a, step.target.b], line: [step.target.a, step.target.b] };
}

/** Empty board to build on (same board type and name). */
export function blankFor(target: CircuitDoc, id: string): CircuitDoc {
  return { ...target, id, name: `${target.name} (build-along)`, parts: [], wires: [], probes: {}, origin: 'build' };
}
