# Bench: build status

## Verified

| Check | Result |
|---|---|
| `npm test` (Jest) | **240 / 240 pass**: solver/AVR tests against analytic answers, the new parts (fuse, bulb, servo, Schmitt, BCD decoder, adder, servo programs), curve tracer, reading averaging, editing while running, netlists, examples, quizzes, store editing, file import/export, and **every lesson and challenge solved by a scripted learner** (and shown not to pass before it is built) |
| Browser end-to-end (`tools/e2e-web.js` and two further passes) | **34 / 34**: add from tray, drag into holes, type values, draw wires, tap holes, re-plug wires, undo, rotate, zoom, hold buttons, flip switches, solve a lesson. **22 / 22**: multimeter V/V~/Ω, scope auto-set, cursors, FFT, pause/step, slow motion, logic analyzer, Bode (−3 dB at 1.59 kHz), serial monitor, burn-out and repair, netlist view, saved circuits. **23 / 23**: I–V tracer, quizzes, the fuse lesson done entirely through the UI, every new lesson running. No JS errors |
| `npx tsc --noEmit` and `tsc -p sim-core` | clean (strict) |
| `npx eslint src sim-core/src` | clean |
| `npx expo-doctor` | 20/20 checks pass |
| `npx expo export --platform android` | bundles (Hermes bytecode, 5.9 MB) |
| Web build in headless Chrome | screens render and run, screenshots in `docs/screenshots/` |

Live-app spot checks (web build): the 555 example's scope auto-set measures **989 mHz** (design value 0.99 Hz), and the capacitor swings between ⅓ and ⅔ of 9 V (2.98 Vpp). The traffic light sequences, the Arduino Blink LED toggles, and the phone portrait layout fits.

**Not run:** no Android/iOS emulator or device was available on the build machine, so the native app has been bundled but not launched. Gestures (drag, pinch, hold-to-press) were written against gesture-handler 3's hook API and checked by the typechecker, but not exercised by touch.

## Features

- **Solver** (`sim-core/`): DC operating point (Newton, then gmin stepping, then source stepping), transient (trapezoidal with backward-Euler fallback, LTE-adaptive steps, breakpoints, event-crossing refinement), AC sweep. Diodes, LEDs, Zener, Schottky and photodiode; BJT (Ebers–Moll); MOSFET (Level-1 with body diode); op-amp macro model (GBW, slew, rails); 7805; 555; relay; DC motor; transformer; bench supply with CC/CV.
- **Mixed-signal logic:** 7400, 7402, 7404, 74HC14 (Schmitt trigger), 7408, 7432, 7486, 7474, 74HC283 (4-bit adder), 74HC595, 74HC138, 74HC161, CD4017 and CD4511 (BCD → 7-segment) with propagation delay; 7-segment display and 4/8-segment LED bars.
- **More parts:** RGB LED, fuse (blows and is replaced), incandescent bulb (thermal filament: inrush, I ∝ V^0.6), SG90 servo (pulse width → angle at 600 °/s), LM317 adjustable regulator, LM35 temperature sensor, TIP120 Darlington. 55 parts in all.
- **Arduino Uno:** avr8js (GPIO, timers/PWM, ADC, USART) co-simulated at exact pin-edge times; serial monitor; on-device AVR assembler; .hex import or paste. Eight starter programs, including Servo Sweep and Servo Knob (Timer1 mode 14, 50 Hz).
- **Diagnostics in plain language:** no ground (auto-reference), floating node or input, dangling pin, shorted source, source loop, singular matrix, reverse polarity, over-current, over-power, over-voltage, unpowered chip. Parts fail visibly (LED cracks, resistor smokes and chars, electrolytic pops) and can be repaired.
- **Editor:** realistic breadboard (5-hole strips, split rails, centre channel, labels); 55 parts in a tray with search; drag with snap, rotate in place, multi-select (marquee), duplicate, delete; wires by drag or tap-tap with 8 colours, drag a wire end to re-plug it; wires on off-board terminals follow when a part moves; undo/redo; pan (one or two fingers), pinch-zoom and zoom buttons; tap any hole to highlight every hole it is connected to and see its voltage; long-press to pin a readout. Breadboard, schematic and netlist views share one model. There is also a free schematic canvas document type.
- **Live visuals:** current-flow dots (direction and log-speed from the solved wire currents), wire colouring by voltage, LED glow from current, capacitor charge level, relay contact, motor rotation, buzzer waves, supply and generator displays.
- **Instruments:** DMM (V, V~ RMS, A in series, Ω and continuity with power off); 4-channel scope (time/div, V/div, trigger channel/edge/level, auto-set, hold, cursors, FFT, auto-measurements); 8-channel logic analyzer; Bode plotter (plots the first probe that is not on the generator, or a chosen channel, with an interpolated −3 dB point); **I–V curve tracer** (two-terminal parts, and families of output curves for BJTs, MOSFETs and the TIP120); serial monitor.
- **Steady readings:** every accepted solver step is integrated between frames, so meters and labels show true averages, RMS and peak-to-peak values instead of aliased instantaneous samples; numbers are damped like a real meter. Editing a running circuit carries every device's state (capacitor charge, op-amp output, relay position, inductor and transformer currents) across the rebuild.
- **"Why is this happening?":** formulas with live numbers for each part type.
- **Learning:** 18 units and 37 lessons, each with a partial circuit, hints and automatic checks measured from the running circuit (they keep counting while you use the inspector or instruments). A three-question quiz per unit (54 questions with explanations). Also 6 challenges, a sandbox, a 93-term glossary, datasheet pages for every part (pinout drawing, specs, how it works, typical circuits) and progress tracking.
- **Saving:** SQLite on device (localStorage on web), auto-save, rename/duplicate/delete, JSON export/import, Skia screenshot sharing, 18 example circuits.
- **Platform:** light theme only, landscape-first with a portrait layout, 48 dp touch targets, accessibility labels, engineering notation throughout. On web, CanvasKit is loaded via `index.web.js` and the canvas font is Inter on all platforms.

## Model assumptions and simplifications

- **Matrix:** dense LU, comfortable up to a few hundred unknowns.
- **Diodes and LEDs:** Shockley equation plus series resistance; no junction capacitance or reverse recovery. LED brightness is proportional to current (100 % at 20 mA). Damage uses a first-order heat model.
- **BJT:** no Early effect and no charge storage, so no high-frequency roll-off. **MOSFET:** body tied to source; no capacitances.
- **Op-amp:** single pole; output referenced to ground, with rail currents estimated for display; no input bias or offset; output current limit flagged rather than modelled.
- **555:** ideal comparators; output high ≈ VCC − 1.7 V; weak internal pull-up on RESET.
- **Logic:** VCC/2 threshold with ±5 % hysteresis (74HC14: 31 % / 53 % of VCC), no X state; outputs are resistive drivers to the chip's own VCC/GND pins (40 Ω for 74HC, 400 Ω for 4000-series, 60 Ω for the CD4511's segment drivers).
- **Bulb:** filament temperature follows a first-order heat balance (radiation ∝ T⁴, τ ≈ 0.15 s), resistance ∝ temperature, light ∝ T^8.5. Rated by voltage, so the cold-start inrush does not count as an overload.
- **Fuse:** a small resistance with a fast heat model: holds its rating, blows in ≈0.1 s at 2×, instantly above 8×.
- **Servo:** times each pulse on SIG with edge refinement; 1–2 ms maps to 0–180°; only moves while pulses keep arriving; supply current rises while moving. It starts at 0°.
- **LM317 / LM35:** regulator model (smooth dropout) holding OUT 1.25 V above ADJ, or VOUT at 10 mV/°C.
- **Electromechanical:** relays switch instantly at pull-in/drop-out current. The motor uses linear back-EMF with viscous friction, explicitly coupled per step.
- **Sensors and buzzer:** LDR and thermistor are static resistors (no response time). The active buzzer plays a fixed ≈2.3 kHz beep; the passive piezo plays the frequency it measures from its drive signal (rounded to a semitone).
- **Modules:** sensor modules are behavioural (PIR hold timer, comparator outputs, Thevenin analog outputs). The HC-SR04 echo width is exactly 2·d/343 m/s. The LCD implements the HD44780 command subset Arduino sketches use (no busy flag, no custom characters). The stepper is kinematic (no torque or missed steps). The draining battery uses Coulomb counting and a simple EMF curve.
- **Arduino:** inputs and ADC refresh after each accepted solver step (≤ 0.5 ms latency). Emulating 16 MHz in JavaScript is CPU-bound, so the status bar shows when it runs below real time.
- **Threading:** the solver runs on the JS thread in ≤ 10 ms slices; gestures and canvas animation run on the UI thread (see the architecture doc).
- **Scope sampling:** while the scope or logic analyzer is open, steps are capped at time/div ÷ 15.

## Fixed in the bug sweep

- Netlist was read during render but rebuilt after it, so the schematic and hole taps lagged one edit behind. It is now reactive.
- A screen that was leaving could power off the screen replacing it, and edits made in the last 0.8 s before leaving could be lost.
- Dragged parts landed one hole short; tapping a curved breadboard wire often missed it; holding a push button longer than ½ s released it.
- Rotating spun parts around their first pin (the diode lesson was impossible); parts now rotate in place.
- A floating logic input next to a capacitor produced a false "no unique solution" error (pivot test now per column).
- Reloading an Arduino program while running made the CPU try to catch up from t = 0.
- Potentiometer examples turned the "wrong way"; a lesson goal described an impossible resistor placement.
- On the web, delete / clear / reset confirmations and file export never worked (Alert is a no-op there).

## Fixed in the second sweep

- Values "glitched" while running: AC, PWM and switching signals were shown as single samples taken 25 times a second (aliasing). Readings are now averaged over every solver step between frames, with RMS and peak-to-peak shown for AC.
- Editing while running reset op-amp outputs, relay contacts, inductor/transformer currents and internal nodes (a regression test showed a 4.2 V jump). State is now carried across rebuilds, matched by where the nets physically are.
- Over-load warnings flickered on AC waveforms; they are now smoothed over 50 ms.
- The Bode tab plotted the generator against itself in the RC example (CH1 was on the input), giving a flat line.
- Undo/redo cleared the selection, closing the inspector you were using.
- Lesson checks that remember events (blinks, "the fuse blew", "LED on in the dark") were lost whenever another tab was opened, making the night-light challenge and the fuse lesson almost impossible in the app.
- Selecting a part jumped away from an open instrument.

## Version 1.3: building on a phone, sound, sensors, learning

- **Building:** press and hold a part in the tray, then drag it onto the board. Haptic ticks as wire ends and parts snap onto holes. Wires can be bent around parts (drag the handle in the middle of a selected wire). "Fix it" buttons in the circuit check: add a ground, re-seat a bypassed or unplugged part, remove a shorting wire, turn a reversed part round, add a series resistor to an LED, replace a damaged part.
- **Sound:** buzzers and piezos play through the speaker; fuse pops, burn-out cracks, relay clicks, and a chime when a goal is reached (Settings → sounds/haptics).
- **17 new parts:** passive buzzer, 16×2 LCD, 28BYJ-48 stepper, L293D, ULN2003, HC-SR04, PIR, IR obstacle, Hall switch, joystick, soil moisture, MQ-2 gas, sound sensor, tilt and reed switches, flex and force sensors; batteries can run down. Five new Arduino programs (melody, LCD, ultrasonic, stepper, L293D) and 11 new examples.
- **Learning:** 8 fault-finding lessons (Fix the circuit) and 8 sensor/module lessons, all verified by scripted learners. Build-along for every example. Progress screen with streak, badges, review list and a daily practice suggestion. Reference cheat sheets.
- **App:** share a circuit as a QR code or link (bench://open?c=…), dark mode (Settings), tablet portrait layout, EAS Update channels, a faster sparse-row LU in the solver, readable part names in all messages.

## Fixed in the mobile sweep

- Wires could end in mid-air (off the board, in the centre channel, in rail gaps) and silently connect nothing. Wire ends now snap to the nearest hole or terminal within a fingertip's reach, with a green or red target ring while dragging; ends with nothing under them are refused, and the store enforces the same rule.
- A meter probe tapped on a part's body sat on an unconnected point (or the empty hole under the part) and read 0 V. Probes now snap to holes and pins, and a tap on a body goes to that part's nearest lead.
- Moving a meter probe while running showed 0 V (or a fraction of the real value) for a moment: the probe pair's sum restarted mid-interval but was divided by the whole interval.
- Parts dropped with a lead over the centre channel or a rail gap are nudged into the nearest holes. Leads that are plugged into nothing get a red ring, and a part with both leads in one 5-hole strip is reported as "bypassed".
- Deleting a battery or supply removes the jumpers clipped to its terminals.
- Phone layout: the zoom/view buttons moved to the bottom corner, and the wire-colour palette opens from a swatch button instead of covering the top power rails.
- Redrawn parts: ceramic disc and standing electrolytic capacitors (charge halo / gauge), a 5 mm LED with an epoxy dome and bloom, a screw bulb in a holder with a glowing filament, a shaded buzzer, plus shading on resistors, diodes and fuses.

## Next steps

1. Launch on a device or emulator (`npx expo start`, then Expo Go or a dev build) and tune touch interactions, especially drag-from-tray (parts are currently added by tapping) and wire endpoint editing.
2. Profile on a mid-range Android phone; if needed, move the solver into a worklet runtime and/or switch the dense LU to a sparse one.
3. App icon and splash are generated by `tools/make_icons.py`.
