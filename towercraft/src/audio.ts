// The sounds themselves (`public/audio/sfx/<kind>-<n>.ogg`, the table is `soundBank.ts`, credits in `public/audio/CREDITS.md`), played with
// Web Audio at a loudness and pan chosen by `soundMix.ts`. Nothing here is part of the match: a page that cannot make sound, or has it
// muted, plays the same game. Browsers only let audio start after a click or key press: the first one starts the context, loads the
// interface sounds and wakes the menu music (`onUnlock`); a match loads the rest (`loadKinds`, per race) and starts music and ambience.

import {
  budget,
  cutoffOf,
  fightLevel,
  loudest,
  OWN,
  rankOf,
  TICK_BUDGET,
  type Mix,
  type View,
  mixAt,
  zoomGain,
} from './soundMix';
import { BANK, pickVariant, pitchOf, sfxFile, UI_KINDS, type FileKind } from './soundBank';
import type { Cue } from './soundEvents';

/** Below this loudness a sound is not worth starting. */
const AUDIBLE = 0.02;
/** At most this many sounds play at once (a big battle is a murmur of the nearest, not every blow). */
const VOICES = 28;
const MUTE_KEY = 'towercraft:muted';
/** The ambience sits this far under its file's level (it is already the quietest thing in the mix). */
const AMBIENCE = 0.7;

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let sfxBus: GainNode | undefined; // effects, voices and ambience
let ambBus: GainNode | undefined; // the ambience's own dip under big events (under sfxBus: the sfx volume scales it too)
let musicBus: GainNode | undefined; // music
const buffers = new Map<FileKind, AudioBuffer[]>();
const pending = new Map<FileKind, Promise<void>>();
const lastAt = new Map<FileKind, number>();
const lastVariant = new Map<FileKind, number>();
let musicFilter: BiquadFilterNode | undefined;
let fight = 0; // 0 calm .. 1 fighting on screen or the castle hurt: opens the music's low-pass
let fightCutoff = cutoffOf(0);
let hiddenByUs = false;
/** Counters for tests and the dev console: what was started, so a headless run can tell cues really executed. */
export const audioStats = { files: 0, ducks: 0, loaded: 0, failed: 0 };
let voices = 0;
let muted = readMuted();
const unlockListeners: (() => void)[] = [];

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
  return 1; // 1 = the loudness the game was tuned at
}

/** A channel's volume, 0..1 (the ambience follows `sfx`). */
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

/** Fetch and decode a file; `undefined` when it will not load (a sound that will not load is a silent one, not a broken game). */
export async function decodeFile(c: AudioContext, path: string): Promise<AudioBuffer | undefined> {
  try {
    const res = await fetch(new URL(path, document.baseURI).href);
    if (!res.ok) {
      audioStats.failed++;
      return undefined;
    }
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    audioStats.loaded++;
    return buf;
  } catch {
    audioStats.failed++;
    return undefined;
  }
}

/** Load these kinds (once each); resolves when all are decoded or have failed. Safe to call before audio is unlocked (does nothing then). */
export function loadKinds(kinds: readonly FileKind[]): Promise<void> {
  const c = ctx;
  if (!c) return Promise.resolve();
  const jobs = kinds.map((kind) => {
    let job = pending.get(kind);
    if (!job) {
      job = (async () => {
        const got = await Promise.all(
          Array.from({ length: BANK[kind].variants }, (_, i) => decodeFile(c, sfxFile(kind, i + 1))),
        );
        buffers.set(
          kind,
          got.filter((b): b is AudioBuffer => !!b),
        );
      })();
      pending.set(kind, job);
    }
    return job;
  });
  return Promise.all(jobs).then(() => undefined);
}

/** Run `fn` once audio is unlocked (now when it already is): how the menu music waits for the first gesture. */
export function onUnlock(fn: () => void) {
  if (ctx) fn();
  else unlockListeners.push(fn);
}

/** Start the audio (call from a click, touch or key press) and load the interface sounds once. Safe to call again; silent when Web Audio is missing. */
export function unlockAudio() {
  if (typeof AudioContext === 'undefined') return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      // A gentle limiter on the output: many voices plus music must not clip when a big fight stacks them.
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
      ambBus = ctx.createGain();
      ambBus.gain.value = AMBIENCE;
      ambBus.connect(sfxBus);
      musicBus = ctx.createGain();
      musicBus.gain.value = vols.music;
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = fightCutoff;
      musicBus.connect(musicFilter).connect(master);
      void loadKinds(UI_KINDS);
    }
    // iOS reports 'interrupted' after a call or a lock; resume anything that is not running (but not while the tab is hidden).
    if (ctx.state !== 'running' && ctx.state !== 'closed' && !document.hidden) void ctx.resume().catch(() => undefined);
    for (const fn of unlockListeners.splice(0)) fn();
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

/** Where the music, the ambience and the voices plug in: the same output as the sounds, so the mute button silences all. Undefined until audio is unlocked. */
export function audioOutput(): { ctx: AudioContext; out: AudioNode; sfx: AudioNode; amb: AudioNode } | undefined {
  return ctx && musicBus && sfxBus && ambBus ? { ctx, out: musicBus, sfx: sfxBus, amb: ambBus } : undefined;
}

function start(kind: FileKind, mix: Mix, pan = true): boolean {
  const c = ctx;
  const list = buffers.get(kind);
  const spec = BANK[kind];
  if (!c || !master || !list?.length || c.state !== 'running' || voices >= VOICES) return false;
  if (c.currentTime - (lastAt.get(kind) ?? -1) < spec.gap) return false;
  lastAt.set(kind, c.currentTime);
  const v = pickVariant(list.length, lastVariant.get(kind) ?? -1, Math.random());
  lastVariant.set(kind, v);
  const src = c.createBufferSource();
  src.buffer = list[v]!;
  src.playbackRate.value = pitchOf(kind, Math.random()); // a touch of pitch, so repeats are not one clip
  const gain = c.createGain();
  gain.gain.value = mix.gain * spec.gain * (0.92 + Math.random() * 0.16);
  let node: AudioNode = gain;
  src.connect(gain);
  if (pan) {
    const p = c.createStereoPanner();
    p.pan.value = mix.pan;
    gain.connect(p);
    node = p;
  }
  node.connect(sfxBus ?? master);
  voices++;
  src.onended = () => voices--;
  src.start();
  audioStats.files++;
  const d = spec.duck;
  if (d) duck(d.by, d.for);
  return true;
}

/** Play a sound with no place in the field (the interface, the stingers) at `level` (0..1). True when it started. */
export function playKind(kind: FileKind, level = 1): boolean {
  if (muted) return false;
  return start(kind, { gain: level, pan: 0 }, false);
}

/** Dip the music and the ambience for a moment (the alarm and the stingers must be heard over them). */
export function duck(by: number, seconds: number) {
  if (!ctx || !musicBus || !ambBus) return;
  const t = ctx.currentTime;
  for (const [bus, base] of [
    [musicBus, vols.music],
    [ambBus, AMBIENCE],
  ] as const) {
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(base * (1 - by), t, 0.05);
    bus.gain.setTargetAtTime(base, t + seconds, 0.5);
  }
  audioStats.ducks++;
}

const FIGHT_KINDS: ReadonlySet<FileKind> = new Set([
  'sword',
  'axe',
  'spear',
  'dagger',
  'bow',
  'ballista',
  'gun',
  'cannon',
  'catapult',
  'flame',
  'bat',
  'gryphon',
  'charge',
  'spit',
  'blast',
]);

/** Play a tick's sounds for a player looking at `view`: the loudest of each kind, off-screen ones quieter, the player's own in full, the most important few overall. */
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
    // A building hit off screen is a softer knock (on screen it is seen); the alarm and the stingers play in full wherever the player looks.
    if (cue.kind === 'warn' && mix.gain >= 0.6) continue;
    const alert = BANK[cue.kind].group === 'alert' || BANK[cue.kind].group === 'sting';
    const gain = cue.own || alert ? mix.gain : mix.gain * far;
    if (gain < AUDIBLE && !alert) continue;
    const list = byKind.get(cue.kind) ?? [];
    list.push({ gain, mix: { gain: alert && !cue.own ? Math.max(gain, 0.5) : gain, pan: mix.pan } });
    byKind.set(cue.kind, list);
  }
  const starts: { kind: FileKind; mix: Mix }[] = [];
  for (const [kind, list] of byKind) for (const s of loudest(list, BANK[kind].max)) starts.push({ kind, mix: s.mix });
  for (const s of budget(starts, TICK_BUDGET, (x) => rankOf(BANK[x.kind].prio, x.mix.gain))) start(s.kind, s.mix);
  fight = fightLevel(fight, hits, hurt);
  const cutoff = cutoffOf(fight);
  if (musicFilter && Math.abs(cutoff - fightCutoff) > fightCutoff * 0.03) {
    fightCutoff = cutoff;
    musicFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.5);
  }
}
