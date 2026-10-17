// What the DM's words put in the world (Pixi-free, tested; core engine, local to each page): when a quest's telling names a
// thing to be found (a wagon, a well, a camp), it is drawn at the goal, so the party is never sent to look for what is not there. Nothing is sent over the wire: every page reads the
// same task (its `what` and the DM's note) and draws the same thing (`entities/Landmark.ts` draws each shape from stored pixel art).

export type LandmarkShape =
  'cart' | 'well' | 'campfire' | 'tent' | 'shrine' | 'grave' | 'ruin' | 'tower' | 'belltower' | 'church' | 'hut';

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
  ['belltower', /\b(?:bell[- ]?towers?|belfry|steeple)\b/i],
  ['church', /\b(?:church(?:es)?|chapel|cathedral|abbey|monastery)\b/i],
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

/** A quest's own words for where its goal is: what a landmark is looked for in (the place, then the DM's telling). */
export function landmarkText(task: { what: string; note?: string; title: string }): string {
  return `${task.what} ${task.note ?? ''} ${task.title}`;
}
