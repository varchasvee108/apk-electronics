import { Simulator } from "@sim/simulator";
import { extractNetlist, nodeAt } from "@/model/netlist";
import { ReadingAverager } from "@/sim/averager";
import { buildSnapshot, wireCurrents, partPinCurrents } from "@/sim/snapshot";
import { evaluate, remember, newMemory } from "@/model/lessonCheck";
import { LESSONS } from "@web/lib/curriculum";
import { evaluateExtraCheck } from "@web/lib/learning-checks.mjs";

let doc,
  ex,
  sim,
  avg,
  lesson,
  memory = newMemory();
let running = false,
  timer,
  revision = 0,
  speed = 1;
let trace = { t: [], ch: {} };
let wireSq = {},
  wireSamples = 0,
  sampleCount = 0;
const channels = [
  "ch1",
  "ch2",
  "ch3",
  "ch4",
  ...Array.from({ length: 8 }, (_, i) => `la${i}`),
];

function publish() {
  if (!sim) return;
  const wireRms = Object.fromEntries(
    Object.entries(wireSq).map(([id, sq]) => [id, Math.sqrt(sq / wireSamples)]),
  );
  const snap = buildSnapshot(sim, doc, ex, avg, wireRms);
  const serial = Object.fromEntries(
    doc.parts
      .filter((p) => p.type === "arduino")
      .map((p) => [p.id, sim.device(p.id)?.rt?.serial ?? ""]),
  );
  const ctx = {
    doc,
    snap,
    ex,
    mem: memory,
    trace,
    serial: (id) => serial[id] ?? "",
  };
  if (lesson) remember(lesson.checks, ctx);
  const checks = lesson
    ? lesson.checks.map((c) => ({
        label: c.label,
        ...(evaluateExtraCheck(c, ctx) ?? evaluate(c, ctx)),
      }))
    : [];
  self.postMessage({
    type: "snapshot",
    revision,
    snap,
    trace,
    checks,
    serial,
    diagnostics: [...sim.topology, ...sim.liveDiagnostics()],
    running,
  });
  avg.reset();
  wireSq = {};
  wireSamples = 0;
}
function fail(error) {
  running = false;
  clearTimeout(timer);
  self.postMessage({
    type: "error",
    revision,
    message:
      error?.message ||
      "Simulation could not converge. Check your connections and ground.",
  });
}
function tick(single = false) {
  if (!sim || (!running && !single)) return;
  try {
    const end = sim.t + (single ? 0.001 : 0.04 * speed);
    const deadline = performance.now() + 12;
    let count = 0;
    while (sim.t < end && performance.now() < deadline && count++ < 2500) {
      sim.step(end);
      const latest = avg.sample(sim);
      if (++sampleCount % 7 === 0 || wireSamples === 0) {
        const currents = wireCurrents(
          doc,
          ex,
          partPinCurrents(doc, ex, (id) => latest.get(id) ?? null),
        );
        for (const [id, current] of Object.entries(currents))
          wireSq[id] = (wireSq[id] ?? 0) + current * current;
        wireSamples++;
      }
      trace.t.push(sim.t);
      for (const ch of channels) {
        const node = doc.probes[ch] ? nodeAt(ex, doc.probes[ch]) : undefined;
        (trace.ch[ch] ??= []).push(
          node === undefined ? null : sim.nodeVoltage(node),
        );
      }
      if (sim.error) throw new Error(sim.error.message);
    }
    if (trace.t.length > 3000) {
      const cut = trace.t.length - 2000;
      trace.t.splice(0, cut);
      for (const values of Object.values(trace.ch)) values.splice(0, cut);
    }
    publish();
    if (running) timer = setTimeout(tick, 28);
  } catch (error) {
    fail(error);
  }
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === "load") {
      clearTimeout(timer);
      const prev = sim,
        oldEx = ex;
      const wasRunning = running;
      sim = null;
      doc = data.doc;
      revision = data.revision;
      ex = extractNetlist(doc);
      wireSq = {};
      wireSamples = 0;
      sampleCount = 0;
      if (ex.errors.length)
        throw new Error(ex.errors.map((e) => e.message).join("; "));
      if (ex.netlist.nodeNames.length > 300)
        throw new Error(
          "This circuit is too large for the browser solver (300 nodes maximum).",
        );
      sim = new Simulator(ex.netlist, { failures: true });
      if (prev && !data.reset)
        sim.adoptFrom(prev, (n) => {
          const point = ex.netPoints[n]?.[0];
          return point ? nodeAt(oldEx, point) : undefined;
        });
      else {
        sim.startTransient();
        trace = { t: [], ch: {} };
        memory = newMemory();
      }
      lesson = LESSONS.find((l) => l.id === data.lesson);
      avg = new ReadingAverager(
        sim.devices.map((d) => d.id),
        sim.nodeCount,
      );
      avg.trackPair(
        doc.probes["dmm+"] ? (nodeAt(ex, doc.probes["dmm+"]) ?? null) : null,
        doc.probes["dmm-"] ? (nodeAt(ex, doc.probes["dmm-"]) ?? null) : null,
      );
      running = data.reset ? false : wasRunning;
      if (running) tick();
      else self.postMessage({ type: "ready", revision });
    } else if (data.type === "run") {
      if (!sim || sim.error)
        throw new Error("Fix the circuit and reset before running it.");
      clearTimeout(timer);
      running = true;
      tick();
    } else if (data.type === "pause") {
      running = false;
      clearTimeout(timer);
      publish();
    } else if (data.type === "step") {
      running = false;
      clearTimeout(timer);
      tick(true);
    } else if (data.type === "speed") speed = data.value;
    else if (data.type === "serial") {
      sim?.device(data.id)?.writeSerial?.(data.text);
    } else if (data.type === "ac") {
      const input = doc.probes.ch1 ? nodeAt(ex, doc.probes.ch1) : undefined;
      const output = doc.probes.ch2 ? nodeAt(ex, doc.probes.ch2) : undefined;
      const source = ex.netlist.elements.find((e) =>
        ["funcgen", "V", "supply"].includes(e.type),
      );
      if (!source || input === undefined || output === undefined || input === 0)
        throw new Error(
          "Connect CH1 to the input and CH2 to the output, and add a signal source before running a sweep.",
        );
      const analyzer = new Simulator(ex.netlist, { failures: false });
      const result = analyzer.acSweep({
        fStart: 1,
        fStop: 1e6,
        pointsPerDecade: 20,
        sourceId: source.id,
      });
      const a = analyzer.acNode(result, ex.netlist.nodeNames[input]);
      const b = analyzer.acNode(result, ex.netlist.nodeNames[output]);
      self.postMessage({
        type: "ac",
        revision,
        result: {
          freqs: result.freqs,
          gain: b.mag.map(
            (m, i) =>
              20 * Math.log10(Math.max(1e-12, m / Math.max(1e-12, a.mag[i]))),
          ),
          phase: b.phase.map((p, i) => p - a.phase[i]),
        },
      });
    }
  } catch (error) {
    if (data.type === "ac")
      self.postMessage({ type: "ac-error", revision, message: error.message });
    else {
      if (data.type === "load") sim = null;
      fail(error);
    }
  }
};
