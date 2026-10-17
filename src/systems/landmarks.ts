// What the DM's words put in the world (Pixi-free, tested; core engine, local to each page): when a quest's telling names a
// thing to be found (a wagon, a well, a camp), or the quest is to find an item, something that looks like it is drawn at
// the goal, so the party is never sent to look for what is not there. Nothing is sent over the wire: every page reads the
// same task (its `what` and the DM's note) and draws the same thing (`entities/Landmark.ts` draws the shapes).

import type { IconKind } from './inventory';

export type LandmarkShape = 'cart' | 'well' | 'campfire' | 'tent' | 'shrine' | 'grave' | 'ruin' | 'tower' | 'hut';

/**
 * Where the pieces of the `ruin` landmark sit on public/tilesets/ruins.png (the LPC Jungle Ruins cut, tools/map/ruins.ts):
 * a snapped pillar, a standing idol and a tumbled block. `tools/map/ruins.test.ts` checks them against the atlas.
 */
export const RUIN_FRAMES = {
  pillar: { x: 224, y: 896, w: 32, h: 96 },
  idol: { x: 288, y: 896, w: 32, h: 96 },
  rubble: { x: 470, y: 896, w: 21, h: 39 },
} as const;

/** What each landmark is called in a telling. The earliest one a text names is the one drawn. */
const WORDS: [LandmarkShape, RegExp][] = [
  ['cart', /\b(?:carts?|wagons?|caravan)\b/i],
  ['well', /\b(?:(?:a|an|the|old|stone|village|dry|ruined)\s+wells?)\b/i],
  ['campfire', /\b(?:campfires?|bonfires?|fire\s?pit|camp)\b/i],
  ['tent', /\b(?:tents?|pavilion)\b/i],
  ['shrine', /\b(?:shrines?|altars?|statues?|idol|standing stones?)\b/i],
  ['grave', /\b(?:graves?|graveyard|tombs?|crypt|barrow|burial)\b/i],
  ['ruin', /\b(?:ruins?|broken (?:wall|arch|column)s?|pillars?)\b/i],
  ['tower', /\b(?:watchtower|towers?|lighthouse|beacon)\b/i],
  ['hut', /\b(?:huts?|cabin|cottage|shack|farmstead)\b/i],
];

/** The landmark a text names first, if it names one. */
export function landmarkIn(text: string): LandmarkShape | undefined {
  let best: { shape: LandmarkShape; at: number } | undefined;
  for (const [shape, re] of WORDS) {
    const at = text.search(re);
    if (at >= 0 && (!best || at < best.at)) best = { shape, at };
  }
  return best?.shape;
}

/** What a quest to find an item shows: a thing shaped like it (a blade, a staff, a book, a shield, a pouch or a gem). */
export type RelicShape = 'blade' | 'staff' | 'book' | 'shield' | 'pouch' | 'gem';

export function relicShape(icon: IconKind | undefined): RelicShape {
  switch (icon) {
    case 'sword':
    case 'dagger':
    case 'bow':
      return 'blade';
    case 'wand':
      return 'staff';
    case 'tome':
      return 'book';
    case 'shield':
    case 'helm':
    case 'armor':
    case 'greaves':
    case 'boot':
    case 'cape':
      return 'shield';
    case 'sack':
    case 'backpack':
    case 'tool':
    case 'food':
      return 'pouch';
    default:
      return 'gem'; // a charm, or something with no picture of its own
  }
}

/** A quest's own words for where its goal is: what a landmark is looked for in (the place, then the DM's telling). */
export function landmarkText(task: { what: string; note?: string; title: string }): string {
  return `${task.what} ${task.note ?? ''} ${task.title}`;
}
