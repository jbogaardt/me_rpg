// The sounds a Dungeon Master's cue may ask for (`<cue:sfx name="..." />`, systems/cues.ts), made on the player's device
// from a few oscillators and filtered noise: nothing is downloaded, nothing goes over the wire, so every page plays the
// cue itself when the reading reaches it. Muted with the DM's 🔊 (the voice's mute), since these are part of the telling.
// Each name has a recipe (the type forces it); a page that cannot make sound simply stays silent.
// The game's own sounds (swing, hit, hurt...) are `gameSfx.ts`, with their own mute; the two share one audio context.

import { SFX_NAMES, type SfxName } from '../systems/cues';
import { playGame, sharedContext } from './gameSfx';
import { voice } from './voice';

interface Recipe {
  /** Seconds the sound lasts and its loudness (0 to 1). */
  dur: number;
  gain: number;
  /** Filtered noise whose cut-off sweeps from one frequency to another. */
  noise?: { filter: BiquadFilterType; from: number; to: number; q?: number };
  /** Oscillators sweeping from one pitch to another, each with its own share of the loudness. */
  tones?: { wave: OscillatorType; from: number; to: number; gain: number }[];
}

export const RECIPES: Record<SfxName, Recipe> = {
  steel_clash: {
    dur: 0.45,
    gain: 0.35,
    noise: { filter: 'highpass', from: 3500, to: 2000 },
    tones: [
      { wave: 'triangle', from: 1760, to: 1740, gain: 0.5 },
      { wave: 'triangle', from: 2790, to: 2760, gain: 0.3 },
    ],
  },
  glass_break: {
    dur: 0.5,
    gain: 0.3,
    noise: { filter: 'highpass', from: 5000, to: 3000 },
    tones: [{ wave: 'sine', from: 4200, to: 3800, gain: 0.25 }],
  },
  thud: { dur: 0.3, gain: 0.5, tones: [{ wave: 'sine', from: 130, to: 45, gain: 1 }] },
  whoosh: { dur: 0.35, gain: 0.3, noise: { filter: 'bandpass', from: 400, to: 2400, q: 1.2 } },
  thunder: { dur: 1.6, gain: 0.5, noise: { filter: 'lowpass', from: 500, to: 80 } },
  creak: {
    dur: 0.6,
    gain: 0.18,
    tones: [{ wave: 'sawtooth', from: 85, to: 150, gain: 1 }],
    noise: { filter: 'bandpass', from: 700, to: 500, q: 8 },
  },
  splash: { dur: 0.5, gain: 0.3, noise: { filter: 'bandpass', from: 1500, to: 900, q: 0.8 } },
};

/** Every name has a recipe (the type says so; this is for the test that says it of the vocabulary too). */
export const SFX_RECIPES_COMPLETE = SFX_NAMES.every((n) => n in RECIPES);

/** Play a cue's sound now. Silent when muted, when the page has no audio, or when the browser has not let it start yet. */
export function playSfx(name: SfxName) {
  play(RECIPES[name]);
}

/** The short chime of an item picked up: a game sound (`gameSfx.ts`), muted with the sound effects, not the DM's voice. */
export function playPing() {
  playGame('pickup');
}

function play(recipe: Recipe) {
  if (voice.muted) return;
  try {
    const ctx = sharedContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(recipe.gain, t0);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + recipe.dur);
    out.connect(ctx.destination);
    for (const tone of recipe.tones ?? []) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.from, t0);
      osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + recipe.dur);
      g.gain.value = tone.gain;
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(t0 + recipe.dur);
    }
    if (recipe.noise) {
      const length = Math.ceil(ctx.sampleRate * recipe.dur);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = recipe.noise.filter;
      filter.Q.value = recipe.noise.q ?? 0.7;
      filter.frequency.setValueAtTime(recipe.noise.from, t0);
      filter.frequency.exponentialRampToValueAtTime(recipe.noise.to, t0 + recipe.dur);
      src.buffer = buffer;
      src.connect(filter).connect(out);
      src.start(t0);
    }
  } catch {
    /* no audio here: the telling goes on without it */
  }
}
