/**
 * A small two-pass AVR assembler (ATmega328P subset, AVRASM-like syntax) so programs can be built on
 * the device without a C compiler. Supports labels, .equ/.def/.org/.db/.dw, expressions with
 * low()/high()/lo8()/hi8(), character literals, and the instructions used by typical beginner code.
 */
import { toIntelHex } from './intelhex';

export interface AsmError {
  line: number;
  message: string;
}

export interface AsmResult {
  ok: boolean;
  errors: AsmError[];
  words: Uint16Array;
  /** Program size in bytes. */
  size: number;
  hex: string;
  labels: Record<string, number>;
}

/** ATmega328P register and bit names (I/O addresses for IN/OUT/SBI, data addresses for LDS/STS). */
export const M328P_SYMBOLS: Record<string, number> = {
  // I/O space (0x00–0x3F)
  PINB: 0x03, DDRB: 0x04, PORTB: 0x05, PINC: 0x06, DDRC: 0x07, PORTC: 0x08, PIND: 0x09, DDRD: 0x0a, PORTD: 0x0b,
  TIFR0: 0x15, TIFR1: 0x16, TIFR2: 0x17, EIFR: 0x1c, EIMSK: 0x1d, GPIOR0: 0x1e,
  TCCR0A: 0x24, TCCR0B: 0x25, TCNT0: 0x26, OCR0A: 0x27, OCR0B: 0x28, SPL: 0x3d, SPH: 0x3e, SREG: 0x3f,
  // memory-mapped (LDS/STS)
  TIMSK0: 0x6e, TIMSK1: 0x6f, TIMSK2: 0x70, ADCL: 0x78, ADCH: 0x79, ADCSRA: 0x7a, ADCSRB: 0x7b, ADMUX: 0x7c, DIDR0: 0x7e,
  TCCR1A: 0x80, TCCR1B: 0x81, TCCR1C: 0x82, TCNT1L: 0x84, TCNT1H: 0x85, ICR1L: 0x86, ICR1H: 0x87,
  OCR1AL: 0x88, OCR1AH: 0x89, OCR1BL: 0x8a, OCR1BH: 0x8b, TCCR2A: 0xb0, TCCR2B: 0xb1, TCNT2: 0xb2, OCR2A: 0xb3, OCR2B: 0xb4,
  UCSR0A: 0xc0, UCSR0B: 0xc1, UCSR0C: 0xc2, UBRR0L: 0xc4, UBRR0H: 0xc5, UDR0: 0xc6,
  RAMEND: 0x08ff,
  // bits
  PB0: 0, PB1: 1, PB2: 2, PB3: 3, PB4: 4, PB5: 5, PB6: 6, PB7: 7,
  PC0: 0, PC1: 1, PC2: 2, PC3: 3, PC4: 4, PC5: 5,
  PD0: 0, PD1: 1, PD2: 2, PD3: 3, PD4: 4, PD5: 5, PD6: 6, PD7: 7,
  TOV0: 0, OCF0A: 1, OCF0B: 2, TOV1: 0, OCF1A: 1, OCF1B: 2, TOV2: 0, OCF2A: 1,
  WGM10: 0, WGM11: 1, COM1B0: 4, COM1B1: 5, COM1A0: 6, COM1A1: 7, CS10: 0, CS11: 1, CS12: 2, WGM12: 3, WGM13: 4,
  WGM00: 0, WGM01: 1, COM0B1: 5, COM0A1: 7, CS00: 0, CS01: 1, CS02: 2, WGM02: 3,
  WGM20: 0, WGM21: 1, COM2B1: 5, COM2A1: 7, CS20: 0, CS21: 1, CS22: 2,
  TOIE0: 0, OCIE0A: 1, TOIE1: 0, OCIE1A: 1,
  ADPS0: 0, ADPS1: 1, ADPS2: 2, ADIE: 3, ADIF: 4, ADATE: 5, ADSC: 6, ADEN: 7, MUX0: 0, ADLAR: 5, REFS0: 6, REFS1: 7,
  RXC0: 7, TXC0: 6, UDRE0: 5, U2X0: 1, RXEN0: 4, TXEN0: 3, RXCIE0: 7, UCSZ00: 1, UCSZ01: 2,
  SREG_C: 0, SREG_Z: 1, SREG_N: 2, SREG_V: 3, SREG_S: 4, SREG_H: 5, SREG_T: 6, SREG_I: 7,
};

const REG_ALIASES: Record<string, number> = { XL: 26, XH: 27, YL: 28, YH: 29, ZL: 30, ZH: 31 };

class AsmFail extends Error {}

// ------------------------------------------------------------------ expressions

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'") {
      let ch = src[i + 1];
      let len = 3;
      if (ch === '\\') {
        const e = src[i + 2];
        ch = e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e === '0' ? '\0' : e;
        len = 4;
      }
      if (src[i + len - 1] !== "'") throw new AsmFail('bad character literal');
      out.push({ k: 'num', v: ch.charCodeAt(0) });
      i += len;
      continue;
    }
    const num = /^(0x[0-9a-f]+|\$[0-9a-f]+|0b[01]+|\d+)/i.exec(src.slice(i));
    if (num) {
      const t = num[1];
      const v = t[0] === '$' ? parseInt(t.slice(1), 16) : t.toLowerCase().startsWith('0b') ? parseInt(t.slice(2), 2) : Number(t);
      out.push({ k: 'num', v });
      i += t.length;
      continue;
    }
    const id = /^[A-Za-z_.][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (id) {
      out.push({ k: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const op2 = src.slice(i, i + 2);
    if (op2 === '<<' || op2 === '>>') {
      out.push({ k: 'op', v: op2 });
      i += 2;
      continue;
    }
    if ('+-*/()|&^~!%'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new AsmFail(`unexpected character "${c}"`);
  }
  return out;
}

function evaluate(src: string, lookup: (name: string) => number | undefined): number {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === 'op' && peek()?.v === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new AsmFail(`expected "${v}"`);
    p++;
  };
  const levels: string[][] = [['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  const bin = (lvl: number): number => {
    if (lvl === levels.length) return unary();
    let v = bin(lvl + 1);
    for (;;) {
      const t = peek();
      if (t?.k === 'op' && levels[lvl].includes(t.v)) {
        p++;
        const r = bin(lvl + 1);
        switch (t.v) {
          case '|': v = v | r; break;
          case '^': v = v ^ r; break;
          case '&': v = v & r; break;
          case '<<': v = v << r; break;
          case '>>': v = v >> r; break;
          case '+': v = v + r; break;
          case '-': v = v - r; break;
          case '*': v = v * r; break;
          case '/': v = Math.trunc(v / r); break;
          case '%': v = v % r; break;
        }
      } else return v;
    }
  };
  const unary = (): number => {
    if (isOp('-')) { p++; return -unary(); }
    if (isOp('~')) { p++; return ~unary(); }
    if (isOp('!')) { p++; return unary() ? 0 : 1; }
    return primary();
  };
  const primary = (): number => {
    const t = peek();
    if (!t) throw new AsmFail('expression ended unexpectedly');
    if (t.k === 'num') { p++; return t.v; }
    if (t.k === 'op' && t.v === '(') { p++; const v = bin(0); expectOp(')'); return v; }
    if (t.k === 'id') {
      p++;
      const fn = t.v.toLowerCase();
      if (isOp('(') && ['low', 'high', 'lo8', 'hi8', 'byte1', 'byte2', 'byte3', 'pm'].includes(fn)) {
        p++;
        const v = bin(0);
        expectOp(')');
        if (fn === 'low' || fn === 'lo8' || fn === 'byte1') return v & 0xff;
        if (fn === 'high' || fn === 'hi8' || fn === 'byte2') return (v >> 8) & 0xff;
        if (fn === 'byte3') return (v >> 16) & 0xff;
        return v;
      }
      const v = lookup(t.v);
      if (v === undefined) throw new AsmFail(`unknown symbol "${t.v}"`);
      return v;
    }
    throw new AsmFail(`unexpected "${t.v}"`);
  };
  const v = bin(0);
  if (p !== toks.length) throw new AsmFail('unexpected text after expression');
  return v;
}

// ------------------------------------------------------------------ operands

function splitOperands(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let inChar = false;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && !inChar) inStr = !inStr;
    if (c === "'" && !inStr) inChar = !inChar;
    if (!inChar && !inStr) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function stripComment(line: string): string {
  let inChar = false;
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inChar) inStr = !inStr;
    else if (c === "'" && !inStr) inChar = !inChar;
    else if (!inChar && !inStr && (c === ';' || (c === '/' && line[i + 1] === '/'))) return line.slice(0, i);
  }
  return line;
}

const TWO_REG: Record<string, number> = {
  add: 0x0c00, adc: 0x1c00, sub: 0x1800, sbc: 0x0800, and: 0x2000, or: 0x2800, eor: 0x2400, mov: 0x2c00,
  cp: 0x1400, cpc: 0x0400, cpse: 0x1000, mul: 0x9c00,
};
const IMM: Record<string, number> = { cpi: 0x3000, sbci: 0x4000, subi: 0x5000, ori: 0x6000, sbr: 0x6000, andi: 0x7000, ldi: 0xe000 };
const ONE_REG: Record<string, number> = { com: 0, neg: 1, swap: 2, inc: 3, asr: 5, lsr: 6, ror: 7, dec: 10 };
const NO_OP: Record<string, number> = {
  nop: 0x0000, ret: 0x9508, reti: 0x9518, sei: 0x9478, cli: 0x94f8, sleep: 0x9588, wdr: 0x95a8, ijmp: 0x9409, icall: 0x9509,
  sec: 0x9408, clc: 0x9488, sez: 0x9418, clz: 0x9498, set: 0x9468, clt: 0x94e8,
};
const BRANCH: Record<string, [boolean, number]> = {
  breq: [true, 1], brne: [false, 1], brcs: [true, 0], brlo: [true, 0], brcc: [false, 0], brsh: [false, 0],
  brmi: [true, 2], brpl: [false, 2], brvs: [true, 3], brvc: [false, 3], brlt: [true, 4], brge: [false, 4],
  brhs: [true, 5], brhc: [false, 5], brts: [true, 6], brtc: [false, 6], brie: [true, 7], brid: [false, 7],
};
const BIT_IO: Record<string, number> = { cbi: 0x9800, sbic: 0x9900, sbi: 0x9a00, sbis: 0x9b00 };
const BIT_REG: Record<string, number> = { bld: 0xf800, bst: 0xfa00, sbrc: 0xfc00, sbrs: 0xfe00 };

function instrSize(mn: string): number {
  return mn === 'jmp' || mn === 'call' || mn === 'lds' || mn === 'sts' ? 2 : 1;
}

// ------------------------------------------------------------------ assembler

export function assemble(source: string): AsmResult {
  const errors: AsmError[] = [];
  const lines = source.split(/\r?\n/);
  const labels: Record<string, number> = {};
  const equs: Record<string, number> = {};
  const defs: Record<string, number> = { ...REG_ALIASES };

  const lookup = (name: string): number | undefined => {
    if (name in equs) return equs[name];
    if (name in labels) return labels[name];
    if (name in M328P_SYMBOLS) return M328P_SYMBOLS[name];
    const up = name.toUpperCase();
    if (up in M328P_SYMBOLS) return M328P_SYMBOLS[up];
    return undefined;
  };

  type Parsed = { line: number; label?: string; mn?: string; ops: string[]; raw: string };
  const parsed: Parsed[] = lines.map((raw, i) => {
    let text = stripComment(raw).trim();
    const res: Parsed = { line: i + 1, ops: [], raw: text };
    const lm = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(text);
    if (lm) {
      res.label = lm[1];
      text = text.slice(lm[0].length).trim();
    }
    if (text) {
      const sp = text.search(/\s/);
      res.mn = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
      res.ops = sp < 0 ? [] : splitOperands(text.slice(sp + 1));
    }
    return res;
  });

  const dbBytes = (ops: string[], look: typeof lookup): number[] => {
    const bytes: number[] = [];
    for (const op of ops) {
      if (op.startsWith('"')) {
        const body = op.slice(1, op.lastIndexOf('"'));
        for (let k = 0; k < body.length; k++) {
          let ch = body[k];
          if (ch === '\\') {
            const e = body[++k];
            ch = e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e === '0' ? '\0' : e;
          }
          bytes.push(ch.charCodeAt(0) & 0xff);
        }
      } else bytes.push(evaluate(op, look) & 0xff);
    }
    return bytes;
  };

  // pass 1: addresses
  let pc = 0;
  for (const p of parsed) {
    try {
      if (p.label) {
        if (p.label in labels) throw new AsmFail(`label "${p.label}" defined twice`);
        labels[p.label] = pc;
      }
      if (!p.mn) continue;
      if (p.mn === '.equ' || p.mn === '.set') {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(p.raw.replace(/^\.(equ|set)\s+/i, ''));
        if (!m) throw new AsmFail('expected .equ NAME = value');
        equs[m[1]] = evaluate(m[2], lookup);
      } else if (p.mn === '.def') {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[rR](\d+)$/.exec(p.raw.replace(/^\.def\s+/i, ''));
        if (!m) throw new AsmFail('expected .def name = rN');
        defs[m[1]] = Number(m[2]);
        defs[m[1].toUpperCase()] = Number(m[2]);
      } else if (p.mn === '.org') {
        pc = evaluate(p.ops.join(','), lookup);
        if (p.label) labels[p.label] = pc;
      } else if (p.mn === '.db') {
        pc += Math.ceil(dbBytes(p.ops, () => 0).length / 2);
      } else if (p.mn === '.dw') {
        pc += p.ops.length;
      } else if (p.mn.startsWith('.')) {
        // .device, .include, .cseg … are accepted and ignored
      } else pc += instrSize(p.mn);
    } catch (e) {
      errors.push({ line: p.line, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // pass 2: encode
  const flash = new Uint16Array(0x4000);
  let maxPc = 0;
  pc = 0;
  for (const p of parsed) {
    if (!p.mn) continue;
    const emit = (w: number) => {
      if (pc >= flash.length) throw new AsmFail('program does not fit in 32 KB of flash');
      flash[pc++] = w & 0xffff;
      maxPc = Math.max(maxPc, pc);
    };
    try {
      const mn = p.mn;
      const ops = p.ops;
      const val = (s: string) => evaluate(s, lookup);
      const reg = (s: string, min = 0): number => {
        const t = s.trim();
        let r: number | undefined;
        const m = /^[rR](\d{1,2})$/.exec(t);
        if (m) r = Number(m[1]);
        else if (t in defs) r = defs[t];
        else if (t.toUpperCase() in defs) r = defs[t.toUpperCase()];
        if (r === undefined || r > 31) throw new AsmFail(`"${t}" is not a register`);
        if (r < min) throw new AsmFail(`${mn} needs a register r${min}–r31 (got r${r})`);
        return r;
      };
      const need = (n: number) => {
        if (ops.length !== n) throw new AsmFail(`${mn} expects ${n} operand${n === 1 ? '' : 's'}`);
      };
      const range = (v: number, lo: number, hi: number, what: string) => {
        if (v < lo || v > hi) throw new AsmFail(`${what} ${v} out of range ${lo}..${hi}`);
        return v;
      };
      const rel = (target: number, bits: number) => {
        const off = target - (pc + 1);
        const lim = 1 << (bits - 1);
        if (off < -lim || off >= lim) throw new AsmFail(`branch target too far (${off} words)`);
        return off & ((1 << bits) - 1);
      };
      if (mn === '.equ' || mn === '.set' || mn === '.def') continue;
      if (mn === '.org') {
        pc = val(ops.join(','));
        continue;
      }
      if (mn === '.db') {
        const bytes = dbBytes(ops, lookup);
        if (bytes.length % 2) bytes.push(0);
        for (let k = 0; k < bytes.length; k += 2) emit(bytes[k] | (bytes[k + 1] << 8));
        continue;
      }
      if (mn === '.dw') {
        for (const o of ops) emit(val(o));
        continue;
      }
      if (mn.startsWith('.')) continue;
      if (mn in TWO_REG) {
        need(2);
        const d = reg(ops[0]);
        const r = reg(ops[1]);
        emit(TWO_REG[mn] | ((r & 0x10) << 5) | (d << 4) | (r & 0x0f));
      } else if (mn === 'clr' || mn === 'tst' || mn === 'lsl' || mn === 'rol') {
        need(1);
        const d = reg(ops[0]);
        const base = mn === 'clr' ? 0x2400 : mn === 'tst' ? 0x2000 : mn === 'lsl' ? 0x0c00 : 0x1c00;
        emit(base | ((d & 0x10) << 5) | (d << 4) | (d & 0x0f));
      } else if (mn in IMM || mn === 'cbr' || mn === 'ser') {
        let d: number;
        let k: number;
        if (mn === 'ser') {
          need(1);
          d = reg(ops[0], 16);
          k = 0xff;
        } else {
          need(2);
          d = reg(ops[0], 16);
          k = val(ops[1]);
          if (mn === 'cbr') k = ~k;
          range(k, -256, 255, 'constant');
          k &= 0xff;
        }
        const base = mn === 'cbr' ? 0x7000 : mn === 'ser' ? 0xe000 : IMM[mn];
        emit(base | ((k & 0xf0) << 4) | ((d - 16) << 4) | (k & 0x0f));
      } else if (mn in ONE_REG) {
        need(1);
        emit(0x9400 | (reg(ops[0]) << 4) | ONE_REG[mn]);
      } else if (mn === 'push' || mn === 'pop') {
        need(1);
        emit((mn === 'push' ? 0x920f : 0x900f) | (reg(ops[0]) << 4));
      } else if (mn in NO_OP) {
        need(0);
        emit(NO_OP[mn]);
      } else if (mn === 'in') {
        need(2);
        const d = reg(ops[0]);
        const a = range(val(ops[1]), 0, 63, 'I/O address');
        emit(0xb000 | ((a & 0x30) << 5) | (d << 4) | (a & 0x0f));
      } else if (mn === 'out') {
        need(2);
        const a = range(val(ops[0]), 0, 63, 'I/O address');
        const r = reg(ops[1]);
        emit(0xb800 | ((a & 0x30) << 5) | (r << 4) | (a & 0x0f));
      } else if (mn in BIT_IO) {
        need(2);
        const a = range(val(ops[0]), 0, 31, 'I/O address (sbi/cbi/sbis/sbic only reach 0–31)');
        const b = range(val(ops[1]), 0, 7, 'bit');
        emit(BIT_IO[mn] | (a << 3) | b);
      } else if (mn in BIT_REG) {
        need(2);
        emit(BIT_REG[mn] | (reg(ops[0]) << 4) | range(val(ops[1]), 0, 7, 'bit'));
      } else if (mn === 'rjmp' || mn === 'rcall') {
        need(1);
        emit((mn === 'rjmp' ? 0xc000 : 0xd000) | rel(val(ops[0]), 12));
      } else if (mn === 'jmp' || mn === 'call') {
        need(1);
        const k = val(ops[0]);
        emit((mn === 'jmp' ? 0x940c : 0x940e) | (((k >> 17) & 0x1f) << 4) | ((k >> 16) & 1));
        emit(k & 0xffff);
      } else if (mn in BRANCH) {
        need(1);
        const [set, s] = BRANCH[mn];
        emit((set ? 0xf000 : 0xf400) | (rel(val(ops[0]), 7) << 3) | s);
      } else if (mn === 'brbs' || mn === 'brbc') {
        need(2);
        const s = range(val(ops[0]), 0, 7, 'bit');
        emit((mn === 'brbs' ? 0xf000 : 0xf400) | (rel(val(ops[1]), 7) << 3) | s);
      } else if (mn === 'adiw' || mn === 'sbiw') {
        need(2);
        const d = reg(ops[0], 24);
        if (d % 2) throw new AsmFail(`${mn} needs r24, r26, r28 or r30`);
        const k = range(val(ops[1]), 0, 63, 'constant');
        emit((mn === 'adiw' ? 0x9600 : 0x9700) | ((k & 0x30) << 2) | (((d - 24) / 2) << 4) | (k & 0x0f));
      } else if (mn === 'movw') {
        need(2);
        const d = reg(ops[0]);
        const r = reg(ops[1]);
        if (d % 2 || r % 2) throw new AsmFail('movw needs even registers');
        emit(0x0100 | ((d / 2) << 4) | (r / 2));
      } else if (mn === 'lds') {
        need(2);
        const d = reg(ops[0]);
        emit(0x9000 | (d << 4));
        emit(range(val(ops[1]), 0, 0xffff, 'address'));
      } else if (mn === 'sts') {
        need(2);
        const k = range(val(ops[0]), 0, 0xffff, 'address');
        emit(0x9200 | (reg(ops[1]) << 4));
        emit(k);
      } else if (mn === 'ld' || mn === 'ldd' || mn === 'st' || mn === 'std') {
        need(2);
        const load = mn === 'ld' || mn === 'ldd';
        const r = reg(load ? ops[0] : ops[1]);
        const ptr = (load ? ops[1] : ops[0]).replace(/\s+/g, '').toUpperCase();
        const simple: Record<string, number> = {
          X: 0x900c, 'X+': 0x900d, '-X': 0x900e, Y: 0x8008, 'Y+': 0x9009, '-Y': 0x900a, Z: 0x8000, 'Z+': 0x9001, '-Z': 0x9002,
        };
        if (ptr in simple) emit(simple[ptr] | (load ? 0 : 0x0200) | (r << 4));
        else {
          const m = /^([YZ])\+(.+)$/.exec(ptr);
          if (!m) throw new AsmFail(`bad pointer operand "${ptr}"`);
          const q = range(val(m[2]), 0, 63, 'displacement');
          emit(0x8000 | (m[1] === 'Y' ? 8 : 0) | (load ? 0 : 0x0200) | ((q & 0x20) << 8) | ((q & 0x18) << 7) | (r << 4) | (q & 7));
        }
      } else if (mn === 'lpm') {
        if (ops.length === 0) emit(0x95c8);
        else {
          need(2);
          const ptr = ops[1].replace(/\s+/g, '').toUpperCase();
          if (ptr !== 'Z' && ptr !== 'Z+') throw new AsmFail('lpm uses Z or Z+');
          emit((ptr === 'Z' ? 0x9004 : 0x9005) | (reg(ops[0]) << 4));
        }
      } else throw new AsmFail(`unknown instruction "${mn}"`);
    } catch (e) {
      errors.push({ line: p.line, message: e instanceof Error ? e.message : String(e) });
      pc += instrSize(p.mn);
    }
  }
  const words = flash.slice(0, maxPc);
  const bytes = new Uint8Array(words.buffer.slice(0));
  return {
    ok: errors.length === 0,
    errors,
    words,
    size: maxPc * 2,
    hex: errors.length ? '' : toIntelHex(bytes, maxPc * 2),
    labels,
  };
}
