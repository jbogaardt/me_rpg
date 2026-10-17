// What the Dungeon Master tells the party when they give a quest (Pixi-free, tested; core engine). The quest on the wire
// is only a title, a kind and what it wants, so the telling is written here from those and the names the caller knows
// (the foe, the plant, the item, the land): every page is built on each player's own screen, with nothing more to send.
// It is as long as an NPC's offer: why it matters, what to do, and how to go about it.

import type { TaskView } from './dmTasks';
import { nameOfBossTitle, parseBossWhat } from './dmBoss';
import { parseMastery } from './dmQuests';
import { hashOf, seeded } from './phrases';
import { SPELLS, arrows, directionWords, type SpellId } from './spells';

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
  /** For a forge quest: what the piece to make (an item id) is made of, in names ("Emerald", "Steel Sword") and what it is called. */
  recipe?(id: string): { gem: string; base: string; made: string } | null;
}

/** Most of what a DM may write as their own instructions for a quest. */
export const MAX_NOTE = 240;

/** The DM's own instructions as they travel: trimmed, one line, no longer than `MAX_NOTE`. */
export const cleanNote = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE).trim();

/** A name with its article ("an Emerald", "a Steel Sword"). */
export const an = (name: string): string => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

const plural = (name: string): string => (/s$/i.test(name) ? name : `${name}s`);
const the = (area: string): string => (/^the\s/i.test(area) ? area : `the ${area}`);

/** A mastery quest's spell: its name, and the arrows (and words) that cast it. */
function masteryOf(v: TaskView): { name: string; arrows: string; words: string } {
  const m = parseMastery(v.what);
  const name = m ? (SPELLS[m.spell as SpellId]?.name ?? m.spell) : 'the spell';
  return { name, arrows: m ? arrows(m.keys) : '', words: m ? directionWords(m.keys) : '' };
}

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
    case 'cast':
      return `Cast ${n} spells${where}.`;
    case 'forge': {
      const r = names.recipe?.(v.what);
      return r
        ? `Set ${an(r.gem)} in ${an(r.base)}, from the Inventory tab, and the ${r.made} is yours.`
        : `Make ${names.item(v.what)}, from the Inventory tab.`;
    }
    case 'haul':
      return `Carry ${n} ${n > 1 ? 'barrels' : 'barrel'} to ${v.what}${where}.`;
    case 'boss':
      return `Defeat ${nameOfBossTitle(v.title)}${where}.`;
    case 'master': {
      const m = masteryOf(v);
      return `Cast ${m.name} ${n} ${n > 1 ? 'times' : 'time'}${where}: ${m.arrows}.`;
    }
    default:
      return `Reach ${v.what}${where}.`;
  }
}

/**
 * The pages of a quest's telling, in the DM's voice (three of two or three sentences). Each page has several wordings,
 * chosen by the quest (so every page shows the same telling) and apart from each other, so two quests alike are not told
 * alike. Nothing is said of the map (it is the party's own): the party is told what and where in words, and reads the land;
 * the DM offers a compass only once they are lost (`dmTasks.ts` `HINT_AREA`).
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
    case 'cast':
      return [
        page(0, [
          `Magic is a muscle, and yours has gone soft. ${area} is quiet enough to practise in, and the days ahead will want every spell you have.`,
          `An old teacher of mine used to say a spell untried is a spell forgotten. Prove her wrong in ${where}.`,
          `Something in ${where} answers to magic: the air hums when it is woken. Wake it, and let us see what stirs.`,
        ]),
        page(1, [
          `Cast ${n} spells, any you know: hold your focus, tap the pattern, and let it go. It counts for the whole party, whoever casts.`,
          `${n} spells will do. Mind your strength: an empty well casts nothing, so rest between if you must.`,
          `Work ${n} spells, as many hands as you like. Practise on the air, or on whatever comes at you.`,
        ]),
        page(2, [
          `There is nothing to find and nowhere to be: only the doing of it. When the last spell is cast, the reward is yours, every one of you.`,
          `Do it anywhere in ${where}. When the count is made, the reward is shared among you.`,
        ]),
      ];
    case 'forge': {
      const r = names.recipe?.(v.what) ?? { gem: 'a gem', base: 'a good piece of gear', made: names.item(v.what) };
      const gem = r.gem;
      const base = r.base;
      return [
        page(0, [
          `A stone does nothing but sit pretty until somebody has the sense to set it in something. You are carrying ${an(gem)}, and ${an(base)} that could do with a little more than steel and good intentions.`,
          `Gems are the most honest bargain in the world: they ask nothing of you but a place to sit. I propose you give ${an(gem)} one, in your ${base}.`,
          `Every smith worth a hammer will tell you the same thing: a plain blade is a promise, a set stone is a contract. I would see your ${base} and ${an(gem)} brought to terms.`,
          `There is an old saying in the forge towns: never carry a gem you could wear. ${an(gem)} and ${an(base)} between you are a waste of two perfectly good things.`,
          `I have watched you walk past good fortune with your hands in your pockets. ${an(gem)}, ${an(base)}, and not an ounce of imagination between the two. We shall mend that.`,
        ]),
        page(1, [
          `Open your pack, choose the ${gem}, and set it in the ${base}: the stone is spent and the piece is made new, and it will not forgive you if you forget which is which.`,
          `It is simple, and a little irreversible. Pick the ${gem} in your pack, pick the ${base}, and ask for them to be joined. You will hold ${an(r.made)}, and no ${gem} thereafter.`,
          `The ${gem} goes in the ${base}: from the Inventory tab, with the stone chosen and the piece beside it. One of you doing it is enough, and the stone is gone once it is done.`,
          `Do it from your pack: select the ${gem}, and say where it goes. What comes out is ${an(r.made)}, worth more than the sum of its parts, which is the only sort of arithmetic I approve of.`,
        ]),
        page(2, [
          `If you do not have the stone yet, a smith will sell you one, and the price is quite fair. Make it once, make it properly, and the reward is yours, every one of you.`,
          `There is no map for this, no beast to fell, and no one to blame but yourselves. Set the stone and the reward follows: a new piece of gear for each of you, and that will be my way of saying well done.`,
          `Nothing to hunt, nothing to find, only a choice to make and the nerve to make it. When the piece is made, the reward is shared among you all.`,
        ]),
      ];
    }
    case 'haul':
      return [
        page(0, [
          `The folk of ${where} are moving their stores before the weather turns, and their backs are not what they were. ${v.what} is where it all must go.`,
          `Someone left good barrels lying about ${where}, and the keepers at ${v.what} would put them to use. It is honest work, and it is wanted.`,
          `A wall of barrels by ${v.what} would turn the wind, and the cold, and perhaps something worse. ${area} has the barrels; you have the arms.`,
        ]),
        page(1, [
          `Carry ${n} of them, one at a time: lift it, walk it over, and set it down close by ${v.what}. Each counts once, for all of you.`,
          `${n} barrels, set down near ${v.what}. Pick one up with the action key, set it down the same way. You cannot fight with one in your arms, so look about first.`,
        ]),
        page(2, [
          `They are scattered where barrels are always scattered: by walls, carts and doors. When the last is in place, the reward is yours, every one of you.`,
          `Take the easy ones first and the far ones last. When the count is made, the reward is shared among you.`,
        ]),
      ];
    case 'boss': {
      const boss = nameOfBossTitle(v.title);
      const kind = parseBossWhat(v.what)?.key;
      const foe = kind ? names.foe(kind) : 'beast';
      return [
        page(0, [
          `Gather close, and lower your voices. Something has grown fat in ${where}: ${boss}, a ${foe} the size of a cottage, who has eaten every rumour that dared go near it.`,
          `I have a tale for you, and it has teeth. In ${where} there is ${boss}. Once it was only a ${foe}. Then it kept winning.`,
          `Every land has one creature the others are afraid of. In ${where} it is ${boss}. I have it on good authority, which is to say a very frightened shepherd.`,
          `The folk of ${where} no longer say its name aloud, so I shall: ${boss}. A ${foe}, they swear, grown past all reason. I swore back that you would see to it.`,
        ]),
        page(1, [
          `This will not be a skirmish. It is ${foe}-sized in nothing but its ancestry; the rest of it is a nightmare with a title. Fight it together, watch for the slow wind-up before every blow, and step aside rather than step back.`,
          `Do not trade blows with it for pride. Its swing is slow and it is a hammer: when it lifts, move. Keep one another on your feet, and if the fight turns, there is no shame in running to breathe.`,
          `It will hit like a falling wall, so see to your health before you go and spread out: it can only be in one place at a time, and I intend that place to be somewhere else for each of you in turn.`,
        ]),
        page(2, [
          `It keeps to its own ground, a good walk from here. Look for what flees from it. Fell it, and the reward is yours, every one of you, richer than any hunt, and I will tell the story ever after.`,
          `Follow the quiet, and the tracks the size of dinner plates. When it falls, and it will, the reward is shared among you all, with my compliments and a ballad.`,
          `You will know it by the size of it, and by how little else is left alive near it. Bring it down and the reward is yours: coin, experience, and the right to be insufferable at dinner.`,
        ]),
      ];
    }
    case 'master': {
      const m = masteryOf(v);
      return [
        page(0, [
          `A tome unread is a candle in a drawer. Yours knows ${m.name}, and I would see it done properly, not merely owned. Mastery is only repetition with ambition.`,
          `I have watched you wave your wands about, and I will say this kindly: ${m.name} deserves better. Let us make a habit of it, before it makes a fool of you.`,
          `Every spell has a rhythm, and ${m.name} has been waiting for yours. Learn it in the fingers, not the head. The head forgets.`,
        ]),
        page(1, [
          `Cast ${m.name} ${n} times in ${where}. Hold the wand or tome that teaches it and tap the arrows in order, ${m.arrows} (${m.words}), with the move keys or a flick of the D-pad. Other spells do not count, only this one, so mind your mana.`,
          `${n} casts of ${m.name}, and only that: it is ${m.arrows}, which is to say ${m.words}. Use the move keys or the D-pad, in order, quickly. A cast that fizzles for want of mana does not count, so rest between.`,
          `Enter ${m.arrows} (${m.words}) to cast ${m.name}, and do it ${n} times. It counts for the whole party, whoever casts it, but only the one spell.`,
        ]),
        page(2, [
          `There is nothing to find and nowhere to be. Practise in ${where}, on the air or on whatever comes at you. When the last cast is made, the reward is yours, every one of you.`,
          `A quiet corner of ${where} will do, or the thick of a fight, if you are showing off. The count is kept for me; the reward is shared when it is done.`,
        ]),
      ];
    }
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
