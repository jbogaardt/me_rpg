// The game's own sounds, made on the player's device from a few oscillators and filtered noise (no files, no wire):
// swing, hit, hurt, death, bolt, chest, level-up, pickup. Which event makes which sound is `systems/gameSounds.ts`; this
// is the player. Layer: core engine, cosmetic (no capability); every page plays from the events it already gets, so a co-op
// guest hears what the host hears. Kept apart from the DM's closed cue vocabulary (`sfx.ts`, `cues.ts`) and muted
// separately (`core/soundSettings.ts`); the DM voice's mute does not silence these, nor the reverse.
//
// Made to sit well on a phone: one shared noise buffer, a master gain into a compressor (so a crowd cannot clip), at most
// MAX_VOICES sounds at once (the oldest is cut), the same sound not restarted within MIN_REPEAT, and every play is
// jittered (pitch and filter +/-5..10%, loudness, which slice of the noise) so repeats never machine-gun. A page that
// cannot make sound, or a browser that has not yet allowed it, stays silent.

import { sfxSettings, type SfxSettings } from '../core/soundSettings';
import { GAME_SOUND_NAMES, VoiceCap, jitter, type GameSoundName } from '../systems/gameSounds';

export interface GameRecipe {
  /** Seconds (60 to 250 ms) and loudness (0 to 1). */
  dur: number;
  gain: number;
  /** How much the pitch and filters may wander either way on each play (0.05 to 0.10). */
  pitch: number;
  /** Seconds to rise to full loudness (default ATTACK, a click). A swish needs a slow one so it reads as air, not a thud. */
  attack?: number;
  noise?: { filter: BiquadFilterType; from: number; to: number; q?: number; gain: number };
  tones?: { wave: OscillatorType; from: number; to: number; gain: number }[];
}

export const GAME_RECIPES: Record<GameSoundName, GameRecipe> = {
  // A whiff is airy: no tone, noise swept up through the high band with a rising envelope (a hit is a low thud with a click).
  swing: {
    dur: 0.2,
    gain: 0.38,
    pitch: 0.1,
    attack: 0.07,
    noise: { filter: 'bandpass', from: 1400, to: 5200, q: 1.6, gain: 1 },
  },
  arrow: {
    dur: 0.1,
    gain: 0.25,
    pitch: 0.08,
    noise: { filter: 'bandpass', from: 1800, to: 900, q: 3, gain: 0.5 },
    tones: [{ wave: 'triangle', from: 520, to: 220, gain: 0.4 }],
  },
  cast: {
    dur: 0.24,
    gain: 0.22,
    pitch: 0.07,
    noise: { filter: 'bandpass', from: 1200, to: 3000, q: 2, gain: 0.15 },
    tones: [
      { wave: 'sine', from: 500, to: 1100, gain: 0.6 },
      { wave: 'triangle', from: 750, to: 1650, gain: 0.3 },
    ],
  },
  bolt: {
    dur: 0.16,
    gain: 0.22,
    pitch: 0.08,
    noise: { filter: 'highpass', from: 3000, to: 1500, gain: 0.2 },
    tones: [{ wave: 'sine', from: 900, to: 380, gain: 0.7 }],
  },
  boltHit: {
    dur: 0.14,
    gain: 0.3,
    pitch: 0.08,
    noise: { filter: 'bandpass', from: 2500, to: 900, q: 1, gain: 0.6 },
    tones: [{ wave: 'sine', from: 400, to: 150, gain: 0.6 }],
  },
  hit: {
    dur: 0.12,
    gain: 0.45,
    pitch: 0.08,
    noise: { filter: 'lowpass', from: 1800, to: 500, gain: 0.5 },
    tones: [{ wave: 'sine', from: 190, to: 70, gain: 0.9 }],
  },
  clack: {
    dur: 0.07,
    gain: 0.3,
    pitch: 0.06,
    noise: { filter: 'highpass', from: 3000, to: 2000, gain: 0.6 },
    tones: [{ wave: 'triangle', from: 1500, to: 1300, gain: 0.4 }],
  },
  hurt: {
    dur: 0.2,
    gain: 0.4,
    pitch: 0.08,
    noise: { filter: 'lowpass', from: 900, to: 300, gain: 0.4 },
    tones: [{ wave: 'sawtooth', from: 240, to: 110, gain: 0.5 }],
  },
  death: {
    dur: 0.25,
    gain: 0.38,
    pitch: 0.08,
    noise: { filter: 'lowpass', from: 1400, to: 200, gain: 0.6 },
    tones: [{ wave: 'sine', from: 160, to: 40, gain: 0.8 }],
  },
  deathDust: {
    dur: 0.25,
    gain: 0.35,
    pitch: 0.08,
    noise: { filter: 'bandpass', from: 600, to: 150, q: 0.8, gain: 1 },
    tones: [{ wave: 'sine', from: 90, to: 40, gain: 0.5 }],
  },
  deathSplat: {
    dur: 0.2,
    gain: 0.38,
    pitch: 0.09,
    noise: { filter: 'bandpass', from: 1100, to: 350, q: 1.5, gain: 1 },
    tones: [{ wave: 'sine', from: 220, to: 60, gain: 0.6 }],
  },
  deathWisp: {
    dur: 0.25,
    gain: 0.2,
    pitch: 0.08,
    noise: { filter: 'bandpass', from: 2500, to: 1000, q: 4, gain: 0.3 },
    tones: [{ wave: 'sine', from: 900, to: 300, gain: 0.6 }],
  },
  chest: {
    dur: 0.22,
    gain: 0.28,
    pitch: 0.06,
    noise: { filter: 'highpass', from: 4000, to: 3000, gain: 0.2 },
    tones: [
      { wave: 'triangle', from: 660, to: 880, gain: 0.5 },
      { wave: 'triangle', from: 990, to: 1320, gain: 0.4 },
    ],
  },
  glint: { dur: 0.12, gain: 0.1, pitch: 0.06, tones: [{ wave: 'sine', from: 1800, to: 2400, gain: 1 }] },
  levelUp: {
    dur: 0.25,
    gain: 0.25,
    pitch: 0.05,
    tones: [
      { wave: 'sine', from: 1047, to: 1050, gain: 0.4 },
      { wave: 'sine', from: 1319, to: 1322, gain: 0.4 },
      { wave: 'sine', from: 1568, to: 1572, gain: 0.3 },
    ],
  },
  pickup: { dur: 0.18, gain: 0.2, pitch: 0.06, tones: [{ wave: 'sine', from: 1320, to: 1760, gain: 1 }] },
};

/** Every game sound has a recipe (the type says so; this is for the test that says it of the table too). */
export const GAME_RECIPES_COMPLETE = GAME_SOUND_NAMES.every((n) => n in GAME_RECIPES);

/** The loudest a recipe can be before the master gain: its gain times everything it mixes. Must stay within 1. */
export const recipePeak = (r: GameRecipe): number =>
  r.gain * ((r.tones ?? []).reduce((s, t) => s + t.gain, 0) + (r.noise?.gain ?? 0));

export const MASTER_GAIN = 0.6;
const NOISE_SECONDS = 1;
const ATTACK = 0.004;
const FADE = 0.012;

interface Chain {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

export class GameAudio {
  private chain: Chain | null = null;
  private readonly cap = new VoiceCap();

  constructor(
    private readonly getContext: () => AudioContext | null,
    private readonly settings: SfxSettings = sfxSettings,
    private readonly rand: () => number = Math.random,
  ) {}

  /** Voices sounding now (for tests). */
  get voices(): number {
    return this.cap.count;
  }

  /** Play a game sound now. Silent when muted, with no audio, or before the browser lets sound start. */
  play(name: GameSoundName) {
    if (this.settings.muted || this.settings.volume <= 0) return;
    try {
      const chain = this.build();
      if (!chain) return;
      const { ctx } = chain;
      if (ctx.state === 'suspended') {
        void ctx.resume();
        return; // not yet allowed to sound: drop it rather than pile up a burst when it wakes
      }
      const now = ctx.currentTime;
      if (this.cap.tooSoon(name, now)) return;
      chain.master.gain.value = MASTER_GAIN * this.settings.volume;
      this.start(chain, GAME_RECIPES[name], name, now);
    } catch {
      /* no audio here: the game goes on without it */
    }
  }

  private build(): Chain | null {
    if (this.chain) return this.chain;
    const ctx = this.getContext();
    if (!ctx) return null;
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter).connect(ctx.destination);
    const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.chain = { ctx, master, noise };
    return this.chain;
  }

  private start({ ctx, master, noise }: Chain, r: GameRecipe, name: string, t0: number) {
    const pitch = jitter(this.rand(), r.pitch);
    const dur = r.dur * jitter(this.rand(), 0.08);
    const end = t0 + dur;
    const out = ctx.createGain();
    const peak = r.gain * jitter(this.rand(), 0.1);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(peak, t0 + (r.attack ?? ATTACK));
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(master);
    const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
    for (const tone of r.tones ?? []) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.from * pitch, t0);
      osc.frequency.exponentialRampToValueAtTime(tone.to * pitch, end);
      g.gain.value = tone.gain;
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(end + 0.02);
      sources.push(osc);
    }
    if (r.noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      filter.type = r.noise.filter;
      filter.Q.value = r.noise.q ?? 0.7;
      const wander = jitter(this.rand(), r.pitch);
      filter.frequency.setValueAtTime(r.noise.from * wander, t0);
      filter.frequency.exponentialRampToValueAtTime(r.noise.to * wander, end);
      g.gain.value = r.noise.gain;
      src.buffer = noise;
      src.connect(filter).connect(g).connect(out);
      src.start(t0, this.rand() * Math.max(0, NOISE_SECONDS - dur - 0.05), dur + 0.02);
      sources.push(src);
    }
    this.cap.add(
      name,
      {
        start: t0,
        end,
        stop: () => {
          try {
            out.gain.cancelScheduledValues(ctx.currentTime);
            out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
            out.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE);
            for (const s of sources) s.stop(ctx.currentTime + FADE);
          } catch {
            /* already over */
          }
        },
      },
      t0,
    );
  }
}

// --- The page's one audio context, woken by the first tap, click or key (a phone allows sound only after one) ---

let shared: AudioContext | null = null;
let unlocked = false;

/** The page's audio context (made once the player has done something), or null where there is no audio. */
export function sharedContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    shared ??= new AudioContext();
    return shared;
  } catch {
    return null;
  }
}

const WAKERS = ['touchend', 'click', 'keydown'] as const;
function wake() {
  for (const type of WAKERS) window.removeEventListener(type, wake, true);
  unlocked = true;
  try {
    const ctx = sharedContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio: silent */
  }
}
if (typeof window !== 'undefined') for (const type of WAKERS) window.addEventListener(type, wake, true);

const gameAudio = new GameAudio(() => (unlocked ? sharedContext() : null));

/** Play one of the game's sounds (swing, hit, hurt...). */
export function playGame(name: GameSoundName) {
  gameAudio.play(name);
}
