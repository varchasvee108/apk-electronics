import { usePrefs } from '@/store/prefs';
import { effectWav, semitone, type Effect } from './wav';

/**
 * Circuit sounds in the browser: Web Audio oscillator for buzzer tones, decoded WAV buffers for effects.
 * Browsers only allow audio after a user gesture; until then every call is a silent no-op.
 */

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
let toneF = 0;
const buffers = new Map<Effect, AudioBuffer>();

function audio(): Ctx | null {
  if (ctx) return ctx;
  const AC = (globalThis as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: new () => Ctx }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

const enabled = () => usePrefs.getState().sounds;

export function setTone(freq: number | null): void {
  const a = audio();
  if (!a) return;
  if (freq === null || !enabled()) {
    if (gain) gain.gain.setTargetAtTime(0, a.currentTime, 0.01);
    toneF = 0;
    return;
  }
  if (a.state === 'suspended') void a.resume().catch(() => undefined);
  const f = semitone(freq);
  if (!osc) {
    osc = a.createOscillator();
    osc.type = 'square';
    gain = a.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(a.destination);
    osc.start();
  }
  if (f !== toneF) osc.frequency.setValueAtTime(f, a.currentTime);
  gain?.gain.setTargetAtTime(0.05, a.currentTime, 0.01);
  toneF = f;
}

export function play(e: Effect): void {
  const a = audio();
  if (!a || !enabled()) return;
  if (a.state === 'suspended') void a.resume().catch(() => undefined);
  const start = (b: AudioBuffer) => {
    const src = a.createBufferSource();
    src.buffer = b;
    src.connect(a.destination);
    src.start();
  };
  const cached = buffers.get(e);
  if (cached) return start(cached);
  const bytes = effectWav(e);
  void a
    .decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    .then((b) => {
      buffers.set(e, b);
      start(b);
    })
    .catch(() => undefined);
}

export function stopAll(): void {
  setTone(null);
}
