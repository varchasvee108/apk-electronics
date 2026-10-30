import { assemble } from '../src/avr/assembler';
import { parseIntelHex } from '../src/avr/intelhex';
import { STARTER_PROGRAMS } from '../src/avr/programs';
import { NetlistBuilder } from '../src/builder';
import { led } from '../src/models';
import { frequency, risingCrossings } from '../src/measure';
import { Simulator } from '../src/simulator';
import { UNO_PINS } from '../src/avr/arduino';

function program(id: string): string {
  const p = STARTER_PROGRAMS.find((x) => x.id === id);
  if (!p) throw new Error(id);
  const r = assemble(p.asm);
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.line}: ${e.message}`).join('\n'));
  return r.hex;
}

/** Uno with every pin on its own named node, plus extra wiring. */
function uno(hex: string, wire: (b: NetlistBuilder) => void): Simulator {
  const b = new NetlistBuilder();
  const nodes = UNO_PINS.map((p) => (p === 'GND' ? '0' : p));
  b.add('avr', 'U1', nodes, { hex });
  wire(b);
  return new Simulator(b.build());
}

describe('AVR assembler', () => {
  test('encodes known instructions', () => {
    const r = assemble(`
      ldi r16, 0xFF
      out DDRB, r16
      sbi PORTB, 5
      rjmp 0
      nop
      ret
      add r1, r31
      lds r24, 0x78
      brne -1
    `);
    expect(r.ok).toBe(true);
    expect(Array.from(r.words)).toEqual([0xef0f, 0xb904, 0x9a2d, 0xcffc, 0x0000, 0x9508, 0x0e1f, 0x9180, 0x0078, 0xf7a9]);
  });

  test('reports errors with line numbers', () => {
    const r = assemble('ldi r5, 1\nfoo r1\nrjmp nowhere');
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  test('every starter program assembles and round-trips through Intel HEX', () => {
    for (const p of STARTER_PROGRAMS) {
      const r = assemble(p.asm);
      expect(r.errors).toEqual([]);
      const flash = parseIntelHex(r.hex);
      for (let i = 0; i < r.words.length; i++) expect(flash[2 * i] | (flash[2 * i + 1] << 8)).toBe(r.words[i]);
    }
  });
});

describe('Arduino Uno co-simulation (avr8js)', () => {
  test('Blink toggles pin 13 at 1 Hz and lights an LED', () => {
    const sim = uno(program('blink'), (b) => b.R('R1', 'D13', 'a', 220).add('D', 'D1', ['a', '0'], led('red')));
    const w = sim.transient(2.2, { d13: (s) => s.v('D13') }, { maxStep: 1e-3 });
    const edges = risingCrossings(w.t, w.d13, 2.5);
    expect(edges.length).toBe(2);
    expect(Math.abs(edges[1] - edges[0] - 1.0)).toBeLessThan(1e-3);
    expect(Math.abs(edges[0] - 0.5)).toBeLessThan(2e-3);
  });

  test('Button: pressing the switch on D2 lights D13', () => {
    const mk = (closed: boolean) => {
      const sim = uno(program('button'), (b) => b.add('sw', 'S1', ['D2', '0'], { closed }));
      sim.transient(0.01, {}, { maxStep: 1e-4 });
      return sim.v('D13');
    };
    expect(mk(false)).toBeLessThan(0.1);
    expect(mk(true)).toBeGreaterThan(4.9);
  });

  test('Fade: pin 9 carries ~977 Hz PWM', () => {
    const sim = uno(program('fade'), (b) => b.R('R1', 'D9', '0', 1e3));
    const w = sim.transient(0.5, { d9: (s) => s.v('D9') }, { maxStep: 1e-4 });
    const f = frequency(w.t, w.d9, 2.5, 0.2);
    expect(Math.abs(f - 16e6 / 64 / 256)).toBeLessThan(5);
  });

  test('Analog Read Serial prints the A0 voltage as 0–1023', () => {
    const sim = uno(program('analog-read'), (b) => b.R('RA', '5V', 'A0', 10e3).R('RB', 'A0', '0', 10e3));
    sim.transient(0.25, {}, { maxStep: 5e-4 });
    const avr = sim.device('U1') as unknown as { rt: { serial: string } };
    const lines = avr.rt.serial.split('\r\n').filter((l) => l.length);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const v = Number(lines[0]);
    expect(Math.abs(v - 511)).toBeLessThanOrEqual(3);
  });

  test('Serial greeting is transmitted', () => {
    const sim = uno(program('serial-echo'), () => undefined);
    sim.transient(0.06, {}, { maxStep: 5e-4 });
    const avr = sim.device('U1') as unknown as { rt: { serial: string } };
    expect(avr.rt.serial).toContain('Hello from Bench!');
  });
});
