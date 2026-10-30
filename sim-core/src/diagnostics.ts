import { CHIPS } from './digital/chips';
import type { Simulator } from './simulator';
import type { Diagnostic, ElementSpec, Netlist } from './types';

/** Groups of an element's nodes that are joined by a DC path (used for floating-node detection). */
function dcGroups(e: ElementSpec): number[][] {
  const n = e.nodes;
  switch (e.type) {
    case 'C':
    case 'I':
      return [];
    case 'sw':
      return e.params.closed ? [n] : [];
    case 'xfmr':
      return [
        [n[0], n[1]],
        [n[2], n[3]],
      ];
    case 'M':
      return [[n[0], n[2]]];
    case 'opamp':
      // inputs are high impedance; output is driven relative to ground; supplies pair up
      return [
        [n[2], n[3]],
        [n[4], 0],
      ];
    case '555':
      return [[n[0], n[2], n[3], n[4], n[6], n[7]]];
    case 'logic': {
      const roles = CHIPS[String(e.params.chip)]?.pins.map((p) => p.role) ?? [];
      const g = n.filter((_, i) => roles[i] && roles[i] !== 'in' && roles[i] !== 'nc');
      return [g];
    }
    case 'relay':
      return [
        [n[0], n[1]],
        [n[2], n[3], n[4]],
      ];
    default:
      return [n];
  }
}

/** Pins that are high-impedance inputs (for friendlier floating messages). */
function inputPins(e: ElementSpec): number[] {
  if (e.type === 'opamp') return [e.nodes[0], e.nodes[1]];
  if (e.type === '555') return [e.nodes[1], e.nodes[5]];
  if (e.type === 'M') return [e.nodes[1]];
  if (e.type === 'logic') {
    const roles = CHIPS[String(e.params.chip)]?.pins.map((p) => p.role) ?? [];
    return e.nodes.filter((_, i) => roles[i] === 'in');
  }
  return [];
}

function label(e: ElementSpec): string {
  return e.label ?? e.partId ?? e.id;
}

class UF {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(a: number): number {
    while (this.p[a] !== a) {
      this.p[a] = this.p[this.p[a]];
      a = this.p[a];
    }
    return a;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.p[ra] = rb;
    return true;
  }
}

export function analyzeTopology(netlist: Netlist): Diagnostic[] {
  const out: Diagnostic[] = [];
  const N = netlist.nodeNames.length;
  const name = (i: number) => netlist.nodeNames[i] ?? `node ${i}`;
  const els = netlist.elements;
  if (els.length === 0) return out;

  // ---------- ground reference
  const touchesGround = els.some((e) => e.nodes.includes(0));
  if (!touchesGround) {
    const src = els.find((e) => e.type === 'V' || e.type === 'supply');
    out.push({
      severity: 'warning',
      code: 'no-ground',
      title: 'No ground reference',
      message: src
        ? `Nothing is connected to ground, so voltages have no reference point. Bench is measuring relative to the − terminal of ${label(src)}. Add a Ground symbol to make this explicit.`
        : 'Nothing is connected to ground, so voltages have no reference point. Add a Ground symbol (or connect the − of your supply to the ground rail).',
      node: src ? src.nodes[1] : undefined,
    });
  }

  // ---------- shorted sources and ideal source loops
  const uf = new UF(N);
  for (const e of els) {
    const isSrc = e.type === 'V' || e.type === 'supply';
    if (isSrc && e.nodes[0] === e.nodes[1]) {
      out.push({
        severity: 'error',
        code: 'shorted-source',
        title: `${label(e)} is short-circuited`,
        message: `Both terminals of ${label(e)} are connected to the same point (${name(e.nodes[0])}). A short circuit across a source draws a huge current. Remove the wire or part that joins + to −.`,
        elementId: e.id,
        partId: e.partId,
      });
      continue;
    }
    const ideal = (isSrc && !(Number(e.params.r) > 0)) || e.type === 'L';
    if (ideal) {
      if (!uf.union(e.nodes[0], e.nodes[1])) {
        out.push({
          severity: 'error',
          code: 'source-loop',
          title: 'Voltage sources fight each other',
          message: `${label(e)} forms a loop with other ideal voltage sources${e.type === 'L' ? ' (an inductor is a short circuit at DC)' : ''}. Two ideal sources in parallel cannot agree on one voltage. Add a resistor or remove one.`,
          elementId: e.id,
          partId: e.partId,
        });
      }
    }
  }

  // ---------- DC path to ground (floating nodes)
  const used = new Array(N).fill(0);
  for (const e of els) for (const nd of e.nodes) used[nd]++;
  const dc = new UF(N);
  for (const e of els) {
    for (const g of dcGroups(e)) for (let i = 1; i < g.length; i++) dc.union(g[0], g[i]);
  }
  // with no explicit ground, the auto-ground node acts as reference
  const ref = touchesGround ? 0 : (out.find((d) => d.code === 'no-ground')?.node ?? 0);
  const inputs = new Set<number>();
  for (const e of els) for (const p of inputPins(e)) inputs.add(p);
  const reported = new Set<number>();
  for (let i = 1; i < N; i++) {
    if (!used[i] || dc.find(i) === dc.find(ref)) continue;
    reported.add(i);
    out.push(
      inputs.has(i)
        ? {
            severity: 'warning',
            code: 'floating-input',
            title: `Floating input at ${name(i)}`,
            message: `${name(i)} is connected to a high-impedance input but has no path to a supply or ground, so its level is undefined (it picks up noise in a real circuit). Tie it high or low, or add a pull-up / pull-down resistor.`,
            node: i,
          }
        : {
            severity: 'warning',
            code: 'floating-node',
            title: `Floating node ${name(i)}`,
            message: `${name(i)} has no DC path to ground: it only connects through capacitors, open switches or inputs. Its voltage is undefined; the simulator holds it near 0 V.`,
            node: i,
          },
    );
  }

  // ---------- dangling pins
  for (const e of els) {
    e.nodes.forEach((nd, k) => {
      if (nd === 0 || used[nd] !== 1 || reported.has(nd)) return;
      if (e.type === 'logic' || e.type === 'avr' || e.type === '555' || e.type === 'relay') return;
      out.push({
        severity: 'info',
        code: 'dangling-pin',
        title: `${label(e)} pin ${k + 1} is not connected`,
        message: `One lead of ${label(e)} (${name(nd)}) is not connected to anything else, so no current can flow through it.`,
        elementId: e.id,
        partId: e.partId,
        node: nd,
      });
    });
  }
  return out;
}

export function explainSingular(sim: Simulator, idx: number): Diagnostic {
  const nn = sim.nodeCount - 1;
  if (idx >= 0 && idx < nn) {
    const nm = sim.netlist.nodeNames[idx + 1];
    return {
      severity: 'error',
      code: 'singular',
      title: 'The circuit has no unique solution',
      message: `The voltage at ${nm} cannot be determined. It is probably isolated (connected only through capacitors, current sources or inputs), or a loop of ideal sources fixes it twice.`,
      node: idx + 1,
    };
  }
  const owner = sim.devices.find((d) => d.br0 >= 0 && idx >= d.br0 && idx < d.br0 + d.branches);
  if (owner) {
    const lbl = owner.partId ?? owner.id;
    const what =
      owner.type === 'L'
        ? `Inductor ${lbl} is a short circuit at DC and closes a loop with a voltage source or another inductor.`
        : `${lbl} is in parallel with another ideal voltage source, a wire, or is shorted. Ideal sources in parallel cannot both set the voltage.`;
    return { severity: 'error', code: 'singular', title: 'Conflicting voltage sources', message: what, elementId: owner.id, partId: owner.partId };
  }
  return {
    severity: 'error',
    code: 'singular',
    title: 'The circuit has no unique solution',
    message: 'The equations for this circuit are inconsistent (a singular matrix). Look for shorted sources or parts that are not connected to the rest of the circuit.',
  };
}
