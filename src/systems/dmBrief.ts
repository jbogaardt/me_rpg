// What the Dungeon Master tells the party when they give a quest (Pixi-free, tested; core engine). The quest on the wire
// is only a title, a kind and what it wants, so the telling is written here from those and the names the caller knows
// (the foe, the plant, the item, the land): every page is built on each player's own screen, with nothing more to send.
// It is as long as an NPC's offer: why it matters, what to do, and how to go about it.

import type { TaskView } from './dmTasks';
import { hashOf, seeded } from './phrases';

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
const the = (area: string): string => (/^the\s/i.test(area) ? area : `the ${area}`);

/**
 * What the quest asks, as plainly as the tracker does ("Defeat 4 Goblins in the Mirewood."). Whatever else the Dungeon
 * Master says about a quest, this is said with it, so the story and the task never disagree about what is wanted.
 */
export function objective(v: TaskView, names: BriefNames): string {
  const where = ` in ${names.area(v.zone)}`;
  const n = v.goal;
  switch (v.kind) {
    case 'hunt': {
      const foe = names.foe(v.what);
      return `Defeat ${n} ${n > 1 ? plural(foe) : foe}${where}.`;
    }
    case 'gather': {
      const site = names.site(v.what);
      return `Collect ${n} ${n > 1 ? plural(site) : site}${where}.`;
    }
    case 'find':
      return `Find ${names.item(v.what)}${where}.`;
    default:
      return `Reach ${v.what}${where}.`;
  }
}

/**
 * The pages of a quest's telling, in the DM's voice (three of two or three sentences). Each page has several wordings,
 * chosen by the quest (so every page shows the same telling) and apart from each other, so two quests alike are not told
 * alike. Nothing is said of the map: the party is told what and where in words, and reads the land; the DM marks the map
 * only once they are lost (`dmTasks.ts` `HINT_AREA`).
 */
export function briefing(v: TaskView, names: BriefNames): string[] {
  const key = `${v.kind}${v.zone}${v.what}${v.title}`;
  const page = (i: number, lines: string[]): string => seeded(lines, hashOf(`${key}${i}`));
  const area = names.area(v.zone);
  const where = the(area);
  const n = v.goal;
  switch (v.kind) {
    case 'hunt': {
      const foe = plural(names.foe(v.what));
      return [
        page(0, [
          `Listen closely. ${foe} have been massing in ${where}, bolder with every passing day. Travellers turn back before they ever reach the far road, and nobody who lives nearby will walk it after dark.`,
          `Trouble is stirring in ${where}. The ${foe} there have lost their fear of folk, and what begins as a nuisance will not stay one for long.`,
          `${foe} are overrunning ${where}. Left alone they will only grow in number and in nerve, and I would sooner see them dealt with now.`,
          `A shepherd came to me with torn sleeves and a white face. ${foe}, he said, in ${where}, more than he had ever seen in one place.`,
          `The folk of ${where} have stopped sending their children for water. ${foe} prowl the paths there now, and each week they come a little closer to the doors.`,
        ]),
        page(1, [
          `I need ${n} of them brought down. Stay together, keep an eye on each other's health, and do not let any of you be cut off from the rest. If the fight turns against you, fall back and catch your breath: there is no shame in it.`,
          `Bring down ${n} of them, no more is asked. Pick your fights, mind the ones who hang back, and do not chase a fleeing one into the dark.`,
          `${n} of them would break their nerve. Fight shoulder to shoulder, and if one of you falters, the rest close ranks.`,
          `Thin them by ${n} of them and the rest will scatter. Go steady: a tired arm misses, and a careless step costs more than time.`,
        ]),
        page(2, [
          `They are out there somewhere in ${where}; look for the trampled ground and the quiet where birds should be. The moment the last one falls, the reward is yours, coin and experience for every one of you.`,
          `Ask the land, not me: tracks, broken branches, the smell of them. When it is done, the reward is shared among you all.`,
          `Where they gather, the wildlife flees, so walk toward the silence. Finish it and the reward will be waiting, for each of you alike.`,
        ]),
      ];
    }
    case 'gather': {
      const site = n > 1 ? plural(names.site(v.what)) : names.site(v.what);
      return [
        page(0, [
          `Something useful grows in ${where}, if you know where to look. The ${site} there are what we need, and they will not wait for us to come to our senses.`,
          `${area} holds ${site}, scattered where few ever walk. We are short of them, and there is no other place to get them.`,
          `The ${site} of ${where} are what the days ahead call for. They are not easy to spot: they hide, and the land does not give them up to the careless.`,
          `The healer's shelves are bare, and she swears by the ${site} of ${where}. I have promised her some, and I would rather not break a promise to a healer.`,
        ]),
        page(1, [
          `Bring back ${n}: you need only touch each one, and it counts for the whole party, so spread out if you must but do not wander off alone into the dark parts of the wood.`,
          `${n} will do. A touch is enough for each, and what one of you finds counts for all.`,
          `We need ${n}. Split up to cover the ground if you like, but stay within a shout of each other.`,
        ]),
        page(2, [
          `They keep to the edges: under trees, by water, among the stones others walk past. When the last is found, the work is done and the reward is shared among you.`,
          `Walk slowly and look low; they are easy to pass by at a run. Find the last and the reward is yours, every one of you.`,
          `Take your time over it, the land is wide. When the last is in hand, the reward comes to all of you.`,
        ]),
      ];
    }
    case 'find':
      return [
        page(0, [
          `Long ago something was lost in ${where}, and it has waited all this time for someone worth giving it to. Tonight the old stories say it glows, if you are close enough to see it.`,
          `There is an old thing hidden somewhere in ${where}. I will not say who hid it, nor why, only that it is real and that you are the ones I would trust to find it.`,
          `A dying peddler once told me of a thing he buried in ${where} and never went back for. I believed him then, and I believe him now.`,
        ]),
        page(1, [
          `What you are looking for is ${names.item(v.what)}. Whoever lays hands on it first keeps it, so decide between you who should carry it before you quarrel over it.`,
          `It is ${names.item(v.what)}. One of you will carry it out, so settle now who that should be.`,
        ]),
        page(2, [
          `It will be somewhere away from the beaten path, where nobody would trip over it by chance. A glowing thing will mark the spot once you are near. Mind what lives between here and there.`,
          `Search the quiet corners, far from where folk usually walk. You will know it by its glow when you are close.`,
          `Do not look where it is easy to look; that has been done. It glows when you are near, and the land around it is never quite still.`,
        ]),
      ];
    default:
      return [
        page(0, [
          `There is a place in ${where} that I need you to reach: ${v.what}. Nobody has been able to tell me what waits there, and that is exactly why I am sending you.`,
          `I want eyes on ${v.what}, in ${where}. Go there and see what the land has made of it.`,
          `${v.what}, in ${where}. Old friends of mine used to meet there. Nobody has gone in years, and I would like to know why.`,
        ]),
        page(1, [
          `It will take you a while, and the way is not marked. Go carefully, keep together, and do not stop to pick fights that are not yours.`,
          `It is not far as the crow flies, but you are not crows. Take the roads where you can, and keep each other in sight.`,
          `There is no hurry worth getting hurt over. Walk it, look about you, and stop wherever the land asks you to.`,
        ]),
        page(2, [
          `Ask the land: paths lead to places, and places leave paths. Once any one of you stands within sight of it, the task is done for all.`,
          `You will know it when you see it. As soon as one of you reaches it, it counts for all.`,
        ]),
      ];
  }
}
