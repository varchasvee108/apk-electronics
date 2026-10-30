export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

/** One primitive element in a netlist. `nodes` index into Netlist.nodeNames (0 = ground). */
export interface ElementSpec {
  id: string;
  type: string;
  nodes: number[];
  params: Params;
  /** UI part this element was expanded from (one part may produce several elements). */
  partId?: string;
  label?: string;
}

export interface Netlist {
  /** nodeNames[0] is always ground. */
  nodeNames: string[];
  elements: ElementSpec[];
}

export type Method = 'be' | 'trap';
export type Mode = 'dc' | 'tran';

/** Live values a device reports. Currents are conventional, positive *into* pin 0 / through the part a→b. */
export interface DeviceReading {
  /** Main voltage across the part (pin0 − pin1 for two-terminal parts). */
  v: number;
  /** Main current through the part. */
  i: number;
  /** Power dissipated (W); negative for a source delivering energy. */
  p: number;
  /** Per-pin currents flowing *into* the device from each node. */
  pinI?: number[];
  extra?: Record<string, number | string | boolean>;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  code:
    | 'no-ground'
    | 'floating-node'
    | 'dangling-pin'
    | 'shorted-source'
    | 'source-loop'
    | 'singular'
    | 'no-convergence'
    | 'reverse-polarity'
    | 'over-current'
    | 'over-power'
    | 'over-voltage'
    | 'failed'
    | 'unpowered-chip'
    | 'floating-input'
    | 'note';
  title: string;
  message: string;
  elementId?: string;
  partId?: string;
  node?: number;
}

export interface Stress {
  /** 0..1 — fraction of the part's rating currently used (1 = at the limit). */
  load: number;
  /** Instantaneous condition that should be flagged. */
  diagnostic?: Diagnostic;
}
