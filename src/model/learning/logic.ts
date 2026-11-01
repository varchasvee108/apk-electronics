export type LogicGate = 'and' | 'nand' | 'or' | 'nor' | 'xor' | 'xnor' | 'not';
export const GATE_INFO: Record<LogicGate, { title: string; equation: string; why: string }> = {
  and: { title: 'AND', equation: 'Y = A AND B', why: 'Both inputs must be high.' },
  nand: { title: 'NAND', equation: 'Y = NOT(A AND B)', why: 'Low only when both inputs are high.' },
  or: { title: 'OR', equation: 'Y = A OR B', why: 'High when at least one input is high.' },
  nor: { title: 'NOR', equation: 'Y = NOT(A OR B)', why: 'High only when both inputs are low.' },
  xor: { title: 'XOR', equation: 'Y = A XOR B', why: 'High when the inputs differ.' },
  xnor: { title: 'XNOR', equation: 'Y = NOT(A XOR B)', why: 'High when the inputs match.' },
  not: { title: 'NOT', equation: 'Y = NOT A', why: 'Inverts its single input.' },
};
export function logicOutput(gate: LogicGate, a: boolean, b: boolean): boolean {
  switch (gate) {
    case 'and':
      return a && b;
    case 'nand':
      return !(a && b);
    case 'or':
      return a || b;
    case 'nor':
      return !(a || b);
    case 'xor':
      return a !== b;
    case 'xnor':
      return a === b;
    case 'not':
      return !a;
  }
}
export function truthRows(gate: LogicGate) {
  return (
    gate === 'not'
      ? [
          [false, false],
          [true, false],
        ]
      : [
          [false, false],
          [false, true],
          [true, false],
          [true, true],
        ]
  ).map(([a, b]) => ({ a, b, y: logicOutput(gate, a, b) }));
}
