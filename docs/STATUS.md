# Bench: build status

## Verified

| Check | Result |
|---|---|
| `npm test` (Jest) | **127 / 127 pass**: 65 solver/AVR tests against analytic answers, 5 netlist, 31 example-circuit and 26 lesson tests |
| `npx tsc --noEmit` and `tsc -p sim-core` | clean (strict) |
| `npx eslint src sim-core/src` | clean |
| `npx expo-doctor` | 20/20 checks pass |
| `npx expo export --platform android` | bundles (Hermes bytecode, 5.9 MB) |
| Web build in headless Chrome | screens render and run, screenshots in `docs/screenshots/` |

Live-app spot checks (web build): the 555 example's scope auto-set measures **989 mHz** (design value 0.99 Hz), and the capacitor swings between ⅓ and ⅔ of 9 V (2.98 Vpp). The traffic light sequences, the Arduino Blink LED toggles, and the phone portrait layout fits.

**Not run:** no Android/iOS emulator or device was available on the build machine, so the native app has been bundled but not launched. Gestures (drag, pinch, hold-to-press) were written against gesture-handler 3's hook API and checked by the typechecker, but not exercised by touch.

## Features

- **Solver** (`sim-core/`): DC operating point (Newton, then gmin stepping, then source stepping), transient (trapezoidal with backward-Euler fallback, LTE-adaptive steps, breakpoints, event-crossing refinement), AC sweep. Diodes, LEDs, Zener, Schottky and photodiode; BJT (Ebers–Moll); MOSFET (Level-1 with body diode); op-amp macro model (GBW, slew, rails); 7805; 555; relay; DC motor; transformer; bench supply with CC/CV.
- **Mixed-signal logic:** 7400, 7402, 7404, 7408, 7432, 7486, 7474, 74HC595, 74HC138, 74HC161 and CD4017 with propagation delay; 7-segment display and 4/8-segment LED bars.
- **Arduino Uno:** avr8js (GPIO, timers/PWM, ADC, USART) co-simulated at exact pin-edge times; serial monitor; on-device AVR assembler; .hex import or paste.
- **Diagnostics in plain language:** no ground (auto-reference), floating node or input, dangling pin, shorted source, source loop, singular matrix, reverse polarity, over-current, over-power, over-voltage, unpowered chip. Parts fail visibly (LED cracks, resistor smokes and chars, electrolytic pops) and can be repaired.
- **Editor:** realistic breadboard (5-hole strips, split rails, centre channel, labels); 45 parts in a tray with search; drag with snap, rotate, multi-select (marquee), duplicate, delete; wires by drag or tap-tap with 8 colours; undo/redo; pan and pinch-zoom; tap a hole for its net voltage; long-press to pin a readout. Breadboard, schematic and netlist views share one model. There is also a free schematic canvas document type.
- **Live visuals:** current-flow dots (direction and log-speed from the solved wire currents), wire colouring by voltage, LED glow from current, capacitor charge level, relay contact, motor rotation, buzzer waves, supply and generator displays.
- **Instruments:** DMM (V, A in series, Ω and continuity with power off); 4-channel scope (time/div, V/div, trigger channel/edge/level, auto-set, hold, cursors, FFT, auto-measurements); 8-channel logic analyzer; Bode plotter; serial monitor.
- **"Why is this happening?":** formulas with live numbers for each part type.
- **Learning:** 16 units and 22 lessons, each with a partial circuit, hints and automatic checks measured from the running circuit. Also 6 challenges, a sandbox, an 83-term glossary, datasheet pages for every part (pinout drawing, specs, how it works, typical circuits) and progress tracking.
- **Saving:** SQLite on device (localStorage on web), auto-save, rename/duplicate/delete, JSON export/import, Skia screenshot sharing, 17 example circuits.
- **Platform:** light theme only, landscape-first with a portrait layout, 48 dp touch targets, accessibility labels, engineering notation throughout. On web, CanvasKit is loaded via `index.web.js` and the canvas font is Inter on all platforms.

## Model assumptions and simplifications

- **Matrix:** dense LU, comfortable up to a few hundred unknowns.
- **Diodes and LEDs:** Shockley equation plus series resistance; no junction capacitance or reverse recovery. LED brightness is proportional to current (100 % at 20 mA). Damage uses a first-order heat model.
- **BJT:** no Early effect and no charge storage, so no high-frequency roll-off. **MOSFET:** body tied to source; no capacitances.
- **Op-amp:** single pole; output referenced to ground, with rail currents estimated for display; no input bias or offset; output current limit flagged rather than modelled.
- **555:** ideal comparators; output high ≈ VCC − 1.7 V; weak internal pull-up on RESET.
- **Logic:** VCC/2 threshold with ±5 % hysteresis, no X state; outputs are resistive drivers to the chip's own VCC/GND pins (40 Ω for 74HC, 400 Ω for 4000-series).
- **Electromechanical:** relays switch instantly at pull-in/drop-out current. The motor uses linear back-EMF with viscous friction, explicitly coupled per step.
- **Sensors and buzzer:** LDR and thermistor are static resistors (no response time). The buzzer is visual only, with no audio.
- **Arduino:** inputs and ADC refresh after each accepted solver step (≤ 0.5 ms latency). Emulating 16 MHz in JavaScript is CPU-bound, so the status bar shows when it runs below real time.
- **Threading:** the solver runs on the JS thread in ≤ 10 ms slices; gestures and canvas animation run on the UI thread (see the architecture doc).
- **Scope sampling:** while the scope or logic analyzer is open, steps are capped at time/div ÷ 15.

## Next steps

1. Launch on a device or emulator (`npx expo start`, then Expo Go or a dev build) and tune touch interactions, especially drag-from-tray (parts are currently added by tapping) and wire endpoint editing.
2. Profile on a mid-range Android phone; if needed, move the solver into a worklet runtime and/or switch the dense LU to a sparse one.
3. Optional: an app icon and splash in Bench's style (the scaffold's defaults are still in `assets/images`).
