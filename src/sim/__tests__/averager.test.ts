import { NetlistBuilder } from '@sim/builder';
import { led } from '@sim/models';
import { Simulator } from '@sim/simulator';
import { ReadingAverager } from '../averager';
import { damp, resetDamping } from '../smooth';

/** Run like the app: 1/60 s frames, readings published every 40 ms. Returns one value per frame. */
function frames(sim: Simulator, seconds: number, pick: (avg: ReadingAverager, sim: Simulator) => number, instantaneous = false): number[] {
  const avg = new ReadingAverager(
    sim.devices.map((d) => d.id),
    sim.nodeCount,
  );
  sim.startTransient();
  avg.sample(sim);
  const out: number[] = [];
  let nextPublish = 0.04;
  while (sim.t < seconds) {
    sim.advance(sim.t + 1 / 60, { onStep: (s) => (instantaneous ? undefined : avg.sample(s)) });
    if (sim.t >= nextPublish) {
      nextPublish += 0.04;
      if (instantaneous) {
        avg.reset();
        avg.sample(sim);
      }
      out.push(pick(avg, sim));
      avg.reset();
    }
  }
  return out;
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe('display averaging (no aliasing glitches)', () => {
  const acCircuit = () => new Simulator(new NetlistBuilder().V('AC', 'a', '0', 0, { wave: 'sine', amp: 12, freq: 50, r: 0.5 }).R('R1', 'a', '0', 1000).build(), { maxStep: 1 / 240 });

  test('a 50 Hz source reads a steady RMS instead of random instantaneous values', () => {
    const rms = frames(acCircuit(), 2, (a, s) => a.reading(s, 'R1')!.vrms).slice(5);
    const mean = frames(acCircuit(), 2, (a, s) => a.reading(s, 'R1')!.v).slice(5);
    // frame averages: each frame holds 1.7 or 2.5 cycles, so they are close but not exact
    expect(spread(rms)).toBeLessThan(0.8);
    expect(Math.max(...mean.map(Math.abs))).toBeLessThan(2.5);
    // what the app used to show: samples at 25 Hz jump all over the ±12 V range
    const inst = frames(acCircuit(), 2, (a, s) => a.reading(s, 'R1')!.v, true).slice(5);
    expect(spread(inst)).toBeGreaterThan(5);
    // the numbers on screen are damped like a meter: steady to a few tens of millivolts
    resetDamping();
    const shown = rms.map((v, k) => damp('R1.vrms', v, k * 40)).slice(15);
    expect(spread(shown)).toBeLessThan(0.12);
    expect(Math.abs(shown[shown.length - 1] - 12 / Math.SQRT2)).toBeLessThan(0.3);
    const shownMean = mean.map((v, k) => damp('R1.v', v, k * 40)).slice(15);
    expect(Math.max(...shownMean.map(Math.abs))).toBeLessThan(0.6);
  });

  test('an LED driven by 1 kHz PWM shows a steady half brightness', () => {
    const pwm = () =>
      new Simulator(
        new NetlistBuilder()
          .V('PWM', 'p', '0', 0, { wave: 'pulse', amp: 5, freq: 1000, duty: 0.5 })
          .R('R1', 'p', 'a', 150)
          .add('D', 'D1', ['a', '0'], led('red'))
          .build(),
        { maxStep: 1 / 240 },
      );
    const b = frames(pwm(), 1, (a, s) => Number(a.reading(s, 'D1')!.extra?.brightness)).slice(3);
    const full = (5 - 1.9) / 150 / 0.02;
    expect(Math.abs(b[b.length - 1] - full / 2)).toBeLessThan(0.08);
    expect(spread(b)).toBeLessThan(0.05);
  });
});
