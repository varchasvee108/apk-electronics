import { assemble } from '../src/avr/assembler';
import { STARTER_PROGRAMS } from '../src/avr/programs';

test.each(STARTER_PROGRAMS.map((p) => [p.id, p.asm]))('%s assembles', (_id, asm) => {
  const r = assemble(asm);
  expect(r.errors).toEqual([]);
  expect(r.ok).toBe(true);
});
