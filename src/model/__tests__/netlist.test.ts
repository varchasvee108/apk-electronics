import { Simulator } from '@sim/simulator';
import { colX, hole, railHole } from '../breadboard';
import { DocBuilder, WIRE } from '../build';
import { extractNetlist } from '../netlist';
import { PART_LIST, pinPositions } from '../parts';

/** Battery on the rails, resistor from + rail into column 10, LED from column 14 to the − rail. */
function ledCircuit(r = 330) {
  const b = new DocBuilder('LED');
  b.part('battery', { x: 6, y: -6 }, { props: { v: 9 }, id: 'bat' });
  b.wire({ x: 6, y: -6 }, railHole('top', '+', 0), WIRE.red);
  b.wire({ x: 9, y: -6 }, railHole('top', '-', 0), WIRE.black);
  b.part('ground', railHole('top', '-', 2), { id: 'gnd' });
  b.part('resistor', 'c10', { props: { r }, id: 'r1' });
  b.wire(railHole('top', '+', 3), 'a10', WIRE.red);
  b.part('led', 'd14', { id: 'd1' }); // anode shares column 14 with the resistor
  b.wire('a15', railHole('top', '-', 6), WIRE.black);
  return b.build();
}

describe('breadboard netlist extraction', () => {
  test('5-hole strips connect vertically, not across the channel or sideways', () => {
    const b = new DocBuilder('strips');
    b.part('resistor', 'a1', { id: 'r1' }); // a1–a5
    b.part('resistor', 'e5', { id: 'r2' }); // e5–e9: shares column 5 (a–e) with r1
    b.part('resistor', 'f9', { id: 'r3' }); // other side of the channel from r2's right lead
    const ex = extractNetlist(b.build());
    const [r1a, r1b] = ex.partPins.get('r1') ?? [];
    const [r2a, r2b] = ex.partPins.get('r2') ?? [];
    const [r3a] = ex.partPins.get('r3') ?? [];
    expect(r1b).toBe(r2a);
    expect(r1a).not.toBe(r1b);
    expect(r2b).not.toBe(r3a);
  });

  test('power rails are split in the middle', () => {
    const b = new DocBuilder('rails');
    b.part('resistor', railHole('top', '+', 0), { id: 'left' });
    b.part('resistor', railHole('top', '+', 45), { id: 'right' });
    const ex = extractNetlist(b.build());
    expect(ex.partPins.get('left')?.[0]).not.toBe(ex.partPins.get('right')?.[0]);
    b.wire(railHole('top', '+', 24), railHole('top', '+', 25), WIRE.red);
    const ex2 = extractNetlist(b.build());
    expect(ex2.partPins.get('left')?.[0]).toBe(ex2.partPins.get('right')?.[0]);
  });

  test('DIP chips straddle the channel with each pin on its own strip', () => {
    const b = new DocBuilder('dip');
    b.part('ne555', { x: colX(20), y: hole('e20').y }, { id: 'u1' });
    const pins = pinPositions(b.doc.parts[0]).map(({ x, y }) => ({ x, y }));
    expect(pins[0]).toEqual(hole('f20')); // pin 1 bottom-left
    expect(pins[7]).toEqual(hole('e20')); // pin 8 top-left
    const nodes = extractNetlist(b.build()).partPins.get('u1') ?? [];
    expect(new Set(nodes).size).toBe(8);
  });

  test('LED circuit on the breadboard solves end to end', () => {
    const ex = extractNetlist(ledCircuit());
    expect(ex.errors).toEqual([]);
    const sim = new Simulator(ex.netlist);
    expect(sim.topology.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(sim.dcOp()).toBe(true);
    const i = sim.read('d1').i;
    // (9 V − ~1.85 V) / (330 Ω + 1.7 Ω internal) ≈ 21 mA
    expect(i).toBeGreaterThan(0.019);
    expect(i).toBeLessThan(0.023);
  });

  test('every part type expands without errors at its default props', () => {
    const b = new DocBuilder('all', 'none');
    PART_LIST.forEach((d, k) => b.part(d.type, { x: (k % 6) * 40, y: Math.floor(k / 6) * 40 }));
    const ex = extractNetlist(b.build());
    expect(ex.errors).toEqual([]);
    expect(() => new Simulator(ex.netlist)).not.toThrow();
  });
});
