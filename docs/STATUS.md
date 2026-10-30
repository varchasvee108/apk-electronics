# Bench — build status

## Done (tested: 70 / 70 Jest tests pass, `npx jest`)
- **Stage 1: architecture.** See `docs/ARCHITECTURE.md` (recommends our own solver over ngspice, with reasons).
- **Stage 2: `sim-core/`.** Pure TypeScript, no React.
  - MNA, dense LU, Newton–Raphson with pnjlim/fetlim limiting; DC operating point (plain → gmin stepping → source stepping).
  - Transient: trapezoidal integration with backward-Euler fallback, LTE-adaptive step, breakpoints, and event-crossing refinement. AC sweep uses a complex LU.
  - Devices: R, C (incl. polarised), L, transformer, switch, V/I sources with waveforms, bench supply (CV/CC), diode/LED/Zener/Schottky/photodiode, BJT (Ebers–Moll), MOSFET (Level 1), op-amp macro model (GBW, slew, rails), 7805, 555, relay, DC motor.
  - Logic chips: 7400/02/04/08/32/86/74, 74HC595/138/161, CD4017. They are event driven with propagation delay and VCC/2 thresholds.
  - Arduino Uno via avr8js, co-simulated at exact pin-edge times. An on-device AVR assembler plus 6 starter programs.
  - Diagnostics in plain language: no ground, floating node or input, shorted source, source loop, singular matrix, reverse polarity, over-current, over-power. Parts can fail and be repaired.
  - Tests check against analytic answers: listed in the job report.
- **Stage 3 (partial): `src/model/`.** Breadboard geometry, catalogue of 45 parts (footprints, expansion, datasheet text), netlist extraction, and an end-to-end LED-on-breadboard test.
- App plumbing: light theme (`src/theme.ts`), SQLite persistence (`src/store/db.ts`), circuit store with undo/redo (`src/store/circuit.ts`).

## Not started yet (next steps, in order)
1. `src/sim/controller.ts`: frame-budgeted run loop, hot-swap on edit, snapshots, scope buffers, wire currents, multimeter, Bode.
2. Skia canvas (breadboard picture, part renderers, wires with current flow, schematic symbols) and gestures (v3 hooks: `usePanGesture` / `usePinchGesture`).
3. Screens: home, workbench, circuits, examples, library, glossary, about. Then instruments, learning mode, lessons, challenges.
4. `app.json`: name, `userInterfaceStyle: "light"`, `orientation: "default"`, expo-sqlite plugin. Root `tsconfig` path `@sim/*` → `./sim-core/src/*`.
5. Run `npx expo lint`, `npx tsc --noEmit`, `npx expo export` (bundle check) and a dev build on a device.

## Model assumptions and simplifications
- Dense LU: fine up to a few hundred unknowns.
- No junction capacitances: BJT and diode have no charge storage or high-frequency roll-off.
- No Early effect. MOSFET body is tied to source.
- Op-amp: single pole; output referenced to ground (rail currents are estimated for display only); no input bias or offset; no output current limit (flagged as a warning instead).
- 555: ideal comparators; weak internal pull-up on RESET.
- Logic: VCC/2 threshold with ±5 % hysteresis; there is no X state.
- LDR and thermistor are static resistors with no response time.
- Buzzer: no audio.
- Motor: back-EMF is coupled explicitly per step.
- Heat model: first-order thermal model with sustained and instantaneous failure thresholds.
- Arduino: inputs and ADC refresh after each analog step (≤0.5 ms latency). The emulation is CPU-bound: in Node it runs at roughly 0.7× real time for Blink, and it will be slower in Hermes on a phone.
- Arduino C++ is **not** compiled on the device. Starter programs are equivalent hand-written AVR assembly. For your own C++, import a `.hex` exported from the Arduino IDE.
