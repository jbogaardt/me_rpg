// What music plays when (Pixi-free, cosmetic): the title's piece (an intro, then a loop) and the battle tracks, each map theme with
// its own small rotation so a long match does not loop one piece. Files are `public/audio/music/<id>.ogg`; one track is decoded at a
// time (the next only shortly before it is needed), which keeps phones' memory modest.

import type { Theme } from './soundClass';

export type TrackId = 'march' | 'glory' | 'siege' | 'stone' | 'deep';
export interface Track {
  /** The piece, played once in a match (then the next of the rotation) and looped by the title. */
  loop: string;
  /** Played before the loop (the title's). */
  intro?: string;
}

const file = (id: string) => `audio/music/${id}.ogg`;
export const MENU: Track = { intro: file('menu-intro'), loop: file('menu-loop') };
export const BATTLE: Record<TrackId, Track> = {
  march: { loop: file('march') },
  glory: { loop: file('glory') },
  siege: { loop: file('siege') },
  stone: { loop: file('stone') },
  deep: { loop: file('deep') },
};

/** Each theme's rotation, its own mood first (the Germanic pieces for the greenwood and the sands, the dwarven for the frost and the fire). */
export const PLAYLISTS: Record<Theme, readonly TrackId[]> = {
  greenwood: ['march', 'glory', 'siege'],
  frostlands: ['stone', 'deep', 'siege'],
  desert: ['glory', 'siege', 'stone'],
  mire: ['siege', 'deep', 'march'],
  ember: ['deep', 'stone', 'glory'],
};

/** The index after `i` in a rotation of `n` (wrapping). */
export const nextIndex = (i: number, n: number): number => (n <= 0 ? 0 : (i + 1) % n);

/** Seconds the old track fades out while the next fades in, and how long before a track's end the crossfade begins. */
export const CROSSFADE = 5;
/** How early (seconds before the crossfade) the next track starts to load. */
export const PRELOAD = 20;

/** When to act on a track that started at `at` and lasts `dur` seconds, at context time `now`. */
export function stage(at: number, dur: number, now: number): 'play' | 'preload' | 'crossfade' {
  const left = at + dur - now;
  return left <= CROSSFADE ? 'crossfade' : left <= CROSSFADE + PRELOAD ? 'preload' : 'play';
}

/** Every music file the game names. */
export const musicFiles = (): string[] => [MENU.intro!, MENU.loop, ...Object.values(BATTLE).map((t) => t.loop)];
