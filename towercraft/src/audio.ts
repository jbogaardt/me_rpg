// The sounds themselves (`public/audio/sfx/<kind>-<n>.ogg`, credits in `public/audio/CREDITS.md`), played with Web Audio at a
// loudness and pan chosen by `soundMix.ts`. Nothing here is part of the match: a page that cannot make sound, or has it muted,
// plays the same game. Browsers only let audio start after a click or key press, so the files load on the first one.

import { cutoffOf, fightLevel, loudest, OWN, type Mix, type View, mixAt, zoomGain } from './soundMix';
import type { Cue, FileKind, SoundKind } from './soundEvents';
import { duckOf, playRecipe, RECIPES, type SynthKind } from './synth';

/** How many variants each kind has (the files `<kind>-1.ogg` ... `<kind>-n.ogg`) and how loud it is at full volume. */
const SOUNDS: Record<FileKind, { variants: number; gain: number; max: number }> = {
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
let sfxBus: GainNode | undefined; // effects and voices
let musicBus: GainNode | undefined; // music
const buffers = new Map<FileKind, AudioBuffer[]>();
const lastAt = new Map<string, number>();
let musicFilter: BiquadFilterNode | undefined;
let fight = 0; // 0 calm .. 1 fighting on screen or the castle hurt: opens the music's low-pass
let fightCutoff = cutoffOf(0);
let hiddenByUs = false;
/** Counters for tests and the dev console: what was started, so a headless run can tell cues really executed. */
export const audioStats = { files: 0, synth: 0, nodes: 0, ducks: 0 };
const synthEnds: number[] = [];
/** At most this many synthesized cues ring at once. */
const SYNTH_VOICES = 6;
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

/** Move a bus to a level without clicks (and cancel any dip in progress). */
function ramp(g: GainNode, v: number) {
  const t = g.context.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setTargetAtTime(v, t, 0.03);
}

type Channel = 'sfx' | 'music';
const vols: Record<Channel, number> = { sfx: readVol('sfx'), music: readVol('music') };

function readVol(ch: Channel): number {
  try {
    const v = Number(localStorage.getItem(`towercraft:vol:${ch}`));
    if (localStorage.getItem(`towercraft:vol:${ch}`) !== null && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  } catch {
    /* blocked storage: default */
  }
  return 1; // 1 = today's loudness
}

/** A channel's volume, 0..1 (1 is the loudness the game always had). */
export const volume = (ch: Channel): number => vols[ch];

/** Set a channel's volume 0..1, remembered, applied live (the mute still silences everything). */
export function setVolume(ch: Channel, v: number): void {
  vols[ch] = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
  try {
    localStorage.setItem(`towercraft:vol:${ch}`, String(vols[ch]));
  } catch {
    /* not remembered */
  }
  const bus = ch === 'sfx' ? sfxBus : musicBus;
  if (bus) ramp(bus, vols[ch]);
}

/** Mute or unmute (remembered for next time). */
export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    /* not remembered */
  }
  if (master) ramp(master, on ? 0 : 1);
}

async function load(c: AudioContext) {
  const url = (kind: FileKind, n: number) => new URL(`audio/sfx/${kind}-${n}.ogg`, document.baseURI).href;
  await Promise.all(
    (Object.keys(SOUNDS) as FileKind[]).map(async (kind) => {
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

/** Start the audio (call from a click, touch or key press) and load the sounds once. Safe to call again; silent when Web Audio is missing. */
export function unlockAudio() {
  if (typeof AudioContext === 'undefined') return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      // A gentle limiter on the output: 24 voices plus music must not clip when a big fight stacks them.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 10;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.18;
      master.connect(limiter).connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = vols.sfx;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = vols.music;
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = fightCutoff;
      musicBus.connect(musicFilter).connect(master);
    }
    // iOS reports 'interrupted' after a call or a lock; resume anything that is not running (but not while the tab is hidden).
    if (ctx.state !== 'running' && ctx.state !== 'closed' && !document.hidden) void ctx.resume().catch(() => undefined);
    loading ??= load(ctx);
  } catch {
    ctx = undefined; // no audio on this device: the game plays the same
  }
}

let installed = false;
/** Unlock on every kind of gesture phones and desktops give, and pause the sound while the tab is hidden. Safe to call twice. */
export function installAudioLifecycle() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
    window.addEventListener(type, unlockAudio, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') {
        hiddenByUs = true;
        void ctx.suspend().catch(() => undefined);
      }
    } else if (hiddenByUs) {
      hiddenByUs = false;
      void ctx.resume().catch(() => undefined);
    }
  });
}

/** Where the music plays: the same output as the sounds, so the mute button silences both. Undefined until audio is unlocked. */
export function audioOutput(): { ctx: AudioContext; out: AudioNode; sfx: AudioNode } | undefined {
  return ctx && musicBus && sfxBus ? { ctx, out: musicBus, sfx: sfxBus } : undefined;
}

function start(kind: FileKind, mix: Mix) {
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
  src
    .connect(gain)
    .connect(pan)
    .connect(sfxBus ?? master);
  voices++;
  src.onended = () => voices--;
  src.start();
  audioStats.files++;
}

/** Dip the music for a moment (the alarm and the stingers must be heard over it). */
export function duck(by: number, seconds: number) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(vols.music * (1 - by), t, 0.05);
  musicBus.gain.setTargetAtTime(vols.music, t + seconds, 0.5);
  audioStats.ducks++;
}

/** Play a synthesized cue (`synth.ts`) at `level` (0..1) through the sfx volume; quietly nothing when muted or unavailable. */
export function playSynth(kind: SynthKind, level = 1): boolean {
  const c = ctx;
  if (muted || !c || !sfxBus || c.state !== 'running' || level <= 0) return false;
  const recipe = RECIPES[kind];
  const now = c.currentTime;
  if (now - (lastAt.get(kind) ?? -Infinity) < recipe.gap) return false;
  while (synthEnds.length && synthEnds[0]! <= now) synthEnds.shift();
  if (synthEnds.length >= SYNTH_VOICES && !recipe.duck) return false; // the alarm and the stingers always get through
  lastAt.set(kind, now);
  const { nodes, ends } = playRecipe(c, sfxBus, recipe, level);
  synthEnds.push(now + ends);
  audioStats.synth++;
  audioStats.nodes += nodes;
  const d = duckOf(kind);
  if (d) duck(d.by, d.for);
  return true;
}

const isSynth = (kind: SoundKind): kind is Exclude<SoundKind, FileKind> => !(kind in SOUNDS);
const FIGHT_KINDS: ReadonlySet<SoundKind> = new Set(['melee', 'shoot', 'blast', 'death']);

/** Play a tick's sounds for a player looking at `view`: the loudest of each kind, off-screen ones quieter, the player's own in full. */
export function playCues(cues: readonly Cue[], view: View) {
  if (!ctx) return;
  // The music opens up while fighting is on screen or the castle is hurt, and settles back when it calms.
  let hits = 0;
  let hurt = false;
  const far = zoomGain(view); // zoomed far out is a little quieter
  const byKind = new Map<FileKind, { gain: number; mix: Mix }[]>();
  for (const cue of cues) {
    const mix = cue.own ? OWN : mixAt(view, cue.at[0], cue.at[1]);
    if (cue.kind === 'alarm') hurt = true;
    if (FIGHT_KINDS.has(cue.kind) && mix.gain > 0.3) hits++;
    if (muted) continue;
    if (isSynth(cue.kind)) {
      // The alarm and the stingers play in full wherever the player looks; a building hit off screen is a softer knock
      // (on screen it is seen).
      if (cue.kind === 'warn') {
        if (mix.gain < 0.6) playSynth('warn');
      } else playSynth(cue.kind);
      continue;
    }
    const gain = cue.own ? mix.gain : mix.gain * far;
    if (gain < AUDIBLE) continue;
    const list = byKind.get(cue.kind) ?? [];
    list.push({ gain, mix: { gain, pan: mix.pan } });
    byKind.set(cue.kind, list);
  }
  for (const [kind, list] of byKind) for (const s of loudest(list, SOUNDS[kind].max)) start(kind, s.mix);
  fight = fightLevel(fight, hits, hurt);
  const cutoff = cutoffOf(fight);
  if (musicFilter && Math.abs(cutoff - fightCutoff) > fightCutoff * 0.03) {
    fightCutoff = cutoff;
    musicFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.5);
  }
}
