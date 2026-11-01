// Visual activity is based on solver readings, never simply on the Run button.
export const FLOW_THRESHOLD = 1e-6;
export function flowStyle(current, running, rms = 0) {
  if (!Number.isFinite(current)) return null;
  const amplitude = Math.max(Math.abs(current), Number.isFinite(rms) ? rms : 0);
  if (amplitude < FLOW_THRESHOLD) return null;
  return {
    animationDuration: `${Math.max(0.45, Math.min(2.5, 1.2 - 0.25 * Math.log10(amplitude / 0.001)))}s`,
    animationDirection:
      rms > FLOW_THRESHOLD && Math.abs(current) < rms * 0.1
        ? "alternate"
        : current < 0
          ? "reverse"
          : "normal",
    animationPlayState: running ? "running" : "paused",
  };
}
export function circuitFeedback({ snapshot, status, lesson, checks = [] }) {
  if (status === "error")
    return {
      kind: "warning",
      title: "Simulation needs attention",
      text: "Check the diagnostic message and connections, then reset.",
    };
  if (status !== "running")
    return {
      kind: "idle",
      title:
        status === "paused"
          ? "Paused — flow animation frozen"
          : "Ready to simulate",
      text:
        lesson?.id === "first-circuit"
          ? "This lesson needs + → R1 → −. Press Run to measure it, or use “Connect lesson wires” for a working example."
          : "Run to see measured current. Moving dots show conventional current, not electron speed.",
    };
  if (!snapshot)
    return {
      kind: "idle",
      title: "Starting simulation…",
      text: "Waiting for measured circuit readings.",
    };
  if (Object.values(snapshot.parts).some((p) => p.failed))
    return {
      kind: "warning",
      title: "A component is damaged",
      text: "Pause, correct the circuit, and reset/repair before continuing.",
    };
  if (lesson?.id === "first-circuit") {
    const current = Math.abs(snapshot.parts.r1?.i ?? 0);
    if (current < FLOW_THRESHOLD)
      return {
        kind: "warning",
        title: "Open loop — no resistor current",
        text: "Run is on, but R1 has no complete path back to the battery. Connect + rail → column 10 and column 14 → − rail.",
      };
    if (checks.length && checks.every((c) => c.ok))
      return {
        kind: "working",
        title: `Working loop · ${(current * 1000).toFixed(2)} mA`,
        text: "Lesson checks passed. The battery drives current through R1 and back to −. Dots follow measured conventional current.",
      };
    return {
      kind: "active",
      title: `R1 is conducting · ${(current * 1000).toFixed(2)} mA`,
      text: "Current is flowing. Compare the measured value with the 9 mA lesson target.",
    };
  }
  if (lesson && checks.length && checks.every((c) => c.ok))
    return {
      kind: "working",
      title: "Lesson checks passed",
      text: "The measured lesson targets are met. Moving dots indicate current; they do not certify hardware safety.",
    };
  const active = Object.values(snapshot.parts).some(
    (p) => Math.abs(p.i) >= FLOW_THRESHOLD || p.irms >= FLOW_THRESHOLD,
  );
  return {
    kind: active ? "active" : "idle",
    title: active ? "Current detected" : "Running — no visible current yet",
    text: active
      ? "Dots show measured conventional current. Check instruments and lesson targets to verify the arrangement."
      : "An open loop, an off switch, or a circuit waiting for input can draw little or no current. Run alone does not mean the wiring is correct.",
  };
}
