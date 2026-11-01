# Bench Web

A browser-native Next.js frontend for Bench. The Expo mobile application stays at the repository root, with its existing dependencies, scripts, configuration, and releases unchanged.

## Run

From the repository root:

```bash
cd apps/web
npm install
npm run dev
```

Open **http://localhost:3000**. This package has its own lockfile; install dependencies here, not at the repository root.

```bash
npm run lint
npm test
npm run build
npm run start

# Browser integration tests (run a build first)
npx playwright install chromium
npm run test:e2e
```

The root mobile checks remain `npm run lint` and `npm run typecheck`, from the repository root.

## What is included

- Responsive overview, circuit gallery, personal saved circuits, component library, and searchable reference.
- Independent SVG workbench with a breadboard or free schematic grid, placement, drag-to-move, rotation, wire connections, zoom/pan, reference labels, and 80-step undo/redo.
- Real Bench transient simulation in a **Web Worker**, frame-averaged measurements, component stress/failure diagnostics, pause, reset/repair, speed controls, and single stepping.
- Four-channel oscilloscope, logic capture, DC/AC voltage meter, small-signal Bode sweep, Arduino serial monitor, and CSV trace export.
- 67 lessons and hardware guides, plus 6 design challenges: the original 37 lessons have a web-only explanation layer, and 30 new entries cover ICs, Arduino, Raspberry Pi, and practical engineering.
- Dedicated learning paths, searchable formats and saved lessons, long-form lesson readers, worked examples, step-by-step reasons, knowledge checks, suggested prerequisites, and manufacturer/library references.
- Live workbench explanations, quick experiment controls, real checkpoint evaluation, and device-specific measurements such as servo angle.
- Per-lesson predictions, study checklists, bookmarks, notebooks, Markdown note export, and print-friendly lesson pages.
- Eight engineering calculators, an interactive Boolean truth table, and a complete 40-pin Raspberry Pi SBC header reference.
- Arduino assembly editor and Intel HEX loading using the shared AVR assembler/emulator. C++ compilation is not included.
- Debounced circuit autosave, rename, duplicate, delete confirmation, validated mobile-compatible JSON import/export, and storage failure warnings.
- Ctrl/Command K workspace search, keyboard shortcuts, native modal focus handling, and reduced-motion support.

## Isolation and shared source

```text
repository/
├── package.json           # Existing mobile package; unchanged
├── src/                   # Existing Expo app and framework-free models
├── sim-core/              # Existing pure TypeScript simulation engine
└── apps/web/
    ├── package.json       # Next.js-only dependencies and commands
    ├── package-lock.json
    ├── next.config.mjs
    ├── src/app/           # Next.js routes, layout and styles
    ├── src/components/    # Browser-only React UI
    ├── src/content/       # Web-only lesson content, teaching models and GPIO map
    ├── src/lib/           # Web Worker, storage and import validation
    ├── tests/             # Node unit tests
    └── e2e/               # Playwright browser tests
```

Next.js resolves read-only shared source through `@sim/*` and `@/*`; web source uses `@web/*`. Shared modules are `sim-core/src`, `src/model`, and the framework-free `src/sim/averager.ts` and `src/sim/snapshot.ts`. No Expo/native UI or platform storage module is imported at runtime.

The new frontend deliberately uses **JavaScript/JSX plus a separate jsconfig**. The existing mobile tsconfig recursively includes TypeScript files throughout the repository. Adding another TypeScript frontend without changing that configuration would pull browser-only files into the mobile typecheck. This avoids that interference while Next compiles the existing shared TypeScript core. A future coordinated migration can introduce proper workspace packages and an independent web TypeScript boundary; that is not required to run either app now.

Webpack is explicitly selected for both dev and production because the worker's `new URL(..., import.meta.url)` bundling and external shared-source aliases are configured and tested with it.

## Data and product boundaries

Circuits, progress, bookmarks, predictions, and lesson notes live in `localStorage` under `bench.web.workspace.v1`. Existing workspace data is preserved when the new learning fields are added. They are separate from the mobile app's data. There are no accounts, backend, analytics, or cloud sync. Export JSON to transfer a circuit between devices or web/mobile. Browser clearing/private-mode limits apply. Avoid editing the same workspace concurrently in multiple tabs.

This is an interactive browser app, not a PWA/service-worker offline install. The simulation is local after the page loads, but navigating/reloading requires access to the deployed site. The solver uses educational component models, not foundry-grade SPICE. Complex devices currently have generic SVG bodies rather than every mobile device's custom visual animation. Wire-tool interactions on web are two clicks, even if reused lesson text describes mobile dragging.

For responsiveness and import safety, imported documents are limited to 5 MB, 500 components, and 2,000 wires; the worker refuses netlists over 300 nodes. Capture is a rolling buffer, not unlimited recording. The logic analyzer captures eight channels; four probe-placement buttons are currently exposed. The multimeter supports DC/AC voltage; component current/power is available through the inspector.

## Simulation visual feedback

The canvas shows conventional-current dots using actual signed wire and component readings, with RMS activity for AC paths whose mean current can cancel to zero. Animation speed is a teaching visualization, not electron speed or an exact frequency display. Dots freeze on pause and disappear after reset or when an edit invalidates the readings. Reduced-motion preferences disable animation while retaining measured labels and status.

The on-canvas indicator distinguishes starting, current detected, paused, damaged/error, and measured lesson targets met. **Current detected does not mean an arbitrary circuit is correct or hardware-safe.** Resistors show measured current; LEDs, RGB LEDs, LED bars, seven-segment displays, and lamps show measured brightness. Servo horns reflect the solver angle; motors show measured rpm and a visual rotor; relays show coil state. Live canvas switches can be clicked or keyboard-operated, and momentary buttons release on pointer/key release or cancellation.

The first lesson intentionally starts with two missing connections. Running it disconnected now explicitly reports an open loop. You can wire it manually or use **Connect lesson wires**, an undoable demonstration—not a fake successful reading. The ideal target is 9 mA; the model's battery internal resistance produces approximately 8.98 mA with the supplied 1 kΩ resistor.

Circuit edits invalidate old readings and checkpoint results immediately. Reset clears serial output as well as circuit measurements. Failed circuit loads cannot silently run the previously loaded simulator.

## Expanded learning library

Visit `/learn` for the full library or use the dedicated paths:

- `/learn/tracks/ics`: gates, feedback, timing, registers, supply integrity, and regulators; 8 new lessons alongside the existing IC material.
- `/learn/tracks/arduino`: PWM, ADC, serial echo, servo commands, nonblocking timing, debounce, interrupts, and buses; 8 new lessons alongside the existing embedded material.
- `/learn/tracks/raspberry-pi`: 10 hardware guides covering SBC vs Pico, numbering, safe LED/button/PWM circuits, I²C, external SPI ADCs, UART, actuator drivers, and logging.
- `/learn/tracks/engineering`: 4 new guides on datasheets, tolerance, measurement, and debugging.
- `/tools`: Ohm’s law, LED resistor estimates, loaded/tolerance-aware dividers, RC timing, 555 timing, ADC conversion, regulator heat, I²C pull-up estimates, Boolean logic, and GPIO mapping.

Every lesson has a dedicated `/learn/<id>` page. New content lives in `src/content/web-lessons.mjs`; `src/lib/curriculum.js` combines it with read-only shared lessons and challenges. The mobile curriculum is never modified. New simulation templates and custom serial/gain checks also live only in the web app.

**Pi lessons are not an emulated Raspberry Pi.** Bench does not run Linux, Python, Web Serial, or complete I²C/SPI peripheral transactions. The GPIO explorer is a reference, not a live device. Python and C++ snippets are labeled with their target environment; the existing AVR studio continues to run assembly/Intel HEX rather than compiling C++. Guide completion records a study checklist and knowledge check, not verification of hardware wiring or a safety certification.

The 11 new simulated experiments reuse the actual solver; predictions and measurements are labeled separately. Calculator results are educational approximations, not guaranteed device specifications. Consult the exact manufacturer and board documentation for real builds. Lessons explicitly note ideal-model omissions such as contact bounce, parasitic supply impedance, ADC/reference error, and Linux scheduling jitter.

## Deployment

Deploy independently from mobile. Use `apps/web` as the Next.js project root while retaining the **whole repository** in the build checkout, since shared source is outside the web folder. Run `npm install`/`npm ci` and `npm run build` in that directory. The tracing root is the repository root for shared-source builds. No EAS or mobile configuration change is needed.

For a standard Node deployment, run `npm run start` after the build. For a monorepo-aware host, set its Root Directory to `apps/web` and enable access to files outside that directory. No environment variables are required for this version.
