import {
  LESSONS as MOBILE_LESSONS,
  UNITS as MOBILE_UNITS,
  CHALLENGES as SHARED_CHALLENGES,
} from "@/model/lessons";
import { EXAMPLES } from "@/model/examples";
import { QUIZZES as SHARED_QUIZZES } from "@/model/quizzes";
import { DocBuilder, WIRE } from "@/model/build";
import { partDef, pinPositions } from "@/model/parts";
import { STARTER_PROGRAMS } from "@sim/avr/programs";
import { assemble } from "@sim/avr/assembler";
import { FOUNDATIONS } from "@web/content/foundations.mjs";
import { WEB_LESSONS, WEB_UNITS, TRACKS } from "@web/content/web-lessons.mjs";

export { TRACKS };
const unitTrack = (unit) =>
  ["u10", "u12", "u13", "u14", "u15"].includes(unit)
    ? "ics"
    : ["u16", "u18"].includes(unit)
      ? "arduino"
      : unit === "u17"
        ? "engineering"
        : "fundamentals";
export const UNITS = [
  ...MOBILE_UNITS.map((u) => ({ ...u, track: unitTrack(u.id) })),
  ...WEB_UNITS,
];
export const QUIZZES = {
  ...SHARED_QUIZZES,
  ...Object.fromEntries(
    WEB_UNITS.map((u) => [
      u.id,
      WEB_LESSONS.filter((l) => l.unit === u.id)
        .flatMap((l) => l.questions)
        .slice(0, 4),
    ]),
  ),
};

function gateCircuit(chipType, title) {
  const b = new DocBuilder(title, "none");
  b.part("supply", { x: 5, y: 2 }, { id: "src", props: { vset: 5 } });
  b.part("ground", { x: 9, y: 2 }, { id: "gnd" });
  b.part(chipType, { x: 25, y: 10 }, { id: "u1" });
  const p = b.doc.parts.find((p) => p.id === "u1");
  const pins = pinPositions(p);
  const pin = (name) => pins.find((p) => p.name === name);
  const high = { x: 5, y: 2 },
    low = { x: 9, y: 2 };
  b.wire(high, pin("VCC"), WIRE.red).wire(low, pin("GND"), WIRE.black);
  for (const [id, label, y, input] of [
    ["s1", "A", 14, "1A"],
    ["s2", "B", 22, "1B"],
  ]) {
    b.part("toggle", { x: 8, y }, { id, label });
    b.wire({ x: 8, y }, low, WIRE.black)
      .wire({ x: 10, y }, high, WIRE.red)
      .wire({ x: 9, y }, pin(input), WIRE.blue);
  }
  for (const p of pins)
    if (/^[234][AB]$/.test(p.name)) b.wire(p, low, WIRE.black);
  b.probe("ch1", pin("1A"))
    .probe("ch2", pin("1Y"))
    .probe("dmm+", pin("1Y"))
    .probe("dmm-", low);
  return b.build("web-lesson");
}
function arduinoCircuit(programId, title) {
  const program = STARTER_PROGRAMS.find((p) => p.id === programId);
  if (!program) throw new Error(`Unknown AVR program: ${programId}`);
  const b = new DocBuilder(title, "none");
  b.part(
    "arduino",
    { x: 20, y: 20 },
    {
      id: "uno",
      props: {
        program: program.id,
        source: program.asm,
        hex: assemble(program.asm).hex,
      },
    },
  );
  b.part("ground", { x: 29, y: 20 }, { id: "gnd" });
  if (programId === "fade") {
    b.part("resistor", { x: 30, y: 6 }, { id: "r1", props: { r: 330 } });
    b.part("led", { x: 40, y: 6 }, { id: "d1", props: { color: "green" } });
    b.wire({ x: 34, y: 20 }, { x: 30, y: 6 }, WIRE.orange)
      .wire({ x: 34, y: 6 }, { x: 40, y: 6 }, WIRE.blue)
      .wire({ x: 41, y: 6 }, { x: 29, y: 20 }, WIRE.black);
    b.probe("ch1", { x: 34, y: 20 }).probe("ch2", { x: 40, y: 6 });
  }
  return b.build("web-lesson");
}
export function buildWebExperiment(lesson) {
  const e = lesson.experiment;
  if (!e)
    throw new Error("This lesson is a hardware guide, not a simulated board.");
  let doc;
  if (e.kind === "gate") doc = gateCircuit(e.chip, lesson.title);
  else if (e.kind === "arduino") doc = arduinoCircuit(e.program, lesson.title);
  else {
    const template = (e.kind === "lesson" ? MOBILE_LESSONS : EXAMPLES).find(
      (l) => l.id === e.id,
    );
    if (!template) throw new Error(`Unknown experiment template: ${e.id}`);
    doc = template.build();
  }
  doc.parts = doc.parts.map((p) => ({
    ...p,
    props: { ...p.props, ...(e.patches?.[p.id] ?? {}) },
  }));
  doc.name = lesson.title;
  return doc;
}
const noDamage = { kind: "noDamage", label: "Nothing is damaged" };
function webChecks(l) {
  if (l.experiment?.kind === "gate") {
    const nand = l.truth === "nand";
    return [
      {
        kind: "prop",
        part: "s1",
        key: "pos",
        equals: true,
        label: "Input A is high",
      },
      {
        kind: "prop",
        part: "s2",
        key: "pos",
        equals: nand,
        label: `Input B is ${nand ? "high" : "low"}`,
      },
      {
        kind: "dmm",
        min: nand ? -0.1 : 3.8,
        max: nand ? 0.2 : 5.1,
        label: `Measured output is ${nand ? "low" : "high"}`,
      },
      noDamage,
    ];
  }
  if (l.id === "ic-555-inside")
    return [
      {
        kind: "f555",
        min: 1.8,
        max: 2.3,
        label: "Timing components predict about 2 Hz",
      },
      {
        kind: "blinks",
        part: "d555",
        min: 2,
        label: "Observe at least two LED rising states",
      },
      noDamage,
    ];
  if (l.id === "ic-feedback")
    return [
      {
        kind: "traceGain",
        min: 4.1,
        max: 5.3,
        label: "Measured AC gain magnitude is approximately 4.7",
      },
      noDamage,
    ];
  if (l.id === "ic-regulator")
    return [
      { kind: "dmm", min: 4.8, max: 5.2, label: "Output voltage is near 5 V" },
      noDamage,
    ];
  if (l.id === "ic-595-latch")
    return MOBILE_LESSONS.find((l) => l.id === "shift-register").checks;
  if (l.id === "arduino-pwm")
    return [
      {
        kind: "extra",
        part: "d1",
        key: "brightness",
        min: 0.05,
        max: 2,
        label: "LED receives PWM-driven current",
      },
      { kind: "probe", probe: "ch1", label: "Probe is placed at D9" },
      noDamage,
    ];
  if (l.id === "arduino-adc")
    return [
      {
        kind: "prop",
        part: "rv1",
        key: "pos",
        min: 0.7,
        max: 0.8,
        label: "Knob is near 75%",
      },
      {
        kind: "serialAbove",
        part: "uno",
        value: 730,
        label: "ADC reports a code above 730",
      },
      noDamage,
    ];
  if (l.id === "arduino-serial")
    return [
      {
        kind: "serialContains",
        part: "uno",
        text: "Bench",
        label: "Send “Bench” and receive the echo",
      },
      noDamage,
    ];
  if (l.id === "arduino-servo")
    return [
      {
        kind: "extra",
        part: "sv1",
        key: "angle",
        min: 70,
        max: 110,
        label: "Observe the servo near mid-travel",
      },
      noDamage,
    ];
  return [];
}

export const LESSONS = [
  ...[...MOBILE_LESSONS, ...SHARED_CHALLENGES].map((l) => {
    const f = FOUNDATIONS[l.unit] ?? FOUNDATIONS.challenge;
    return {
      ...l,
      mode: "simulation",
      track: unitTrack(l.unit),
      level: Number(l.unit.slice(1)) >= 10 ? "Intermediate" : "Beginner",
      prerequisites: l.id === "first-circuit" ? [] : ["first-circuit"],
      mechanism: f.model,
      equation: f.equation,
      worked: f.worked,
      observe: f.observe,
      mistake: f.mistake,
      questions: [
        {
          q: f.question[0],
          options: f.question[1],
          answer: f.question[2],
          why: f.question[3],
        },
      ],
      steps: l.intro.map((action, i) => ({
        action: action
          .replace(/then press Power\./g, "then run the circuit.")
          .replace(/drag from a hole/g, "click a hole"),
        why: i === 0 ? f.model : i === 1 ? f.observe : f.mistake,
      })),
    };
  }),
  ...WEB_LESSONS.map((l) => ({
    ...l,
    track: WEB_UNITS.find((u) => u.id === l.unit).track,
    mechanism: l.intro[0],
    checks: webChecks(l),
    hints: l.steps.map((s) => s.why),
    build: l.experiment ? () => buildWebExperiment(l) : undefined,
  })),
];
export const lessonHref = (l) => `/learn/${l.id}`;
export const findLesson = (id) => LESSONS.find((l) => l.id === id);
export const nextLesson = (lesson) => {
  const ls = LESSONS.filter((l) => l.track === lesson.track && !l.challenge);
  return ls[ls.findIndex((l) => l.id === lesson.id) + 1];
};
export function lessonParts(lesson) {
  if (!lesson.build) return [];
  const doc = lesson.build();
  return [...new Set(doc.parts.map((p) => p.type))].map((type) => ({
    type,
    name: partDef(type).name,
    count: doc.parts.filter((p) => p.type === type).length,
  }));
}
