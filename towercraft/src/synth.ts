// Cues made with Web Audio itself instead of files (no licence needed): short, soft, wooden or low tones and a little filtered
// noise, so nothing sounds like a chiptune bleep. Each recipe states its PEAK gain (the loudest one partial gets, before the
// sfx volume); partials of a recipe overlap little, so a recipe's peak is about its loudest note. The sound files peak near 0.5,
// so the loudest recipe here (the alarm, 0.22) sits under them and the stingers (0.16 each) under the music's chords.
// Cosmetic and Pixi-free: `audio.ts` plays them through the sfx bus, `soundEvents.ts` and `uiSound.ts` ask for them by name.

/** Cues that come from the match (`soundEvents.ts`) and from the buttons (`uiSound.ts`). */
export type SynthKind =
  | 'alarm' // the player's castle is being hit
  | 'warn' // a building of theirs is hit off screen
  | 'coin' // pay-day arrived
  | 'clock' // a minute left
  | 'clockLast' // ten seconds left
  | 'win'
  | 'lose'
  | 'click' // a button press
  | 'tick' // a unit picked, when its voice line does not play
  | 'refuse' // a purchase or a building was refused
  | 'confirm'; // a unit trained

export interface Note {
  type: OscillatorType;
  /** Start and end pitch in Hz (a glide when they differ). */
  f0: number;
  f1?: number;
  /** Seconds after the cue starts, and how long it rings. */
  at: number;
  dur: number;
  /** Highest gain this partial reaches (0..1). */
  peak: number;
  /** Low-pass cutoff in Hz that softens it (omit for none). */
  lp?: number;
}

export interface Noise {
  at: number;
  dur: number;
  peak: number;
  lp: number;
}

export interface Recipe {
  notes: Note[];
  noise?: Noise[];
  /** How far the music dips under it (0..1 of its level) and for how many seconds. */
  duck?: { by: number; for: number };
  /** The kind does not start again this soon after itself (seconds). */
  gap: number;
}

const n = (
  type: OscillatorType,
  f0: number,
  at: number,
  dur: number,
  peak: number,
  extra: Partial<Note> = {},
): Note => ({
  type,
  f0,
  at,
  dur,
  peak,
  ...extra,
});

// Pitches (Hz): C4 261.6, E4 329.6, G4 392, A3 220, C5 523.3.
export const RECIPES: Record<SynthKind, Recipe> = {
  // peak 0.12: a dry wooden knock.
  click: {
    notes: [n('triangle', 340, 0, 0.06, 0.12, { f1: 220 })],
    noise: [{ at: 0, dur: 0.02, peak: 0.04, lp: 1800 }],
    gap: 0.04,
  },
  // peak 0.07: lighter than a click.
  tick: { notes: [n('sine', 640, 0, 0.05, 0.07, { f1: 540 })], gap: 0.06 },
  // peak 0.3: a low thud, the "no".
  refuse: {
    notes: [n('sine', 150, 0, 0.2, 0.3, { f1: 65 })],
    noise: [{ at: 0, dur: 0.06, peak: 0.1, lp: 420 }],
    gap: 0.2,
  },
  // peak 0.12: two rising soft notes.
  confirm: { notes: [n('triangle', 392, 0, 0.14, 0.12), n('triangle', 523.3, 0.07, 0.18, 0.12)], gap: 0.1 },
  // peak 0.22: a low horn (saw softened by a low-pass), two falling pairs; the music ducks 55% under it.
  alarm: {
    notes: [
      n('sawtooth', 220, 0, 0.24, 0.22, { lp: 800 }),
      n('sawtooth', 165, 0.26, 0.28, 0.22, { lp: 800 }),
      n('sawtooth', 220, 0.7, 0.24, 0.22, { lp: 800 }),
      n('sawtooth', 165, 0.96, 0.32, 0.22, { lp: 800 }),
    ],
    duck: { by: 0.55, for: 1.6 },
    gap: 2,
  },
  // peak 0.12: one soft double knock, quieter than the alarm.
  warn: {
    notes: [
      n('triangle', 330, 0, 0.22, 0.12, { f1: 290, lp: 900 }),
      n('triangle', 330, 0.26, 0.26, 0.12, { f1: 290, lp: 900 }),
    ],
    gap: 2,
  },
  // peak 0.035: a very quiet two-note ting at pay-day.
  coin: { notes: [n('sine', 1318, 0, 0.1, 0.035), n('sine', 1760, 0.05, 0.14, 0.03)], gap: 1 },
  // peak 0.15: a soft bell twice (a minute left).
  clock: {
    notes: [
      n('sine', 523.3, 0, 0.6, 0.15),
      n('sine', 1046.6, 0, 0.35, 0.05),
      n('sine', 523.3, 0.4, 0.6, 0.15),
      n('sine', 1046.6, 0.4, 0.35, 0.05),
    ],
    gap: 5,
  },
  // peak 0.16: three quick pulses (ten seconds left).
  clockLast: { notes: [0, 0.3, 0.6].map((at) => n('triangle', 440, at, 0.18, 0.16, { lp: 1500 })), gap: 5 },
  // peak 0.13 a note: a rising C major arpeggio whose four notes ring together at the end (about 0.5 summed, brief);
  // the music ducks 60% under it.
  win: {
    notes: [261.6, 329.6, 392, 523.3].map((f, i) => n('triangle', f, i * 0.16, 1.7 - i * 0.16, 0.13, { lp: 2400 })),
    duck: { by: 0.6, for: 2.4 },
    gap: 4,
  },
  // peak 0.15 a note: three falling minor notes, each ringing into the next.
  lose: {
    notes: [220, 196, 164.8].map((f, i) => n('triangle', f, i * 0.4, 1.4, 0.15, { lp: 700 })),
    duck: { by: 0.6, for: 2.4 },
    gap: 4,
  },
};

/** The highest gain any one partial of a cue reaches. */
export const peakOf = (r: Recipe): number =>
  Math.max(...r.notes.map((x) => x.peak), ...(r.noise ?? []).map((x) => x.peak));

/** The recipes of the kinds that dip the music, with the dip. */
export const duckOf = (kind: SynthKind) => RECIPES[kind].duck;

let noiseBuffer: AudioBuffer | undefined;
let noiseCtx: AudioContext | undefined;

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseCtx !== ctx) {
    noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCtx = ctx;
  }
  return noiseBuffer;
}

/** A soft envelope: a quick rise to `peak`, then a smooth fall to silence over `dur`. */
function envelope(ctx: AudioContext, at: number, dur: number, peak: number): GainNode {
  const g = ctx.createGain();
  const rise = Math.min(0.01, dur / 4);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + rise);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  return g;
}

/** Play a recipe into `out` starting now (`level` scales every partial). Returns how many nodes it made, and when it ends (seconds from now). */
export function playRecipe(ctx: AudioContext, out: AudioNode, r: Recipe, level = 1): { nodes: number; ends: number } {
  const t0 = ctx.currentTime + 0.01;
  let nodes = 0;
  let ends = 0;
  for (const note of r.notes) {
    const at = t0 + note.at;
    const osc = ctx.createOscillator();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.f0, at);
    if (note.f1) osc.frequency.exponentialRampToValueAtTime(note.f1, at + note.dur);
    const env = envelope(ctx, at, note.dur, note.peak * level);
    nodes += 2;
    if (note.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = note.lp;
      osc.connect(lp).connect(env);
      nodes++;
    } else osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + note.dur + 0.05);
    ends = Math.max(ends, note.at + note.dur + 0.05);
  }
  for (const nz of r.noise ?? []) {
    const at = t0 + nz.at;
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = nz.lp;
    const env = envelope(ctx, at, nz.dur, nz.peak * level);
    src.connect(lp).connect(env).connect(out);
    src.start(at);
    src.stop(at + nz.dur + 0.05);
    nodes += 4;
    ends = Math.max(ends, nz.at + nz.dur + 0.05);
  }
  return { nodes, ends };
}
