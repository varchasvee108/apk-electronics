import type { LearningCheck } from './types';
import type { CheckContext, CheckResult } from '../lessonCheck';
import { evaluate } from '../lessonCheck';
import type { Check } from '../lessons';
export function originalChecks(checks: LearningCheck[]): Check[] {
  return checks.filter((c): c is Check => c.kind !== 'serialContains' && c.kind !== 'traceGain' && c.kind !== 'extraText');
}
export function evaluateLearningCheck(check: LearningCheck, ctx: CheckContext): CheckResult {
  return evaluateExtraCheck(check, ctx) ?? evaluate(check as Check, ctx);
}
export function evaluateExtraCheck(check: LearningCheck, ctx: CheckContext): CheckResult | null {
  if (check.kind === 'extraText') {
    const v = ctx.snap?.parts[check.part]?.extra?.[check.key];
    const text = typeof v === 'string' ? v : '';
    const ok = text.includes(check.includes);
    return { ok, detail: ok ? `Shows “${text.trim()}”` : ctx.snap ? `Shows “${text.trim() || '(nothing)'}”` : 'Power on to check' };
  }
  if (check.kind === 'serialContains') {
    const text = ctx.serial(check.part);
    return {
      ok: text.includes(check.text),
      detail: text.includes(check.text) ? 'Echo received' : `Run and send “${check.text}” in Serial monitor`,
    };
  }
  if (check.kind === 'traceGain') {
    const a = ctx.trace.ch.ch1 ?? [],
      b = ctx.trace.ch.ch2 ?? [];
    const pairs = a.map((v, i) => [v, b[i]]).filter(([v, w]) => typeof v === 'number' && typeof w === 'number' && Number.isFinite(v) && Number.isFinite(w));
    if (pairs.length < 20) return { ok: false, detail: 'Capture CH1 input and CH2 output first' };
    const mean = (j: number) => pairs.reduce((sum, pair) => sum + pair[j], 0) / pairs.length;
    const rms = (j: number) => {
      const m = mean(j);
      return Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[j] - m) ** 2, 0) / pairs.length);
    };
    const input = rms(0),
      gain = input > 1e-5 ? rms(1) / input : 0;
    return {
      ok: gain >= check.min && gain <= check.max,
      detail: input > 1e-5 ? `AC magnitude ratio ${gain.toFixed(2)}× (captured window)` : 'Need a changing input waveform',
    };
  }
  return null;
}
