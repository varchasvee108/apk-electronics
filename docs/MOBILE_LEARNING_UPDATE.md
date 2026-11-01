# Mobile learning update report

## Scope

Added the missing educational features from Bench Web to the existing Expo mobile application. This is an additive update, not a web-style UI replacement. **No notes, notebooks, editable predictions, or note-export feature was added**, as requested.

## Additions

### Curriculum

- 30 additional lessons/guides: 8 IC, 8 Arduino, 10 Raspberry Pi, and 4 practical engineering topics.
- Total: 67 lessons/guides, alongside the existing 6 design challenges.
- 7 additional units and their quiz groups; the original 18 units and quizzes remain intact.
- 11 additional simulated experiments using the existing solver, AVR assembler/emulator, canvas, inspector, and instruments.
- Raspberry Pi content is explicitly real-hardware guidance, **not Linux/Python/Pi or I²C/SPI emulation**.
- Five learning tracks, text search, circuit/guide filters, bookmarks, hide-completed filtering, and curriculum/A–Z/duration sorting within the existing unit cards.

### Explanations and practice

- Dedicated mobile explanation pages with mechanisms, equations, worked examples, observations, misconceptions, prerequisites, explained steps, parts lists, knowledge checks, hardware-reference code, and resource links.
- Existing interactive lessons still open directly into the original mobile workbench.
- Two optional actions at the end of the existing lesson panel: full explanation/knowledge check and a collapsible live-reading explanation.
- New hardware guides record completion after their study checklist and knowledge questions are satisfied. This is not hardware wiring validation or a safety certification.
- New serial-echo and captured AC-gain checks are implemented through an additive check adapter. Existing check evaluation is delegated unchanged to the original evaluator.
- Reference code and calculator results can be shared using the existing installed file-system/sharing modules. C++/Python snippets are reference material, not compiled/run in the app.

### Engineering tools

- Eight calculators: Ohm’s law, LED current limiting, loaded/tolerance-aware dividers, RC timing/cutoff, 555 astable timing, ADC conversion, linear-regulator heat, and I²C pull-up estimates.
- Seven Boolean models with interactive inputs and truth tables: AND, NAND, OR, NOR, XOR, XNOR, NOT.
- Common 40-pin Pi SBC header explorer with physical/BCM numbering, power/ground identification, alternate-function labels, and 3.3 V safety guidance.

## Preserved

- Existing theme, spacing, typography, cards, controls, home tiles, workbench layout, touch gestures, animation/rendering, inspector, and instrument UI.
- All 37 original lesson objects, IDs, build functions, hints, and checks, plus all 6 original challenge objects. Regression tests explicitly assert original object identity.
- Simulation core, renderer, controller, existing circuit editing/history/autosave, circuit import/export, and native sharing helpers.
- Existing circuits and progress; the database schema and platform storage implementations are unchanged.
- `package.json`, lockfile, dependencies, scripts, `app.json`, `eas.json`, package identifiers, signing configuration, and native project generation configuration.
- The pre-existing user change to `tsconfig.json` was not edited.
- Next.js/web application files were not changed during this mobile update.

## Files

### Small integration edits

- `src/app/_layout.tsx`: registers the explanation and engineering-tools routes.
- `src/app/index.tsx`: updates curriculum counts; counts completed lessons rather than unrelated quiz entries. The tile layout is unchanged.
- `src/app/learn/index.tsx`: adds new curriculum data and search/filter/sort controls using existing mobile components.
- `src/app/learn/[id].tsx`: preserves original interactive lesson lookup through the adapter and supports new hardware guides.
- `src/app/quiz/[unit].tsx`: makes the new unit quizzes available without changing the quiz screen or scoring flow.
- `src/components/Workbench.tsx`: supports additive check types, the new lesson sequence, and optional explanation actions. Existing canvas/instruments/control behavior is untouched.

### New modules

- `src/model/learning/`: typed additional content, foundations, curriculum adapter, calculators, logic, GPIO reference, check adapter, explanations, and filtering.
- `src/components/LessonStudy.tsx`, `src/components/LearningPlaygrounds.tsx`: mobile-native educational pages/components using the existing theme and UI primitives.
- `src/app/learn/study/[id].tsx`, `src/app/tools.tsx`: Expo Router screens.
- `src/store/learning.ts`: bookmark and guide-checklist/answer persistence in separate keys in the existing KV store. No notebook/notes data.
- `src/lib/learningShare.ts`, `src/lib/learningShare.web.ts`: separate educational-text sharing helpers, without modifying existing circuit exports.
- `src/model/__tests__/learning.test.ts`, `src/model/__tests__/learningTools.test.ts`, `src/store/__tests__/learning.test.ts`: 70 new regression tests.

The new content is a typed port of the web teaching content, not a mobile import of Next.js or browser modules. The original shared lesson registry remains unmodified to prevent duplicate additions or regressions in either frontend.

## Validation

- Mobile lint and TypeScript checks pass.
- All 310 Jest tests pass across 18 suites: the existing 240 and 70 new tests.
- Android and iOS Metro/Hermes bundle exports succeed.
- Expo-rendered screen smoke checks at a phone-sized viewport verified curriculum counts, Pi guide rendering/numbering, persisted guide completion/bookmarks, calculator output, Boolean logic, and round-trip/switching navigation between existing circuits and explanation pages. No page errors were observed.
- The unchanged Next.js frontend also passes its build, lint, 20 unit tests, and 77 browser tests.
- Bundle export and browser-based Expo checks are not the same as testing installation on a physical Android/iOS device.

## Installable build

Uses the existing Android `preview` EAS profile (internal distribution, APK), existing project, package identifier, and existing remote keystore. No EAS configuration changes were required.

- Build ID: `f75a8ba1-4122-44a5-8283-c468cb23da40`
- Build/install/QR page: https://expo.dev/accounts/vaikruta/projects/bench/builds/f75a8ba1-4122-44a5-8283-c468cb23da40
- Status: **FINISHED** on 2026-10-31 at 10:20 UTC.
- Direct APK: https://expo.dev/artifacts/eas/LcOJBOEl_UFz-yp3wRPHpHoQ2fJN83Ax7791G3NSiaE.apk
- Download verified: HTTP 200, 166,406,981 bytes (approximately 166 MB).
- App identifier/version: `app.bench.lab`, `1.2.0`.
- Internal build expiration shown by EAS: 2026-11-14.

Open the build page for the install/QR option, or open the direct APK URL on Android. Allow installation from your browser if Android asks. Install over the existing same-signed Bench app rather than uninstalling it if you want to keep its local circuits and progress. Physical-device installation has not been tested from this environment.

An Android APK installs on Android, not iPhone. iPhone distribution requires a separate signed iOS build and registered devices or TestFlight.
