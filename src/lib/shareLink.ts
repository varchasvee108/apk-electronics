import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { assemble } from '@sim/avr/assembler';
import { STARTER_PROGRAMS } from '@sim/avr/programs';
import type { CircuitDoc } from '@/model/types';
import { parseCircuit, serializeCircuit } from './circuitFile';

/**
 * Circuits travel as links: bench://open?c=<compressed JSON>. Built-in Arduino programs are sent by
 * name and re-assembled on arrival, which keeps the link small enough for a QR code.
 */

/** Largest payload that still fits a scannable QR code (version 40, low error correction ≈ 2.9 kB). */
export const QR_LIMIT = 2800;

function slim(doc: CircuitDoc): unknown {
  return {
    schema: 1,
    name: doc.name,
    board: doc.board,
    parts: doc.parts.map((p) => {
      const props = { ...p.props };
      if (p.type === 'arduino' && STARTER_PROGRAMS.some((s) => s.id === props.program)) {
        delete props.hex;
        delete props.source;
      }
      return { id: p.id, type: p.type, x: p.x, y: p.y, rot: p.rot, props, ...(p.label ? { label: p.label } : {}) };
    }),
    wires: doc.wires.map((w) => ({ id: w.id, a: w.a, b: w.b, color: w.color, ...(w.via ? { via: w.via } : {}) })),
    probes: doc.probes,
  };
}

/** The compressed circuit (URL-safe). */
export function encodeCircuit(doc: CircuitDoc): string {
  return compressToEncodedURIComponent(JSON.stringify(slim(doc)));
}

/** Rebuild a circuit from a link payload. Throws with a readable message. */
export function decodeCircuit(payload: string): CircuitDoc {
  const json = decompressFromEncodedURIComponent(payload);
  if (!json) throw new Error('This link does not contain a Bench circuit (it may have been cut short).');
  const doc = parseCircuit(json);
  for (const p of doc.parts) {
    if (p.type !== 'arduino' || p.props.hex) continue;
    const prog = STARTER_PROGRAMS.find((s) => s.id === p.props.program);
    if (prog) p.props = { ...p.props, source: prog.asm, hex: assemble(prog.asm).hex };
  }
  return doc;
}

/** Link that opens the circuit in the app. */
export function circuitLink(doc: CircuitDoc, base = 'bench://'): string {
  return `${base.replace(/\/?$/, '/')}open?c=${encodeCircuit(doc)}`;
}

export { serializeCircuit };
