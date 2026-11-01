import { test } from "node:test";
import assert from "node:assert/strict";
import { WEB_LESSONS, WEB_UNITS, TRACKS } from "../src/content/web-lessons.mjs";
import { FOUNDATIONS } from "../src/content/foundations.mjs";
import { GPIO_PINS } from "../src/content/gpio.mjs";
import { calculate, CALCULATORS } from "../src/lib/calculators.mjs";
import { evaluateExtraCheck } from "../src/lib/learning-checks.mjs";
import { explainLive } from "../src/lib/live-explanation.mjs";
import {
  loadWorkspace,
  saveWorkspace,
  STORAGE_KEY,
} from "../src/lib/storage.mjs";

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );

test("new learning library has complete, coherent web-only teaching records", () => {
  assert.equal(WEB_LESSONS.length, 30);
  assert.equal(new Set(WEB_LESSONS.map((l) => l.id)).size, WEB_LESSONS.length);
  for (const lesson of WEB_LESSONS) {
    assert.ok(WEB_UNITS.some((u) => u.id === lesson.unit));
    for (const key of ["goal", "worked", "observe", "mistake"])
      assert.ok(lesson[key]?.length > 20, `${lesson.id}: missing ${key}`);
    assert.ok(lesson.equation?.length > 5);
    assert.ok(lesson.intro.length >= 2);
    assert.ok(lesson.steps.length >= 3);
    for (const step of lesson.steps)
      assert.ok(step.action.length > 10 && step.why.length > 10);
    assert.ok(lesson.questions.length > 0);
    for (const q of lesson.questions) {
      assert.ok(q.options[q.answer]);
      assert.ok(q.why.length > 20);
    }
    assert.equal(lesson.mode, lesson.experiment ? "simulation" : "guide");
    for (const resource of lesson.resources ?? [])
      assert.match(resource.url, /^https:\/\//);
  }
  assert.ok(TRACKS.some((t) => t.id === "raspberry-pi"));
  for (const lesson of WEB_LESSONS.filter((l) => l.unit.startsWith("w-pi")))
    assert.equal(lesson.mode, "guide");
});

test("every original electronics unit has a reasoning layer and worked example", () => {
  for (let i = 1; i <= 18; i++) {
    const f = FOUNDATIONS[`u${i}`];
    assert.ok(f.model.length > 80);
    assert.ok(f.worked.length > 40);
    assert.ok(f.observe.length > 30);
    assert.ok(f.question[1][f.question[2]]);
  }
});

test("all 40 header positions exist, with power and BCM numbering separated", () => {
  assert.equal(GPIO_PINS.length, 40);
  assert.equal(new Set(GPIO_PINS.map((p) => p.physical)).size, 40);
  assert.equal(GPIO_PINS[10].bcm, 17);
  assert.equal(GPIO_PINS[16].kind, "power3");
  assert.equal(GPIO_PINS[1].kind, "power5");
  assert.equal(GPIO_PINS[25].bcm, 7);
  assert.equal(GPIO_PINS.filter((p) => p.kind === "ground").length, 8);
  assert.equal(
    new Set(GPIO_PINS.filter((p) => p.bcm !== undefined).map((p) => p.bcm))
      .size,
    28,
  );
});

test("Ohm, LED, RC, ADC and regulator predictions match analytic results", () => {
  near(calculate("ohm", { v: 9, r: 1000 })[0].value, 0.009);
  near(calculate("ohm", { v: 9, r: 1000 })[1].value, 0.081);
  near(calculate("led", { vs: 3.3, vf: 2, i: 0.004 })[0].value, 325);
  near(calculate("rc", { r: 10000, c: 100e-6 })[0].value, 1);
  assert.equal(calculate("adc", { vin: 2.5, ref: 5, bits: 10 })[0].value, 512);
  near(calculate("regulator", { vin: 12, vout: 5, i: 0.1 })[0].value, 0.7);
});

test("divider loading and worst-case tolerance have the correct direction", () => {
  const n = { vin: 9, top: 10000, bottom: 10000, load: 0, tolerance: 5 };
  const outputs = calculate("divider", n);
  near(outputs[0].value, 4.5);
  near(outputs[2].value, 4.275);
  near(outputs[3].value, 4.725);
  assert.ok(calculate("divider", { ...n, load: 1000 })[0].value < 4.5);
});

test("555 timing and I2C rise estimate use the stated equations", () => {
  const results = calculate("timer", { r1: 10000, r2: 68000, c: 10e-6 });
  near(results[0].value, 1 / (Math.log(2) * 146000 * 10e-6));
  near(results[1].value, (100 * 78000) / 146000);
  near(
    calculate("pullup", { r: 4700, c: 100e-12, v: 3.3 })[0].value,
    0.8473 * 4700 * 100e-12,
  );
  assert.equal(CALCULATORS.length, 8);
});

test("calculators reject impossible, nonfinite, and dangerous range assumptions", () => {
  assert.throws(() => calculate("ohm", { v: 9, r: 0 }), /greater/);
  assert.throws(() => calculate("led", { vs: 1, vf: 2, i: 0.02 }), /exceed/);
  assert.throws(
    () => calculate("adc", { vin: 6, ref: 5, bits: 10 }),
    /exceeds/,
  );
  assert.throws(
    () => calculate("adc", { vin: 2, ref: 5, bits: 2.5 }),
    /integer/,
  );
  assert.throws(
    () =>
      calculate("divider", {
        vin: 9,
        top: 1,
        bottom: 1,
        load: 0,
        tolerance: 100,
      }),
    /below/,
  );
  assert.throws(() => calculate("rc", { r: Infinity, c: 1 }), /finite/);
});

test("web checks measure serial echo and captured gain rather than marking static content complete", () => {
  assert.equal(
    evaluateExtraCheck(
      { kind: "serialContains", part: "uno", text: "Bench" },
      { serial: () => "" },
    ).ok,
    false,
  );
  assert.equal(
    evaluateExtraCheck(
      { kind: "serialContains", part: "uno", text: "Bench" },
      { serial: () => "Bench\n" },
    ).ok,
    true,
  );
  const a = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.1));
  const ctx = { trace: { ch: { ch1: a, ch2: a.map((v) => v * -4.7) } } };
  assert.equal(
    evaluateExtraCheck({ kind: "traceGain", min: 4.6, max: 4.8 }, ctx).ok,
    true,
  );
  assert.equal(
    evaluateExtraCheck(
      { kind: "traceGain", min: 4.6, max: 4.8 },
      { trace: { ch: { ch1: Array(40).fill(0), ch2: Array(40).fill(1) } } },
    ).ok,
    false,
  );
  assert.equal(evaluateExtraCheck({ kind: "dmm" }, ctx), null);
});

test("live explanations distinguish predictions from measured evidence", () => {
  const lesson = { truth: "nand", observe: "Look at output" };
  const doc = {
    parts: [
      { id: "s1", props: { pos: true } },
      { id: "s2", props: { pos: true } },
    ],
  };
  assert.match(
    explainLive(lesson, doc, { dmm: { v: 0 } }).title,
    /predicted Y=0/,
  );
  assert.match(
    explainLive(lesson, doc, { dmm: { v: 0 } }).evidence,
    /Measured/,
  );
  assert.match(explainLive(lesson, doc, null).evidence, /No live measurement/);
});

test("existing saved circuits migrate without losing data and notebooks persist", () => {
  const circuit = {
    schema: 1,
    id: "saved",
    name: "Old circuit",
    parts: [],
    wires: [],
  };
  const data = {
    circuits: [circuit],
    completed: ["first-circuit"],
    quizzes: { u1: 3 },
  };
  const map = new Map([[STORAGE_KEY, JSON.stringify(data)]]);
  const storage = {
    getItem: (k) => map.get(k),
    setItem: (k, v) => map.set(k, v),
  };
  const migrated = loadWorkspace(storage);
  assert.deepEqual(migrated.circuits, [circuit]);
  assert.deepEqual(migrated.bookmarks, []);
  assert.deepEqual(migrated.learning, {});
  migrated.bookmarks = ["pi-gpio"];
  migrated.learning = {
    "pi-gpio": {
      notes: "BCM17 is physical 11",
      prediction: "3.3 V logic",
      steps: [0, 1],
      answers: { 0: 1 },
    },
  };
  assert.equal(saveWorkspace(storage, migrated), null);
  assert.deepEqual(loadWorkspace(storage), migrated);
});
