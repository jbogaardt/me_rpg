// The DM bringing someone into the story: a wanderer met on the road, made on the spot and set near the party. `shouldConjure`
// picks the moment (pure, tested); a `Conjurer` invents the person (name, which look from the world's people they wear,
// what they say). The mock draws from a few stock characters; a creative model slots in behind the same interface, and
// the page checks whatever it makes (a name, 1-4 lines, a look that exists), so a bad invention is refused, never shown.

import type { Beat } from './narrate';

/** A person the DM makes: what the page's `spawn` takes. */
export interface Person {
  name: string;
  /** The id of a person of the packs whose look they wear. */
  look: string;
  lines: string[];
}

export interface Conjurer {
  /** Someone fitting the place; `looks` are the looks on offer, `made` how many the DM has made so far. */
  person(want: { area: string; looks: { id: string; name: string }[]; made: number }): Promise<Person | null>;
}

/** Most people the bot makes in one game, and least time between two. */
export const MAX_PEOPLE = 6;
export const CONJURE_GAP_MS = 120_000;

/** Is it time for a stranger? On arriving somewhere new, never too many and never too soon after the last. */
export function shouldConjure(beat: Beat | null, made: number, since: number): boolean {
  return beat?.kind === 'arrive' && made < MAX_PEOPLE && since >= CONJURE_GAP_MS;
}

const STOCK: { name: string; lines: string[] }[] = [
  {
    name: 'Old Brannoch',
    lines: [
      'Ah, travellers! Few come this way and fewer return. Keep your blades near and your wits nearer.',
      'I have walked these roads since before your grandfathers were born. Trust the road, but not what waits beside it.',
    ],
  },
  {
    name: 'Sera of the Reeds',
    lines: [
      'You have the look of folk who are going somewhere. Mind the shadows ahead: they are not what they seem.',
      'A friend told me once: the brave are only the frightened who walked on. Walk on.',
    ],
  },
  {
    name: 'Tobin Quillfeather',
    lines: [
      'Stories are my trade, friends, and yours is just beginning. Make it a good one!',
      'Seek those who need aid. Gold fades, but a debt of thanks outlasts kingdoms.',
    ],
  },
  {
    name: 'The Grey Pilgrim',
    lines: [
      'Not all who wander are lost, and not all who wait are idle. I have been waiting for you.',
      'Go well. When the dark comes, remember you did not come here alone.',
    ],
  },
];

/** Stock strangers, each wearing a different look in turn. */
export class MockConjurer implements Conjurer {
  person({
    looks,
    made,
  }: {
    area: string;
    looks: { id: string; name: string }[];
    made: number;
  }): Promise<Person | null> {
    const look = looks[made % Math.max(1, looks.length)];
    const who = STOCK[made % STOCK.length];
    if (!look || !who) return Promise.resolve(null);
    // A name is a person once: the second Brannoch is "Brannoch the Younger".
    const name = made >= STOCK.length ? `${who.name} the Younger` : who.name;
    return Promise.resolve({ name, look: look.id, lines: who.lines });
  }
}
