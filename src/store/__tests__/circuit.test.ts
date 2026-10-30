import { Simulator } from '@sim/simulator';
import { hole } from '@/model/breadboard';
import { LESSONS } from '@/model/lessons';
import { extractNetlist } from '@/model/netlist';
import { pinPositions } from '@/model/parts';
import { useCircuit } from '../circuit';

jest.mock('../db', () => ({ saveCircuit: jest.fn() }));

const st = () => useCircuit.getState();

describe('circuit store editing', () => {
  test('rotating twice turns a diode around in place (diode lesson is solvable)', () => {
    const lesson = LESSONS.find((l) => l.id === 'diode-direction')!;
    st().load(lesson.build());
    const before = pinPositions(st().doc.parts.find((p) => p.id === 'd1')!).map(({ x, y }) => ({ x, y }));
    st().select({ parts: ['d1'] });
    st().rotateSelection();
    st().rotateSelection();
    const after = pinPositions(st().doc.parts.find((p) => p.id === 'd1')!).map(({ x, y }) => ({ x, y }));
    expect(after).toEqual([before[1], before[0]]);
    const sim = new Simulator(extractNetlist(st().doc).netlist);
    expect(sim.dcOp()).toBe(true);
    expect(sim.read('d1').i).toBeGreaterThan(0.0075);
    // undo restores the original orientation in two steps
    st().undo();
    st().undo();
    expect(pinPositions(st().doc.parts.find((p) => p.id === 'd1')!).map(({ x, y }) => ({ x, y }))).toEqual(before);
  });

  test('a quarter turn keeps a resistor centred on the grid', () => {
    st().load({ schema: 1, id: 't', name: 't', board: 'breadboard', parts: [{ id: 'r', type: 'resistor', x: 11, y: 8, rot: 0, props: { r: 1000 } }], wires: [], probes: {}, createdAt: 0, updatedAt: 0 });
    st().select({ parts: ['r'] });
    st().rotateSelection();
    const pins = pinPositions(st().doc.parts[0]);
    expect(pins.map((p) => p.x)).toEqual([13, 13]);
    expect(pins.map((p) => p.y)).toEqual([6, 10]);
  });

  test('moving a battery drags its wires along; breadboard jumpers stay plugged in', () => {
    const lesson = LESSONS.find((l) => l.id === 'first-circuit')!;
    st().load(lesson.build());
    const wiresBefore = st().doc.wires.map((w) => ({ ...w }));
    st().movePartsBy(['src'], 6, -2);
    const bat = st().doc.parts.find((p) => p.id === 'src')!;
    const [plus, minus] = pinPositions(bat);
    const ends = st().doc.wires.flatMap((w) => [w.a, w.b]);
    expect(ends).toContainEqual({ x: plus.x, y: plus.y });
    expect(ends).toContainEqual({ x: minus.x, y: minus.y });
    // the rail-split jumper wasn't attached to the battery and must not move
    const jumper = wiresBefore.find((w) => w.a.x === 32 && w.a.y === 2)!;
    expect(st().doc.wires.find((w) => w.id === jumper.id)).toEqual(jumper);
  });

  test('momentary button presses do not create undo steps', () => {
    const lesson = LESSONS.find((l) => l.id === 'bjt-switch')!;
    st().load(lesson.build());
    st().setProp('sw1', 'pressed', true, 'live');
    st().setProp('sw1', 'pressed', false, 'live');
    expect(st().past.length).toBe(0);
    expect(st().dirty).toBe(false);
  });

  test('a hole in an occupied strip resolves to that strip’s net', () => {
    const lesson = LESSONS.find((l) => l.id === 'first-circuit')!;
    const ex = extractNetlist(lesson.build());
    const { nodeAt } = jest.requireActual('@/model/netlist') as typeof import('@/model/netlist');
    // resistor lead is in c10; e10 is empty but in the same strip
    expect(nodeAt(ex, hole('e10'))).toBe(nodeAt(ex, hole('c10')));
    expect(nodeAt(ex, hole('e10'))).not.toBeUndefined();
  });
});
