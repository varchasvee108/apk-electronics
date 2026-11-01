import type { CircuitDoc } from '../types';
import type { Snapshot } from '@/sim/snapshot';
import type { LearningLesson } from './types';
const eng = (v: number | undefined, unit: string) =>
  v === undefined || !Number.isFinite(v)
    ? 'not measured'
    : Math.abs(v) >= 1
      ? `${Number(v.toFixed(3))} ${unit}`
      : Math.abs(v) >= 0.001
        ? `${Number((v * 1000).toFixed(3))} m${unit}`
        : `${Number((v * 1e6).toFixed(3))} µ${unit}`;
export function explainLive(lesson: LearningLesson, doc: CircuitDoc, snap: Snapshot | null, serial: Record<string, string> = {}) {
  if (!snap)
    return {
      title: 'Predict before you run',
      text: lesson.observe,
      evidence: 'No live measurement yet. Run the circuit to connect the explanation to measured values.',
    };
  if (lesson.truth) {
    const a = Boolean(doc.parts.find((p) => p.id === 's1')?.props.pos),
      b = Boolean(doc.parts.find((p) => p.id === 's2')?.props.pos);
    const output = lesson.truth === 'nand' ? !(a && b) : lesson.truth === 'xor' ? a !== b : a || b;
    return {
      title: `A=${Number(a)}, B=${Number(b)} → predicted Y=${Number(output)}`,
      text:
        lesson.truth === 'nand'
          ? `Both inputs ${a && b ? 'are' : 'are not'} high, so NAND ${a && b ? 'inverts the true AND result to low' : 'produces a high output'}.`
          : lesson.truth === 'xor'
            ? `The inputs ${a === b ? 'match' : 'differ'}, so XOR predicts ${output ? 'high' : 'low'}.`
            : `${a || b ? 'At least one' : 'Neither'} input is high, so OR predicts ${output ? 'high' : 'low'}.`,
      evidence: `Measured Y relative to ground: ${eng(snap.dmm?.v, 'V')}. Logic states are interpreted voltage ranges, not exact mathematical voltages.`,
    };
  }
  if (lesson.unit === 'u12' || lesson.id === 'ic-555-inside') {
    const r1 = Number(doc.parts.find((p) => p.id === 'r555a')?.props.r),
      r2 = Number(doc.parts.find((p) => p.id === 'r555b')?.props.r),
      c = Number(doc.parts.find((p) => p.id === 'c555')?.props.c);
    const f = 1.44 / ((r1 + 2 * r2) * c),
      duty = (r1 + r2) / (r1 + 2 * r2);
    return {
      title: 'Your timing parts set the cycle',
      text: `With the current R1, R2, and C, the standard astable approximation predicts ${eng(f, 'Hz')} and ${(duty * 100).toFixed(1)}% high time. Increasing C slows both parts of the cycle.`,
      evidence: 'This is a component-based prediction, not a measured frequency. Compare capacitor threshold crossings and output edges in the scope.',
    };
  }
  if (lesson.id === 'arduino-adc' || lesson.id === 'arduino-pot') {
    const pos = Number(doc.parts.find((p) => p.type === 'pot')?.props.pos);
    const lines = (serial.uno ?? '').trim().split(/\r?\n/);
    const value = lines[lines.length - 1];
    return {
      title: 'The knob is a voltage ratio',
      text: `The current ${(pos * 100).toFixed(1)}% position predicts about ${Math.round(pos * 1023)} on a 10-bit ADC when signal and reference share the same supply.`,
      evidence: `Most recent serial line: ${value || 'waiting for ADC output'}. The prediction is ideal; the live code is sampled and quantized.`,
    };
  }
  const r = doc.parts.find((p) => p.type === 'resistor'),
    cap = doc.parts.find((p) => ['cap', 'ecap'].includes(p.type));
  if ((lesson.unit === 'u4' || lesson.unit === 'u11') && r && cap) {
    const tau = Number(r.props.r) * Number(cap.props.c);
    return {
      title: 'Resistance and capacitance set the pace',
      text: `Current values give RC=${eng(tau, 's')}${lesson.unit === 'u11' ? ` and an unloaded first-order cutoff near ${eng(1 / (2 * Math.PI * tau), 'Hz')}` : '. Starting discharged, one RC interval brings a simple charging circuit to about 63% of its final voltage'}.`,
      evidence:
        'This approximation assumes the stated topology. Loading and additional discharge paths can alter the measured response; reset before comparing starts.',
    };
  }
  if (r && snap.parts[r.id] && ['u1', 'u2', 'u3', 'u7'].includes(lesson.unit)) {
    const rd = snap.parts[r.id],
      resistance = Number(r.props.r);
    return {
      title: 'Ohm’s law connects this measurement',
      text: `The selected teaching resistor (${eng(resistance, 'Ω')}) has ${eng(rd.v, 'V')} across it. V/R predicts ${eng(rd.v / resistance, 'A')}; the solver reports ${eng(rd.i, 'A')}.`,
      evidence: `Resistor power is ${eng(rd.p, 'W')}. This voltage is across that resistor, not automatically the entire supply. In a series loop each component gets its own voltage share.`,
    };
  }
  return {
    title: 'Connect the behavior to a measurement',
    text: lesson.observe,
    evidence: `Simulation time: ${eng(snap.t, 's')}. Select a component for live voltage, current, power, and device-specific readings; compare those with your prediction.`,
  };
}
