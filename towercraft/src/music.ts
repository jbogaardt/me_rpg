// The music (`public/audio/music/`, rotation in `playlist.ts`, credits in `public/audio/CREDITS.md`). It plays into the sounds' output
// (`audio.ts`), so the mute button and the music volume cover it. The title has a piece (intro, then a loop) that starts after the
// first gesture; a match crossfades to the battle rotation of its map's theme and steps through it, crossfading from track to track
// (each is decoded shortly before it is needed and let go after). The match's end fades everything out (the stinger is a sound).

import { audioOutput, decodeFile, onUnlock } from './audio';
import { startAmbience, stopAmbience } from './ambience';
import { BATTLE, CROSSFADE, MENU, nextIndex, PLAYLISTS, stage, type Track } from './playlist';
import type { Theme } from './soundClass';

/** The music's loudness under the sounds (0 to 1): the files are about -17 LUFS. */
const VOLUME = { menu: 0.4, battle: 0.35 };
/** How long (s) the music takes to fade out when a match ends, and the title's crossfade into a match. */
const FADE = 1.5;
const TO_BATTLE = 2.5;

interface Playing {
  ctx: AudioContext;
  gain: GainNode;
  nodes: AudioBufferSourceNode[];
  /** Context time the piece started and how long it is (a looping piece never ends). */
  at: number;
  dur: number;
  looping: boolean;
}

let want: { kind: 'menu' } | { kind: 'battle'; theme: Theme } | undefined = { kind: 'menu' };
let busy = false;
let current: Playing | undefined;
let rotation = 0;
let preload: Promise<AudioBuffer | undefined> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

/** Start the title's music (once audio is unlocked, so after the first click or key press). Safe to call again. */
export function playMenuMusic() {
  want = { kind: 'menu' };
  onUnlock(() => void begin());
}

/** Start the match's music for this map theme: the title's piece gives way to the rotation. */
export function playMusic(theme: Theme) {
  want = { kind: 'battle', theme };
  rotation = 0;
  preload = undefined;
  onUnlock(() => void begin());
}

function fadeOut(p: Playing, seconds: number) {
  const t = p.ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + seconds);
  for (const n of p.nodes) n.stop(t + seconds + 0.05);
}

/** Play `track` (decoded `buffers`) through a new gain node that rises over `fadeIn` seconds. */
function launch(
  ctx: AudioContext,
  out: AudioNode,
  buffers: { intro?: AudioBuffer; loop: AudioBuffer },
  level: number,
  fadeIn: number,
  loop: boolean,
): Playing {
  const at = ctx.currentTime + 0.05;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : level, at);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, at + fadeIn);
  gain.connect(out);
  const nodes: AudioBufferSourceNode[] = [];
  let when = at;
  if (buffers.intro) {
    const intro = ctx.createBufferSource();
    intro.buffer = buffers.intro;
    intro.connect(gain);
    intro.start(when);
    nodes.push(intro);
    when += buffers.intro.duration;
  }
  const body = ctx.createBufferSource();
  body.buffer = buffers.loop;
  body.loop = loop;
  body.connect(gain);
  body.start(when); // the loop follows the intro without a gap
  nodes.push(body);
  return { ctx, gain, nodes, at, dur: when - at + buffers.loop.duration, looping: loop };
}

async function decodeTrack(
  ctx: AudioContext,
  track: Track,
): Promise<{ intro?: AudioBuffer; loop: AudioBuffer } | undefined> {
  const [intro, loop] = await Promise.all([
    track.intro ? decodeFile(ctx, track.intro) : Promise.resolve(undefined),
    decodeFile(ctx, track.loop),
  ]);
  if (!loop || (track.intro && !intro)) return undefined;
  return { ...(intro ? { intro } : {}), loop };
}

async function begin() {
  const output = audioOutput();
  const goal = want;
  if (!goal || !output || busy) return;
  if (goal.kind === 'menu' && current) return;
  busy = true;
  try {
    const { ctx, out } = output;
    if (goal.kind === 'battle') {
      void startAmbience(goal.theme);
      const list = PLAYLISTS[goal.theme];
      const track = BATTLE[list[rotation % list.length]!];
      const files = await decodeTrack(ctx, track);
      if (!files || want !== goal) return; // silence is not a broken match
      const old = current;
      if (old) fadeOut(old, old.looping ? TO_BATTLE : CROSSFADE);
      current = launch(
        ctx,
        out,
        files,
        VOLUME.battle,
        old ? (old.looping ? TO_BATTLE : CROSSFADE) : 1.5,
        list.length === 1,
      );
      watch();
    } else {
      const files = await decodeTrack(ctx, MENU);
      if (!files || want !== goal) return;
      current = launch(ctx, out, files, VOLUME.menu, 1.5, true);
    }
  } finally {
    busy = false;
  }
}

/** Once a second: decode the next track shortly before the crossfade, and crossfade into it when the time comes. */
function watch() {
  if (timer) return;
  timer = setInterval(() => {
    const goal = want;
    const output = audioOutput();
    if (!output || !current || goal?.kind !== 'battle' || current.looping) return;
    const { ctx, out } = output;
    const list = PLAYLISTS[goal.theme];
    const next = BATTLE[list[nextIndex(rotation, list.length)]!];
    const s = stage(current.at, current.dur, ctx.currentTime);
    if (s === 'play') return;
    preload ??= decodeTrack(ctx, next).then((f) => f?.loop);
    if (s !== 'crossfade' || busy) return;
    busy = true;
    const old = current;
    void preload
      .then((loop) => {
        if (!loop || want !== goal || current !== old) return;
        rotation = nextIndex(rotation, list.length);
        fadeOut(old, CROSSFADE);
        current = launch(ctx, out, { loop }, VOLUME.battle, CROSSFADE, false);
      })
      .finally(() => {
        preload = undefined;
        busy = false;
      });
  }, 1000);
}

/** Fade the music and the ambience out (the match is over, or the player left). */
export function stopMusic() {
  want = undefined;
  stopAmbience();
  if (timer) clearInterval(timer);
  timer = undefined;
  preload = undefined;
  if (!current) return;
  fadeOut(current, FADE);
  current = undefined;
}

/** The title's music again (after a match). */
export function backToTitle() {
  stopMusic();
  playMenuMusic();
}

playMenuMusic(); // waits for the first gesture
