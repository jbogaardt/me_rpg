// What the Dungeon Master tells the party when they give a quest (Pixi-free, tested; core engine). The quest on the wire
// is only a title, a kind and what it wants, so the telling is written here from those and the names the caller knows
// (the foe, the plant, the item, the land): every page is built on each player's own screen, with nothing more to send.
// It is as long as an NPC's offer: why it matters, what to do, and how to go about it.

import type { TaskView } from './dmTasks';

/** The names a briefing needs, looked up by whoever tells it. */
export interface BriefNames {
  /** A foe kind's name by its key ("Goblin"). */
  foe(key: string): string;
  /** A quest site kind's name ("Echostone"). */
  site(kind: string): string;
  /** An item's name by its id, with its article ("the Wayfarer's Charm"). */
  item(id: string): string;
  /** A zone's name ("The Greenwood"). */
  area(zone: string): string;
}

/** Most of what a DM may write as their own instructions for a quest. */
export const MAX_NOTE = 240;

/** The DM's own instructions as they travel: trimmed, one line, no longer than `MAX_NOTE`. */
export const cleanNote = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE).trim();

const plural = (name: string): string => (/s$/i.test(name) ? name : `${name}s`);
const hash = (s: string): number => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T>(list: T[], seed: number): T => list[seed % list.length]!;
const the = (area: string): string => (/^the\s/i.test(area) ? area : `the ${area}`);

/** The pages of a quest's telling, in the DM's voice (three of two or three sentences). */
export function briefing(v: TaskView, names: BriefNames): string[] {
  const seed = hash(`${v.kind}${v.zone}${v.what}${v.title}`);
  const area = names.area(v.zone);
  const where = the(area);
  const n = v.goal;
  const search =
    'You will not be told exactly where. Read the land, and open the map (M): the gold circle shows the area to search.';
  switch (v.kind) {
    case 'hunt': {
      const foe = plural(names.foe(v.what));
      return [
        pick(
          [
            `Listen closely. ${foe} have been massing in ${where}, bolder with every passing day. Travellers turn back before they ever reach the far road, and nobody who lives nearby will walk it after dark.`,
            `Trouble is stirring in ${where}. The ${foe} there have lost their fear of folk, and what begins as a nuisance will not stay one for long.`,
            `${foe} are overrunning ${where}. Left alone they will only grow in number and in nerve, and I would sooner see them dealt with now.`,
          ],
          seed,
        ),
        `I need ${n} of them brought down. Stay together, keep an eye on each other's health, and do not let any of you be cut off from the rest. If the fight turns against you, fall back and catch your breath: there is no shame in it.`,
        `${search} The moment the last one falls, the reward is yours, coin and experience for every one of you.`,
      ];
    }
    case 'gather': {
      const site = n > 1 ? plural(names.site(v.what)) : names.site(v.what);
      return [
        pick(
          [
            `Something useful grows in ${where}, if you know where to look. The ${site} there are what we need, and they will not wait for us to come to our senses.`,
            `${area} holds ${site}, scattered where few ever walk. We are short of them, and there is no other place to get them.`,
            `The ${site} of ${where} are what the days ahead call for. They are not easy to spot: they hide, and the land does not give them up to the careless.`,
          ],
          seed,
        ),
        `Bring back ${n}: you need only touch each one, and it counts for the whole party, so spread out if you must but do not wander off alone into the dark parts of the wood.`,
        `${search} When the last is found, the work is done and the reward is shared among you.`,
      ];
    }
    case 'find':
      return [
        pick(
          [
            `Long ago something was lost in ${where}, and it has waited all this time for someone worth giving it to. Tonight the old stories say it glows, if you are close enough to see it.`,
            `There is an old thing hidden somewhere in ${where}. I will not say who hid it, nor why, only that it is real and that you are the ones I would trust to find it.`,
          ],
          seed,
        ),
        `What you are looking for is ${names.item(v.what)}. Whoever lays hands on it first keeps it, so decide between you who should carry it before you quarrel over it.`,
        `${search} A glowing thing will mark the spot once you are near. Mind what lives between here and there.`,
      ];
    default:
      return [
        pick(
          [
            `There is a place in ${where} that I need you to reach: ${v.what}. Nobody has been able to tell me what waits there, and that is exactly why I am sending you.`,
            `I want eyes on ${v.what}, in ${where}. Go there and see what the land has made of it.`,
          ],
          seed,
        ),
        `It will take you a while, and the way is not marked. Go carefully, keep together, and do not stop to pick fights that are not yours.`,
        `${search} Once any one of you stands within sight of it, the task is done for all.`,
      ];
  }
}
