import { EXAMPLES } from '@/model/examples';
import { extractNetlist } from '@/model/netlist';
import { parseCircuit, serializeCircuit } from '../circuitFile';

describe('circuit files', () => {
  test('every example survives export → import with an identical netlist', () => {
    for (const e of EXAMPLES) {
      const doc = e.build();
      const back = parseCircuit(serializeCircuit(doc));
      expect(back.id).not.toBe(doc.id); // imported copies get a fresh id
      expect(back.parts).toEqual(doc.parts);
      expect(extractNetlist(back).netlist).toEqual(extractNetlist(doc).netlist);
    }
  });

  test('rejects files that are not Bench circuits, with a readable reason', () => {
    expect(() => parseCircuit('not json')).toThrow('not valid JSON');
    expect(() => parseCircuit('{"hello":1}')).toThrow('not a Bench circuit');
    expect(() => parseCircuit(JSON.stringify({ schema: 1, parts: [{ type: 'flux-capacitor', x: 0, y: 0 }], wires: [] }))).toThrow();
  });

  test('fills in missing props and fixes a bad rotation', () => {
    const doc = parseCircuit(JSON.stringify({ schema: 1, name: 'x', parts: [{ id: 'r', type: 'resistor', x: 1, y: 1, rot: 7 }], wires: [] }));
    expect(doc.parts[0].rot).toBe(0);
    expect(doc.parts[0].props.r).toBe(1000);
  });
});
