export function evaluateExtraCheck(check, ctx) {
  if (check.kind === "serialContains") {
    const text = ctx.serial(check.part);
    return {
      ok: text.includes(check.text),
      detail: text.includes(check.text)
        ? "Echo received"
        : `Run and send “${check.text}” in Serial monitor`,
    };
  }
  if (check.kind === "traceGain") {
    const a = ctx.trace.ch.ch1 ?? [],
      b = ctx.trace.ch.ch2 ?? [];
    const pairs = a
      .map((v, i) => [v, b[i]])
      .filter(
        ([v, w]) =>
          typeof v === "number" &&
          typeof w === "number" &&
          Number.isFinite(v) &&
          Number.isFinite(w),
      );
    if (pairs.length < 20)
      return { ok: false, detail: "Capture CH1 input and CH2 output first" };
    const mean = (j) =>
      pairs.reduce((sum, pair) => sum + pair[j], 0) / pairs.length;
    const rms = (j) => {
      const m = mean(j);
      return Math.sqrt(
        pairs.reduce((sum, pair) => sum + (pair[j] - m) ** 2, 0) / pairs.length,
      );
    };
    const input = rms(0),
      gain = input > 1e-5 ? rms(1) / input : 0;
    return {
      ok: gain >= check.min && gain <= check.max,
      detail:
        input > 1e-5
          ? `AC magnitude ratio ${gain.toFixed(2)}× (captured window)`
          : "Need a changing input waveform",
    };
  }
  return null;
}
