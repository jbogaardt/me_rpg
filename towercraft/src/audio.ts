// The sounds themselves (`public/audio/sfx/<kind>-<n>.ogg`, credits in `public/audio/CREDITS.md`), played with Web Audio at a
// loudness and pan chosen by `soundMix.ts`. Nothing here is part of the match: a page that cannot make sound, or has it muted,
// plays the same game. Browsers only let audio start after a click or key press, so the files load on the first one.

import { loudest, OWN, type Mix, type View, mixAt } from './soundMix';
import type { Cue, SoundKind } from './soundEvents';

/** How many variants each kind has (the files `<kind>-1.ogg` ... `<kind>-n.ogg`) and how loud it is at full volume. */
const SOUNDS: Record<SoundKind, { variants: number; gain: number; max: number }> = {
  melee: { variants: 3, gain: 0.5, max: 4 },
  shoot: { variants: 3, gain: 0.35, max: 4 },
  blast: { variants: 3, gain: 0.55, max: 2 },
  death: { variants: 3, gain: 0.45, max: 3 },
  build: { variants: 4, gain: 0.7, max: 2 },
  upgrade: { variants: 2, gain: 0.6, max: 1 },
  castle: { variants: 2, gain: 0.7, max: 1 },
  razed: { variants: 3, gain: 0.7, max: 2 },
  fall: { variants: 3, gain: 0.9, max: 1 },
};
/** Below this loudness a sound is not worth starting. */
const AUDIBLE = 0.02;
/** At most this many sounds play at once (a big battle is a murmur of the nearest, not every blow). */
const VOICES = 24;
/** A kind does not start again this soon after itself (seconds), or ten swords in one tick stack into one loud click. */
const GAP = 0.05;
const MUTE_KEY = 'towercraft:muted';

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
const buffers = new Map<SoundKind, AudioBuffer[]>();
const lastAt = new Map<SoundKind, number>();
let voices = 0;
let loading: Promise<void> | undefined;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false; // storage can be blocked: sound on
  }
}

export const isMuted = () => muted;

/** Mute or unmute (remembered for next time). */
export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    /* not remembered */
  }
  if (master) master.gain.value = on ? 0 : 1;
}

async function load(c: AudioContext) {
  const url = (kind: SoundKind, n: number) => new URL(`audio/sfx/${kind}-${n}.ogg`, document.baseURI).href;
  await Promise.all(
    (Object.keys(SOUNDS) as SoundKind[]).map(async (kind) => {
      const list: AudioBuffer[] = [];
      for (let n = 1; n <= SOUNDS[kind].variants; n++) {
        try {
          const res = await fetch(url(kind, n));
          if (res.ok) list.push(await c.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* a sound that will not load is a silent one, not a broken game */
        }
      }
      buffers.set(kind, list);
    }),
  );
}

/** Start the audio (call from a click or key press) and load the sounds once. Safe to call again. */
export function unlockAudio() {
  if (typeof AudioContext === 'undefined') return;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  loading ??= load(ctx);
}

function start(kind: SoundKind, mix: Mix) {
  const c = ctx;
  const list = buffers.get(kind);
  if (!c || !master || !list?.length || c.state !== 'running' || voices >= VOICES) return;
  if (c.currentTime - (lastAt.get(kind) ?? -1) < GAP) return;
  lastAt.set(kind, c.currentTime);
  const src = c.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)]!;
  src.playbackRate.value = 0.93 + Math.random() * 0.14; // a touch of pitch, so repeats are not one clip
  const gain = c.createGain();
  gain.gain.value = mix.gain * SOUNDS[kind].gain;
  const pan = c.createStereoPanner();
  pan.pan.value = mix.pan;
  src.connect(gain).connect(pan).connect(master);
  voices++;
  src.onended = () => voices--;
  src.start();
}

/** Play a tick's sounds for a player looking at `view`: the loudest of each kind, off-screen ones quieter, the player's own in full. */
export function playCues(cues: readonly Cue[], view: View) {
  if (muted || !ctx || !cues.length) return;
  const byKind = new Map<SoundKind, { gain: number; mix: Mix }[]>();
  for (const cue of cues) {
    const mix = cue.own ? OWN : mixAt(view, cue.at[0], cue.at[1]);
    if (mix.gain < AUDIBLE) continue;
    const list = byKind.get(cue.kind) ?? [];
    list.push({ gain: mix.gain, mix });
    byKind.set(cue.kind, list);
  }
  for (const [kind, list] of byKind) for (const s of loudest(list, SOUNDS[kind].max)) start(kind, s.mix);
}
