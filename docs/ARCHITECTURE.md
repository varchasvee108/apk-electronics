# Bench — architecture plan

Bench is an offline electronics lab and teacher. You build circuits on a realistic breadboard (or a free schematic
canvas), power them on and watch them run live.

```
┌──────────────────────────── UI thread (Reanimated worklets) ─────────────────────────────┐
│ pan / pinch / drag gestures · camera transform · current-flow dash animation · 60 fps     │
└───────────────▲──────────────────────────────────────────────────────────────▲────────────┘
                │ shared values                                                 │ props @ ≤30 Hz
┌───────────────┴───────────── JS thread ───────────────────────────────────────┴───────────┐
│ Expo Router screens · Zustand stores (circuit doc, selection, history, sim snapshot)      │
│ SimController: frame-budgeted loop (≤8 ms per frame) driving sim-core, throttled publish │
│ Netlist extraction (geometry → nets) on every edit → hot-swaps the solver, keeping state │
└───────────────┬───────────────────────────────────────────────────────────────────────────┘
                │ pure TS, no React
┌───────────────┴──────────────────── sim-core/ ────────────────────────────────────────────┐
│ MNA assembly · dense LU (partial pivoting) · Newton-Raphson + pnjlim/fetlim limiting      │
│ DC OP (plain → gmin stepping → source stepping) · transient (trapezoidal, BE fallback,    │
│ LTE-adaptive step, breakpoints, event crossing refinement) · AC sweep (complex LU)       │
│ Devices · mixed-signal logic chips · 555 · op-amp macro model · AVR (avr8js) co-sim     │
│ Diagnostics (topology + numeric + stress/failure) · engineering-notation units · FFT    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

## Why our own solver and not ngspice

| | ngspice (WASM / native) | Own TypeScript MNA solver |
|---|---|---|
| Accuracy | Industry reference, large model zoo | Good for the teaching-level models we ship (tests below) |
| Live editing | Batch-oriented: re-parse a deck and restart per edit, no stepping API in WASM builds | Incremental: hot-swap netlist and keep capacitor voltages, chip state, CPU state |
| Visual hooks | Needs custom code-model C to expose per-device internals | Every device exposes readings, stress, failure, events |
| Mixed-signal + AVR | XSPICE digital is separate, AVR co-sim needs a shared clock across a C/JS boundary | Same event queue and clock for analog, logic and the AVR |
| Mobile | WASM in Hermes is unavailable; native needs a custom dev client per platform, 5–10 MB binary, GPL/BSD licensing review | Runs everywhere JS runs, a few hundred KB |

**Recommendation: own solver.** ngspice would only win if we needed foundry-grade models (BSIM, etc.),
which a learning lab does not. We keep the netlist format SPICE-like so a later "export to SPICE" is easy.

## Threading

React Native runs JS off the UI thread already. Gestures, the camera transform and wire animations run as
Reanimated worklets on the UI thread, so they stay at 60 fps even while the solver is busy. The solver runs
on the JS thread in time slices (a frame budget of about 8 ms). It publishes snapshots at no more than 30 Hz.
A separate worklet runtime was considered. It would need every solver function marked `'worklet'` and all
state copied across runtimes. The time-sliced JS-thread design gives the same smoothness with less risk.

## Data model

```ts
// ---------- document (persisted, JSON) ----------
interface CircuitDoc {
  schema: 1; id: string; name: string;
  board: 'breadboard' | 'none';          // 'none' = free schematic canvas
  parts: PartInstance[]; wires: Wire[];
  probes: ProbeSet;                      // multimeter / scope / logic-analyzer probe points
  createdAt: number; updatedAt: number;
}
interface PartInstance { id: string; type: PartType; x: number; y: number; rot: 0|1|2|3;
  props: Record<string, number|string|boolean>; label?: string; }
interface Wire { id: string; a: Pt; b: Pt; color: string; via?: Pt[] }
type Pt = { x: number; y: number }       // 0.1" grid units — breadboard holes sit on this grid

// ---------- parts catalogue (pure TS) ----------
interface PartDef { type; name; category; pins: {name; dx; dy}[];   // footprint on the grid
  defaults; editable: PropSpec[]; expand(part, pinNet): ElementSpec[]; info: DatasheetInfo }

// ---------- netlist (sim-core input) ----------
interface Netlist { nodeNames: string[];  // index 0 = ground
  elements: ElementSpec[] }
interface ElementSpec { id: string; type: string; nodes: number[]; params: Record<string, ParamValue>; partId?: string }

// ---------- device model interface (sim-core) ----------
interface Device {
  id; type; nodes: number[]; internal: number; branches: number;  // MNA unknown allocation
  nonlinear: boolean;
  stamp(s: Stamper): void;                 // DC / transient companion + NR linearisation
  stampReactive?(s: ReactiveStamper): void;// jωC / jωL terms for AC
  accept?(x, t, dt): boolean;              // commit state, return true on discontinuity
  crossing?(xOld, xNew): number;           // event location (0..1) for comparators / logic
  nextBreakpoint?(t): number; maxStep?(): number;
  lte?(x, dt, method): number;             // local truncation error ratio (≤1 OK)
  postConverge?(x): boolean;               // mode switches (CC/CV supply, relay)
  read(x): DeviceReading;                  // V, I, P, brightness, temperature…
  stress?(r: DeviceReading, dt): Stress;   // over-current / over-power / reverse polarity
  saveState?(); loadState?(s);             // hot-swap on edit
}
```

**Netlist extraction.** Grid points are joined with union-find. A point joins another when they share a
breadboard strip (5-hole column halves, split power rails), when a wire runs between them, or when two pins
sit on the same point. The net that holds a Ground part becomes node 0. Breadboard and schematic are two
renderings of one model: same parts, same geometry, same nets. The schematic canvas is a document with
`board: 'none'`.

## Screens (Expo Router, `src/app`)
| Route | Purpose |
|---|---|
| `/` | Home: continue, new breadboard / schematic, learn, challenges, examples, library |
| `/bench/[id]` | Workbench: canvas, parts tray, inspector, instruments, power controls |
| `/circuits` | Saved circuits: rename, duplicate, delete, export / import JSON |
| `/examples` | Example circuit gallery |
| `/learn` · `/learn/[lesson]` | Curriculum and lesson player (workbench + goal panel + auto-check) |
| `/challenges` | Open-ended design tasks with auto-check |
| `/library` · `/library/[type]` | Component explainer / datasheet pages |
| `/glossary` | Searchable glossary |
| `/about` | Model approximations note, licences, how Arduino compilation works |

## Storage
expo-sqlite tables: `circuits(id, name, json, updated)`, `progress(lesson_id, status, updated)` and
`kv(key, value)`. Auto-save runs 800 ms after each edit. Export writes JSON to the cache dir and opens the
share sheet. Import uses the document picker. Screenshots are Skia canvas snapshots saved as PNG and shared.
