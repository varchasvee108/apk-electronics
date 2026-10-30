import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';
import { Device, type Ratings } from '../device';
import type { Stamper } from '../stamper';
import type { DeviceReading, ElementSpec } from '../types';
import { parseIntelHex } from './intelhex';

export const UNO_PINS = [
  'D0',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'D6',
  'D7',
  'D8',
  'D9',
  'D10',
  'D11',
  'D12',
  'D13',
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  '5V',
  '3V3',
  'GND',
  'VIN',
] as const;
const PIN_5V = 20;
const PIN_3V3 = 21;
const PIN_GND = 22;
const FREQ = 16e6;

/** Drive state per I/O pin: 0 low, 1 high, 2 input, 3 input with pull-up. */
type Drive = number[];

/** Everything that survives a netlist hot-swap (the running microcontroller). */
export class AvrRuntime {
  cpu: CPU;
  ports: AVRIOPort[];
  adc: AVRADC;
  usart: AVRUSART;
  timers: AVRTimer[];
  hexKey: string;
  serial = '';
  flag = false;
  /** Simulation time at which this program started running (set on the first step after loading). */
  tBase: number | null = null;
  constructor(hex: string) {
    const flash = parseIntelHex(hex);
    const prog = new Uint16Array(flash.buffer, flash.byteOffset, flash.byteLength / 2);
    this.hexKey = hex;
    this.cpu = new CPU(prog);
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.ports = [portBConfig, portCConfig, portDConfig].map((c) => new AVRIOPort(this.cpu, c));
    for (const p of this.ports) p.addListener(() => (this.flag = true));
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, FREQ);
    this.usart.onByteTransmit = (b: number) => {
      this.serial += String.fromCharCode(b);
      if (this.serial.length > 8000) this.serial = this.serial.slice(-6000);
    };
  }
  get time(): number {
    return this.cpu.cycles / FREQ;
  }
  /** Port and bit for Uno pin k (0..19). */
  static map(k: number): [number, number] {
    if (k < 8) return [2, k]; // PORTD
    if (k < 14) return [0, k - 8]; // PORTB
    return [1, k - 14]; // PORTC
  }
  snapshot(): Drive {
    const d: Drive = [];
    for (let k = 0; k < 20; k++) {
      const [p, b] = AvrRuntime.map(k);
      d.push(this.ports[p].pinState(b) as number);
    }
    return d;
  }
}

/**
 * Arduino Uno: ATmega328P at 16 MHz emulated by avr8js, co-simulated with the analog solver.
 * Nodes follow UNO_PINS. The board is USB-powered: 5V and 3V3 are stiff sources referenced to GND.
 * The CPU runs ahead to the end of each proposed analog step but stops at the first output change,
 * so pin edges land exactly on analog time points. Inputs and ADC channels are refreshed from the
 * analog solution after every accepted step (latency of one step, at most 0.5 ms).
 */
export class ArduinoUno extends Device {
  rt: AvrRuntime | null = null;
  loadError = '';
  drive: Drive = new Array(20).fill(PinState.Input);
  pending: { at: number; drive: Drive } | null = null;
  private inLevels: boolean[] = new Array(20).fill(false);

  constructor(spec: ElementSpec) {
    super(spec);
    this.branches = 2;
    this.boot();
  }

  private boot(): void {
    const hex = this.str('hex', '');
    this.rt = null;
    this.loadError = '';
    if (!hex) {
      this.loadError = 'No program loaded';
      return;
    }
    try {
      this.rt = new AvrRuntime(hex);
    } catch (e) {
      this.loadError = e instanceof Error ? e.message : String(e);
    }
    this.drive = new Array(20).fill(PinState.Input);
    this.pending = null;
    this.inLevels = new Array(20).fill(false);
  }

  initTransient(): void {
    this.boot();
  }

  protected onParamsChanged(): void {
    if (this.str('hex', '') !== (this.rt?.hexKey ?? '')) this.boot();
  }

  stamp(s: Stamper): void {
    const v5 = this.nodes[PIN_5V];
    const v33 = this.nodes[PIN_3V3];
    const gnd = this.nodes[PIN_GND];
    s.vsource(v5, gnd, this.br0, 5 * s.srcScale, 0.05);
    s.vsource(v33, gnd, this.br0 + 1, 3.3 * s.srcScale, 0.5);
    const gOut = 1 / 25;
    for (let k = 0; k < 20; k++) {
      const n = this.nodes[k];
      switch (this.drive[k]) {
        case PinState.High:
          s.conductance(n, v5, gOut);
          break;
        case PinState.Low:
          s.conductance(n, gnd, gOut);
          break;
        case PinState.InputPullUp:
          s.conductance(n, v5, 1 / 35000);
          break;
        default:
          s.conductance(n, gnd, 1e-10);
      }
    }
  }

  maxStep(): number {
    return this.rt ? 5e-4 : Infinity;
  }

  preStep(t: number, dt: number): number {
    const rt = this.rt;
    if (!rt) return dt;
    if (this.pending) return Math.max(this.pending.at - t, 1e-12);
    // A program loaded while the circuit runs starts from reset "now", not at t = 0.
    if (rt.tBase === null) rt.tBase = t;
    const tBase = rt.tBase;
    const target = Math.ceil((t + dt - tBase) * FREQ);
    const cpu = rt.cpu;
    const last = this.drive;
    let guard = 0;
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
      if (rt.flag) {
        rt.flag = false;
        const snap = rt.snapshot();
        let same = true;
        for (let k = 0; k < 20; k++) if (snap[k] !== last[k]) same = false;
        if (!same) {
          this.pending = { at: tBase + cpu.cycles / FREQ, drive: snap };
          return Math.max(this.pending.at - t, 1e-12);
        }
      }
      if (++guard > 2_000_000) break;
    }
    return dt;
  }

  accept(x: Float64Array, t: number): boolean {
    const rt = this.rt;
    if (!rt) return false;
    let disc = false;
    if (this.pending && t >= this.pending.at - 1e-12) {
      this.drive = this.pending.drive;
      this.pending = null;
      disc = true;
    }
    const vg = this.pv(x, PIN_GND);
    for (let k = 0; k < 20; k++) {
      const v = this.pv(x, k) - vg;
      const lv = this.inLevels[k] ? v > 2.3 : v > 2.7;
      if (lv !== this.inLevels[k]) {
        this.inLevels[k] = lv;
        const [p, b] = AvrRuntime.map(k);
        rt.ports[p].setPin(b, lv);
      }
      if (k >= 14) rt.adc.channelValues[k - 14] = Math.max(0, Math.min(5, v));
    }
    return disc;
  }

  /** Send text to the board's serial receive line. */
  writeSerial(text: string): void {
    if (!this.rt) return;
    for (const ch of text) this.rt.usart.writeByte(ch.charCodeAt(0));
  }

  read(x: Float64Array): DeviceReading {
    const i5 = -x[this.br0];
    // per-pin currents into the board (for wire current animation and readouts)
    const pinI = new Array(UNO_PINS.length).fill(0);
    const v5 = this.pv(x, PIN_5V);
    const vg = this.pv(x, PIN_GND);
    let into5 = x[this.br0];
    let intoG = -x[this.br0] - x[this.br0 + 1];
    for (let k = 0; k < 20; k++) {
      const vp = this.pv(x, k);
      const d = this.drive[k];
      if (d === PinState.High) {
        pinI[k] = (vp - v5) / 25;
        into5 -= pinI[k];
      } else if (d === PinState.Low) {
        pinI[k] = (vp - vg) / 25;
        intoG -= pinI[k];
      } else if (d === PinState.InputPullUp) {
        pinI[k] = (vp - v5) / 35000;
        into5 -= pinI[k];
      }
    }
    pinI[PIN_5V] = into5;
    pinI[PIN_3V3] = x[this.br0 + 1];
    pinI[PIN_GND] = intoG;
    const pins: string[] = this.drive.map((d) => (d === PinState.High ? 'H' : d === PinState.Low ? 'L' : d === PinState.InputPullUp ? 'P' : 'I'));
    return {
      v: v5 - vg,
      i: i5,
      p: 0,
      pinI,
      extra: {
        running: !!this.rt,
        error: this.loadError,
        pins: pins.join(''),
        cpuTime: this.rt?.time ?? 0,
      },
    };
  }

  ratings(): Ratings | null {
    return { maxI: 0.5 };
  }

  saveState(): unknown {
    return { ...(super.saveState() as object), rt: this.rt, drive: this.drive.slice(), pending: this.pending };
  }

  loadState(s: unknown): void {
    super.loadState(s);
    const st = s as { rt?: AvrRuntime | null; drive?: Drive; pending?: ArduinoUno['pending'] };
    if (st?.rt && st.rt.hexKey === this.str('hex', '')) {
      this.rt = st.rt;
      this.loadError = '';
      if (st.drive) this.drive = st.drive.slice();
      this.pending = st.pending ?? null;
    }
  }
}
