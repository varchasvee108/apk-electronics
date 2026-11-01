/**
 * Tiny procedural sound synthesis: 16-bit mono PCM WAV files for the buzzer tone and event sounds.
 * Everything is generated on the device, so the app ships no audio assets.
 */

export const SAMPLE_RATE = 22050;

export type Effect = 'pop' | 'click' | 'chime' | 'crack';

function wavBytes(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(buf);
}

/** Buzzers sound harsh: a square-ish wave built from a few odd harmonics. */
function buzz(phase: number): number {
  return Math.sin(phase) + Math.sin(3 * phase) / 3 + Math.sin(5 * phase) / 5 + Math.sin(7 * phase) / 7;
}

/**
 * A seamlessly looping tone near `freq`: a whole number of cycles in about 0.25 s, so looping the file
 * has no click. Returns the WAV bytes and the exact frequency used.
 */
export function toneWav(freq: number, amplitude = 0.22): { bytes: Uint8Array; freq: number } {
  const f0 = Math.max(40, Math.min(9000, freq));
  const cycles = Math.max(1, Math.round(f0 * 0.25));
  const n = Math.max(1, Math.round((cycles * SAMPLE_RATE) / f0));
  const f = (cycles * SAMPLE_RATE) / n;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * 0.8 * buzz((2 * Math.PI * f * i) / SAMPLE_RATE);
  return { bytes: wavBytes(out), freq: f };
}

/** Deterministic noise so the effects sound the same every time. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

export function effectWav(e: Effect): Uint8Array {
  const rnd = noise(e.length * 7919);
  const len = { pop: 0.22, click: 0.03, chime: 0.7, crack: 0.12 }[e];
  const n = Math.round(len * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    switch (e) {
      case 'pop':
        // a capacitor or fuse letting go: thump plus a noise burst
        out[i] = 0.7 * Math.exp(-t * 28) * (0.6 * rnd() + 0.5 * Math.sin(2 * Math.PI * 90 * t));
        break;
      case 'click':
        // relay / switch contacts
        out[i] = 0.5 * Math.exp(-t * 400) * (rnd() * 0.5 + Math.sin(2 * Math.PI * 1800 * t));
        break;
      case 'crack':
        // a part burning out
        out[i] = 0.55 * Math.exp(-t * 45) * rnd() * (Math.sin(2 * Math.PI * 30 * t) > 0 ? 1 : 0.4);
        break;
      case 'chime': {
        // goal reached: two soft bell notes
        const a = Math.exp(-t * 5) * Math.sin(2 * Math.PI * 784 * t);
        const b = t > 0.12 ? Math.exp(-(t - 0.12) * 5) * Math.sin(2 * Math.PI * 1175 * (t - 0.12)) : 0;
        out[i] = 0.25 * (a + b) * Math.min(1, t * 200);
        break;
      }
    }
  }
  return wavBytes(out);
}

/** Round a frequency to the nearest semitone (so a handful of tone files covers every pitch). */
export function semitone(freq: number): number {
  const k = Math.round(12 * Math.log2(Math.max(20, freq) / 440));
  return 440 * Math.pow(2, k / 12);
}
