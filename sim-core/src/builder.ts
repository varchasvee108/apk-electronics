import type { ElementSpec, Netlist, Params } from './types';

const GROUND_NAMES = new Set(['0', 'gnd', 'GND']);

/** Convenience builder for netlists with named nodes ("0" / "gnd" is ground). */
export class NetlistBuilder {
  private names: string[] = ['0'];
  private index = new Map<string, number>([['0', 0]]);
  private elements: ElementSpec[] = [];

  node(name: string): number {
    if (GROUND_NAMES.has(name)) return 0;
    let i = this.index.get(name);
    if (i === undefined) {
      i = this.names.length;
      this.names.push(name);
      this.index.set(name, i);
    }
    return i;
  }

  add(type: string, id: string, nodes: string[], params: Params = {}, partId?: string): this {
    this.elements.push({ id, type, nodes: nodes.map((n) => this.node(n)), params, partId });
    return this;
  }

  R(id: string, a: string, b: string, r: number): this {
    return this.add('R', id, [a, b], { r });
  }
  C(id: string, a: string, b: string, c: number, extra: Params = {}): this {
    return this.add('C', id, [a, b], { c, ...extra });
  }
  L(id: string, a: string, b: string, l: number): this {
    return this.add('L', id, [a, b], { l });
  }
  V(id: string, p: string, n: string, v: number, extra: Params = {}): this {
    return this.add('V', id, [p, n], { v, ...extra });
  }

  build(): Netlist {
    return { nodeNames: this.names.slice(), elements: this.elements.slice() };
  }
}
