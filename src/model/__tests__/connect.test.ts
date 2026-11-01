import { analyzeTopology } from '@sim/diagnostics';
import { NetlistBuilder } from '@sim/builder';
import { Simulator } from '@sim/simulator';
import { ReadingAverager } from '@/sim/averager';
import { useCircuit } from '@/store/circuit';
import { hole } from '../breadboard';
import { DocBuilder, addRails } from '../build';
import { isAnchor, loosePins, settleOffset, snapToAnchor } from '../connect';
import { extractNetlist } from '../netlist';
import { pinPositions } from '../parts';
import type { CircuitDoc } from '../types';

jest.mock('@/store/db', () => ({ saveCircuit: jest.fn() }));

function ledDoc(): CircuitDoc {
  const b = new DocBuilder('t');
  addRails(b, { v: 9 });
  b.part('resistor', 'c10', { id: 'r1', props: { r: 470 } });
  b.part('led', 'c14', { id: 'd1' });
  b.wire({ x: hole('a10').x, y: 2 }, 'a10');
  b.wire('a15', { x: hole('a15').x, y: 3 });
  return b.build();
}

describe('wire ends only plug into holes and terminals', () => {
  test('anchors: holes and pins, not empty space', () => {
    const doc = ledDoc();
    expect(isAnchor(doc, hole('a1'))).toBe(true);
    expect(isAnchor(doc, { x: 4, y: -9 })).toBe(true); // battery + terminal, off the board
    expect(isAnchor(doc, { x: 20, y: -20 })).toBe(false); // mid-air
    expect(isAnchor(doc, { x: 20, y: 11 })).toBe(false); // centre channel
    expect(isAnchor(doc, { x: 9, y: 2 })).toBe(false); // gap between rail groups
    expect(isAnchor({ ...doc, board: 'none' }, { x: 20, y: -20 })).toBe(true); // schematic: any junction
  });

  test('a slightly-off touch snaps to the nearest hole; far from everything gives nothing', () => {
    const doc = ledDoc();
    expect(snapToAnchor(doc, { x: hole('b20').x + 0.4, y: hole('b20').y - 0.35 }, { radius: 0.8 })).toEqual(hole('b20'));
    expect(snapToAnchor(doc, { x: 30, y: -30 }, { radius: 1 })).toBeNull();
    // a probe tapped on the middle of the resistor body measures at its nearest lead
    const r = pinPositions(doc.parts.find((p) => p.id === 'r1')!);
    const body = { x: r[0].x + 1.6, y: r[0].y - 0.1 };
    expect(snapToAnchor(doc, body, { radius: 0.5, partBodies: true })).toEqual({ x: r[0].x, y: r[0].y });
  });

  test('the store refuses wires that end in mid-air and keeps a wire when its end is dropped nowhere', () => {
    useCircuit.getState().load(ledDoc());
    const st = useCircuit.getState;
    const n = st().doc.wires.length;
    expect(st().addWire(hole('a30'), { x: 30, y: -12 })).toBeNull();
    expect(st().addWire(hole('a30'), { x: 30, y: 11 })).toBeNull();
    expect(st().doc.wires.length).toBe(n);
    const id = st().addWire(hole('a30'), hole('a40'));
    expect(id).not.toBeNull();
    // the same jumper twice adds nothing
    expect(st().addWire(hole('a40'), hole('a30'))).toBeNull();
    st().moveWireEnd(id!, 'b', { x: 40, y: -15 });
    expect(st().doc.wires.find((w) => w.id === id)!.b).toEqual(hole('a40'));
    st().moveWireEnd(id!, 'b', hole('b45'));
    expect(st().doc.wires.find((w) => w.id === id)!.b).toEqual(hole('b45'));
  });

  test('a part dropped with a lead over the centre channel settles into the holes', () => {
    const doc = ledDoc();
    useCircuit.getState().load(doc);
    const st = useCircuit.getState;
    // move the resistor (row c) down by 3: row c → y 11, the channel
    expect(settleOffset(st().doc, new Set(['r1']), 0, 3)).not.toEqual([0, 0]);
    st().movePartsBy(['r1'], 0, 3);
    for (const q of pinPositions(st().doc.parts.find((p) => p.id === 'r1')!)) expect(isAnchor({ ...st().doc, parts: [], wires: [] }, q)).toBe(true);
  });

  test('deleting the battery removes the jumpers clipped to its terminals', () => {
    useCircuit.getState().load(ledDoc());
    const st = useCircuit.getState;
    const before = st().doc.wires.length;
    st().select({ parts: ['src'] });
    st().deleteSelection();
    expect(st().doc.wires.length).toBe(before - 2);
  });

  test('leads that are not plugged into anything are reported', () => {
    const doc = ledDoc();
    expect(loosePins(doc)).toEqual([]);
    doc.parts.find((p) => p.id === 'r1')!.y = -20; // lifted off the board
    expect(loosePins(doc).length).toBe(2);
  });
});

describe('meter and diagnostics', () => {
  test('moving a probe in the middle of a display interval reads the real voltage, not 0', () => {
    const sim = new Simulator(new NetlistBuilder().V('B', 'a', '0', 9, { r: 0 }).R('R1', 'a', 'b', 1000).R('R2', 'b', '0', 1000).build(), { maxStep: 1e-3 });
    sim.startTransient();
    const avg = new ReadingAverager(
      sim.devices.map((d) => d.id),
      sim.nodeCount,
    );
    const a = sim.nodeIndex('a');
    const b = sim.nodeIndex('b');
    avg.trackPair(a, 0);
    avg.sample(sim);
    sim.advance(0.02, { onStep: (s) => avg.sample(s) });
    expect(avg.pairStats(sim)!.mean).toBeCloseTo(9, 3);
    // probe moves; the interval is not over yet
    avg.trackPair(b, 0);
    expect(avg.pairStats(sim)!.mean).toBeCloseTo(4.5, 3);
    sim.advance(0.03, { onStep: (s) => avg.sample(s) });
    expect(avg.pairStats(sim)!.mean).toBeCloseTo(4.5, 3);
  });

  test('a resistor with both leads in one strip is reported as bypassed', () => {
    const b = new DocBuilder('t');
    addRails(b, { v: 9 });
    b.part('resistor', 'a10', { id: 'r1', rot: 1 }); // vertical a10–e10: both leads in one strip
    const ex = extractNetlist(b.build());
    const ds = analyzeTopology(ex.netlist);
    expect(ds.some((d) => d.code === 'bypassed' && d.partId === 'r1')).toBe(true);
  });
});
