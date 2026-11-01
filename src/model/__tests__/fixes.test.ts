import { analyzeTopology } from '@sim/diagnostics';
import { Simulator } from '@sim/simulator';
import { effectWav, semitone, toneWav } from '@/lib/wav';
import { DocBuilder, WIRE, addRails, railNear } from '../build';
import { applyFixOps, e12AtLeast, fixesFor, plugInFixes } from '../fixes';
import { extractNetlist } from '../netlist';
import { pinPositions } from '../parts';
import type { CircuitDoc } from '../types';

const topo = (d: CircuitDoc) => analyzeTopology(extractNetlist(d).netlist);
function ledDoc(): DocBuilder {
  const b = new DocBuilder('t');
  addRails(b, { v: 9 });
  b.wire(railNear('top', '+', 10), 'a10', WIRE.red);
  b.part('resistor', 'c10', { id: 'r1', props: { r: 470 } });
  b.part('led', 'd14', { id: 'd1' });
  b.wire('a15', railNear('top', '-', 16), WIRE.black);
  return b;
}

describe('one-tap fixes', () => {
  test('no ground: adds a ground symbol on the source’s − side', () => {
    const d = ledDoc().build();
    d.parts = d.parts.filter((p) => p.type !== 'ground');
    const diag = topo(d).find((x) => x.code === 'no-ground')!;
    const [fix] = fixesFor(diag, d, extractNetlist(d));
    applyFixOps(d, fix.ops);
    expect(topo(d).some((x) => x.code === 'no-ground')).toBe(false);
  });

  test('bypassed resistor: moved so its leads are in different strips', () => {
    const b = ledDoc();
    const d = b.build();
    Object.assign(d.parts.find((p) => p.id === 'r1')!, { x: 11, y: 6, rot: 1 });
    const diag = topo(d).find((x) => x.code === 'bypassed')!;
    const [fix] = fixesFor(diag, d, extractNetlist(d));
    expect(fix.label).toMatch(/different strips/);
    applyFixOps(d, fix.ops);
    expect(topo(d).some((x) => x.code === 'bypassed')).toBe(false);
  });

  test('shorted source: removes the offending wire', () => {
    const d = ledDoc().build();
    d.wires.push({ id: 'short', a: { x: 41, y: 2 }, b: { x: 41, y: 3 }, color: '#fff' });
    const diag = topo(d).find((x) => x.code === 'shorted-source')!;
    const [fix] = fixesFor(diag, d, extractNetlist(d));
    expect(fix.ops).toEqual([{ kind: 'deleteWire', wireId: 'short' }]);
  });

  test('reversed LED: turned around', () => {
    const d = ledDoc().build();
    const led = d.parts.find((p) => p.id === 'd1')!;
    const before = pinPositions(led).map(({ x, y }) => ({ x, y }));
    const [fix] = fixesFor({ severity: 'warning', code: 'reverse-polarity', title: '', message: '', partId: 'd1' }, d, null);
    applyFixOps(d, fix.ops);
    expect(pinPositions(led).map(({ x, y }) => ({ x, y }))).toEqual([before[1], before[0]]);
  });

  test('LED without a resistor: a series resistor is inserted and limits the current', () => {
    const b = new DocBuilder('t');
    addRails(b, { v: 9 });
    b.wire(railNear('top', '+', 20), 'a20', WIRE.red);
    b.part('led', 'c20', { id: 'd1' });
    b.wire('a21', railNear('top', '-', 22), WIRE.black);
    const d = b.build();
    const fixes = fixesFor({ severity: 'warning', code: 'over-current', title: '', message: '', partId: 'd1' }, d, extractNetlist(d));
    const series = fixes.find((f) => f.label.includes('resistor'))!;
    expect(series).toBeDefined();
    applyFixOps(d, series.ops);
    const s = new Simulator(extractNetlist(d).netlist, { maxStep: 1e-3 });
    s.startTransient();
    s.advance(0.05);
    const i = s.read('d1').i;
    expect(i).toBeGreaterThan(0.008);
    expect(i).toBeLessThan(0.02);
  });

  test('a lead over the centre channel gets a plug-in fix', () => {
    const d = ledDoc().build();
    Object.assign(d.parts.find((p) => p.id === 'r1')!, { y: 11 });
    const [fix] = plugInFixes(d);
    applyFixOps(d, fix.ops);
    expect(plugInFixes(d)).toEqual([]);
  });

  test('standard resistor values', () => {
    expect(e12AtLeast(467)).toBe(470);
    expect(e12AtLeast(1000)).toBe(1000);
    expect(e12AtLeast(1100)).toBe(1200);
  });
});

describe('sound synthesis', () => {
  test('tone files loop on whole cycles and stay close to the pitch', () => {
    const t = toneWav(523.25);
    expect(Math.abs(t.freq - 523.25)).toBeLessThan(3);
    expect(String.fromCharCode(...t.bytes.slice(0, 4))).toBe('RIFF');
    expect(semitone(445)).toBeCloseTo(440, 5);
  });
  test('effects are valid WAV data', () => {
    for (const e of ['pop', 'click', 'chime', 'crack'] as const) {
      const w = effectWav(e);
      expect(String.fromCharCode(...w.slice(8, 12))).toBe('WAVE');
      expect(w.length).toBeGreaterThan(100);
    }
  });
});
