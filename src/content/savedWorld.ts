// A live world saved to a file and loaded again (Pixi-free, tested): the world is its seed, the arc it tells and its
// log (content/world.ts), so that is all a save holds. Loading one opens the page on that world (the address's seed and
// arc) and replays the log; friends who join catch up from the host's log as always.

import type { LogEntry, World } from './world';

export interface SavedWorld {
  /** What this is, for a file someone opens. */
  kind: 'me_rpg-world';
  version: 1;
  seed: number;
  arc: string;
  log: LogEntry[];
}

/** The world as a save. */
export const saveWorld = (world: World): SavedWorld => ({
  kind: 'me_rpg-world',
  version: 1,
  seed: world.seed,
  arc: world.arcName,
  log: [...world.log],
});

/** A save read from a file, or null when it is not one (the World checks every entry when it replays the log). */
export function readSavedWorld(json: unknown): SavedWorld | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as Partial<SavedWorld>;
  const ok =
    s.kind === 'me_rpg-world' &&
    s.version === 1 &&
    typeof s.seed === 'number' &&
    Number.isInteger(s.seed) &&
    s.seed >= 0 &&
    s.seed < 1e9 &&
    typeof s.arc === 'string' &&
    /^[\w-]{1,40}$/.test(s.arc) &&
    Array.isArray(s.log) &&
    s.log.length >= 1 &&
    s.log.length <= 500 &&
    s.log.every((e) => !!e && typeof e === 'object' && typeof (e as { t?: unknown }).t === 'string');
  return ok ? (s as SavedWorld) : null;
}

/** The address that opens a saved world (its log is handed over through session storage, `SAVED_KEY`). */
export const savedWorldSearch = (s: SavedWorld): string =>
  `?campaign=live&seed=${s.seed}&arc=${encodeURIComponent(s.arc)}`;

/** Where a world being loaded waits for the page to open on it. */
export const SAVED_KEY = 'me_rpg.loadWorld';
