import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { usePrefs } from '@/store/prefs';
import { effectWav, semitone, toneWav, type Effect } from './wav';

/**
 * Circuit sounds on Android / iOS: one looping tone for buzzers (pitch = the drive frequency, rounded to
 * a semitone) and short one-shot effects. The WAV files are synthesised once into the cache directory.
 */

let toneP: AudioPlayer | null = null;
let toneKey = '';
const fx = new Map<Effect, AudioPlayer>();
let ready = false;

function file(name: string, make: () => Uint8Array): string {
  const f = new File(Paths.cache, name);
  if (!f.exists) {
    f.create({ overwrite: true });
    f.writeSync(make());
  }
  return f.uri;
}

function init(): void {
  if (ready) return;
  ready = true;
  // respect the silent switch: a learning app should not beep in a quiet classroom
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
}

const enabled = () => usePrefs.getState().sounds;

/** Sound a continuous buzzer tone at `freq` Hz, or silence it with null. */
export function setTone(freq: number | null): void {
  try {
    if (freq === null || !enabled()) {
      if (toneP?.playing) toneP.pause();
      toneKey = '';
      return;
    }
    init();
    const f = semitone(freq);
    const key = f.toFixed(1);
    if (key === toneKey && toneP?.playing) return;
    const uri = file(`tone-${key}.wav`, () => toneWav(f).bytes);
    if (!toneP) {
      toneP = createAudioPlayer({ uri });
      toneP.loop = true;
      toneP.volume = 0.6;
    } else if (key !== toneKey) {
      toneP.replace({ uri });
      toneP.loop = true;
    }
    toneKey = key;
    toneP.play();
  } catch {
    // audio unavailable: stay silent
  }
}

/** Play a short effect (fuse pop, relay click, success chime…). */
export function play(e: Effect): void {
  if (!enabled()) return;
  try {
    init();
    let p = fx.get(e);
    if (!p) {
      p = createAudioPlayer({ uri: file(`fx-${e}.wav`, () => effectWav(e)) });
      p.volume = 0.8;
      fx.set(e, p);
    }
    void p.seekTo(0).catch(() => undefined);
    p.play();
  } catch {
    // ignore
  }
}

export function stopAll(): void {
  setTone(null);
}
