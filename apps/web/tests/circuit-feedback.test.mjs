import { test } from "node:test";
import assert from "node:assert/strict";
import { circuitFeedback, flowStyle } from "../src/lib/circuit-feedback.mjs";

test("Run alone cannot claim a first lesson is working", () => {
  const lesson = { id: "first-circuit" };
  assert.equal(
    circuitFeedback({ status: "running", lesson, snapshot: null }).kind,
    "idle",
  );
  const snapshot = { parts: { r1: { i: 0 } }, wireI: {} };
  assert.equal(
    circuitFeedback({ status: "running", lesson, snapshot }).kind,
    "warning",
  );
  snapshot.parts.r1.i = 0.009;
  assert.equal(
    circuitFeedback({
      status: "running",
      lesson,
      snapshot,
      checks: [{ ok: false }],
    }).kind,
    "active",
  );
  assert.equal(
    circuitFeedback({
      status: "running",
      lesson,
      snapshot,
      checks: [{ ok: true }],
    }).kind,
    "working",
  );
});
test("flow is measured, signed, paused, and supports AC with zero mean", () => {
  assert.equal(flowStyle(0, true), null);
  assert.equal(flowStyle(NaN, true), null);
  assert.equal(flowStyle(0.009, true).animationDirection, "normal");
  assert.equal(flowStyle(-0.009, true).animationDirection, "reverse");
  assert.equal(flowStyle(0.009, false).animationPlayState, "paused");
  assert.equal(flowStyle(0, true, 0.01).animationDirection, "alternate");
  assert.equal(flowStyle(0, true, 0), null);
});
test("damage and solver errors override success and stale readings", () => {
  const data = {
    status: "running",
    lesson: { id: "first-circuit" },
    checks: [{ ok: true }],
    snapshot: { parts: { r1: { i: 0.009, failed: true } } },
  };
  assert.equal(circuitFeedback(data).kind, "warning");
  assert.equal(
    circuitFeedback({ ...data, status: "error" }).title,
    "Simulation needs attention",
  );
  assert.equal(circuitFeedback({ ...data, status: "paused" }).kind, "idle");
});
test("generic current activity is not a claim that arbitrary wiring is correct", () => {
  const result = circuitFeedback({
    status: "running",
    snapshot: { parts: { r: { i: 0.001 } } },
  });
  assert.equal(result.title, "Current detected");
  assert.notEqual(result.kind, "working");
  const ac = circuitFeedback({
    status: "running",
    snapshot: { parts: { r: { i: 0, irms: 0.003 } } },
  });
  assert.equal(ac.kind, "active");
});
