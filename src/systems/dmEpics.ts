// Epic quests: sagas the Dungeon Master can launch, a chain of the DM's ordinary quests that carries the party across
// several lands (Pixi-free, tested; core engine, co-op). Each is a template of steps ("hunt one land over, then gather two
// lands over, then find a relic three over"), planned onto the zones of whatever world is being played by walking its
// links, so the same saga is told differently in each world and never names a content id. Every saga carries a gauge: how
// hard it is, how long it runs and how far it goes, so the DM can pick one to fit the evening.

import type { TaskKind } from './dmTasks';

/** One step of a saga. */
export interface EpicStep {
  kind: TaskKind;
  /** How many lands from where the saga starts this step is set (0: here, 1: the next land over...). */
  hop: number;
  /** What the DM tells the party for this step, in a line or two. `{area}` is the land it is set in, `{from}` the last. */
  tell: string;
}

export interface EpicTemplate {
  id: string;
  title: string;
  /** One line to choose it by. */
  tagline: string;
  /** How hard it is on its own, 1 (a stroll) to 5 (a trial). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** What the DM says as it begins and as it ends. */
  opening: string;
  ending: string;
  steps: EpicStep[];
}

/** The lands of a world, as a saga needs to see them. */
export interface ZoneGraph {
  /** The lands next to one (walkable from it). */
  neighbours(zone: string): string[];
  /** Is it open country (not a shop or a room)? Sagas are only set in open country. */
  open(zone: string): boolean;
}

export interface EpicPlan {
  epic: EpicTemplate;
  /** The land each step is set in. */
  zones: string[];
}

export interface Gauge {
  /** 1 (a stroll) to 5 (a trial). */
  difficulty: number;
  length: 'Short' | 'Medium' | 'Long' | 'Grand';
  steps: number;
  /** Different lands it passes through. */
  lands: number;
  /** About how long it takes to play, in minutes. */
  minutes: number;
}

/** Rough minutes for one quest of each kind, and for walking between two lands. */
const MINUTES: Record<TaskKind, number> = { hunt: 4, gather: 5, find: 6, visit: 3 };
const TRAVEL = 1.5;

export const EPICS: EpicTemplate[] = [
  {
    id: 'quiet_errands',
    title: 'Quiet Errands',
    tagline: 'A few chores close to home that turn out to matter.',
    difficulty: 1,
    opening:
      'It begins small, the way these things do. A few errands, and a feeling that they are not as idle as they seem.',
    ending: 'The errands are done, and the land is a little safer for them. Small things, rightly done, add up.',
    steps: [
      {
        kind: 'gather',
        hop: 0,
        tell: 'First, the simple part: {area} holds what we need, and the rest of what follows depends on it. Bring it together.',
      },
      {
        kind: 'visit',
        hop: 0,
        tell: 'Next, someone must see for themselves what has become of a place in {area}. Go, look, and carry back the truth.',
      },
      {
        kind: 'hunt',
        hop: 0,
        tell: 'What you saw was no accident. Whatever is stirring in {area} must be put down before it spreads.',
      },
    ],
  },
  {
    id: 'long_road',
    title: 'The Long Road',
    tagline: 'A journey out through the lands, with trouble at every stop.',
    difficulty: 2,
    opening: 'A road runs out of here through the lands, and every stop along it holds a task. Walk it to the end.',
    ending: 'The road is walked, and those who walked it are not the ones who set out.',
    steps: [
      {
        kind: 'visit',
        hop: 1,
        tell: 'The road begins in {area}. Go there first and see what waits. Nobody has been that way in some time.',
      },
      {
        kind: 'hunt',
        hop: 1,
        tell: 'The road is not safe. In {area}, creatures have claimed it. Clear them, and travellers can pass again.',
      },
      {
        kind: 'gather',
        hop: 2,
        tell: 'Beyond {from} lies {area}, where what we need grows. Take it, and the road pays for itself.',
      },
      {
        kind: 'find',
        hop: 2,
        tell: "At the road's end, in {area}, something old lies hidden. Find it, and the journey will have meant something.",
      },
    ],
  },
  {
    id: 'great_hunt',
    title: 'The Great Hunt',
    tagline: 'Drive the danger back, land by land, to its source.',
    difficulty: 3,
    opening:
      'A threat has been spreading from land to land. Follow it back to where it began, and do not stop until it does.',
    ending: 'The hunt is over. Whatever drove the beasts has gone quiet, and the lands breathe again.',
    steps: [
      { kind: 'hunt', hop: 0, tell: 'It starts here, in {area}. Thin their numbers, then follow where they flee.' },
      {
        kind: 'hunt',
        hop: 1,
        tell: 'They have run to {area}, and they are angrier. Bring them down before they dig in.',
      },
      { kind: 'hunt', hop: 2, tell: 'Now {area}. Whatever is leading them is near. Deal with those around it first.' },
      {
        kind: 'visit',
        hop: 3,
        tell: 'Their trail ends in {area}. Reach the place where it stops, and be ready for what you find.',
      },
    ],
  },
  {
    id: 'harvest_dark',
    title: 'A Harvest Against the Dark',
    tagline: 'Gather what the lands hold, while something stalks the gatherers.',
    difficulty: 2,
    opening:
      'The lands still give, if you know where to look, and something has noticed. Gather fast, and gather together.',
    ending: 'The harvest is in. It will keep the settlements through the dark, and that is all anyone asked.',
    steps: [
      {
        kind: 'gather',
        hop: 0,
        tell: 'The nearest of it grows here in {area}. Take what you can carry and keep your guard up.',
      },
      {
        kind: 'hunt',
        hop: 1,
        tell: 'Something follows the gatherers. In {area} it has gone from watching to hunting. End it.',
      },
      { kind: 'gather', hop: 1, tell: 'More grows in {area}, past where the stalker lurked. Take it too.' },
    ],
  },
  {
    id: 'lost_relics',
    title: 'The Lost Relics',
    tagline: 'Three old things, scattered across the lands, each worth a story.',
    difficulty: 3,
    opening:
      'Three things were hidden long ago in three different lands. Each is worth finding. Together, they are worth more.',
    ending: 'All three are found. Whatever they were made for, they will not sit in the dark any longer.',
    steps: [
      {
        kind: 'find',
        hop: 1,
        tell: 'The first lies somewhere in {area}. The old stories say it glows when someone worthy is near.',
      },
      {
        kind: 'find',
        hop: 2,
        tell: 'The second is in {area}. It has had longer to be forgotten, so it will be harder to see.',
      },
      {
        kind: 'find',
        hop: 3,
        tell: 'The third lies in {area}, farthest of all. If you have come this far, you will know what to look for.',
      },
    ],
  },
  {
    id: 'far_shrine',
    title: 'Pilgrimage to the Far Shrine',
    tagline: 'A long walk to a far place, with the lands watching.',
    difficulty: 3,
    opening: 'There is a shrine at the far edge of the world, and a long, patient way to get there. Walk it with care.',
    ending: 'The shrine is reached, and the long walk is over. Rest now. You have earned the quiet.',
    steps: [
      { kind: 'visit', hop: 1, tell: 'The pilgrimage starts in {area}. Go there and begin.' },
      {
        kind: 'visit',
        hop: 2,
        tell: 'Then {area}. The way is longer than it looks, and the land does not care that you are tired.',
      },
      { kind: 'visit', hop: 3, tell: 'On to {area}. Others have turned back here. Do not.' },
      { kind: 'hunt', hop: 3, tell: 'The shrine is guarded in {area}. Clear the way, and you will be let in.' },
    ],
  },
  {
    id: 'frontier_siege',
    title: 'The Siege of the Frontier',
    tagline: 'Hold the line, then carry the fight out into the wild.',
    difficulty: 4,
    opening:
      'The frontier is under siege and the settlements are calling for help. Break the siege, then take the fight to those behind it.',
    ending: 'The siege is broken, and those who laid it are scattered. The frontier will hold for now.',
    steps: [
      {
        kind: 'hunt',
        hop: 1,
        tell: 'The first wave has reached {area}. Break it, or there will be nothing left to defend.',
      },
      { kind: 'gather', hop: 2, tell: 'We need supplies to hold out. They grow in {area}. Bring them back, quickly.' },
      { kind: 'hunt', hop: 2, tell: 'A second wave is gathering in {area}. Strike it while it is still forming.' },
      { kind: 'hunt', hop: 3, tell: 'The leaders are in {area}. Bring them down and the rest will break.' },
      {
        kind: 'find',
        hop: 3,
        tell: 'In {area} they dropped what they came for. Find it, so they cannot come back for it.',
      },
    ],
  },
  {
    id: 'beyond_edge',
    title: 'Beyond the Edge of the Map',
    tagline: 'Into the farthest lands, where nobody has gone and returned.',
    difficulty: 4,
    opening:
      'Past the lands everyone knows are the lands almost nobody does. Go as far as the paths go, and then a little farther.',
    ending: 'You have gone farther than anyone, and come back. That is worth a story, and you will tell it well.',
    steps: [
      { kind: 'visit', hop: 2, tell: 'Start in {area}, where the maps begin to thin. Reach the place at its heart.' },
      {
        kind: 'gather',
        hop: 3,
        tell: 'In {area}, things grow that grow nowhere else. Gather them: the proof will be needed.',
      },
      {
        kind: 'hunt',
        hop: 4,
        tell: 'The farthest land, {area}, is no longer empty. Whatever lives there does not welcome visitors.',
      },
      {
        kind: 'find',
        hop: 4,
        tell: 'At the very edge of {area} there is something left by whoever came here first. Find it.',
      },
    ],
  },
  {
    id: 'hollow_crown',
    title: 'The Hollow Crown',
    tagline: "A king's lost regalia, a trail of grave-robbers, a long reckoning.",
    difficulty: 5,
    opening:
      'A crown was stolen, and with it, the right to rule. Follow the trail wherever it goes. Nobody who followed it has returned.',
    ending: 'The crown is found, and the trail is closed. What happens to it next is a story for another day.',
    steps: [
      {
        kind: 'find',
        hop: 1,
        tell: 'The first piece of the regalia is hidden in {area}. The thieves did not think anyone would look there.',
      },
      { kind: 'hunt', hop: 2, tell: 'In {area}, the thieves have made a camp and set guards. Break it.' },
      { kind: 'visit', hop: 3, tell: 'Their trail leads to {area}. Reach the place where it ends, and see who waits.' },
      { kind: 'hunt', hop: 3, tell: 'There are too many in {area} to simply walk past. Fight through.' },
      {
        kind: 'find',
        hop: 4,
        tell: 'The crown itself is somewhere in {area}. After all this, you will know it when you see it.',
      },
    ],
  },
];

const hash = (s: string): number => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);

/** Lands by distance from `start` through open country (index = number of lands crossed), nearest first. */
export function layers(graph: ZoneGraph, start: string): string[][] {
  const out: string[][] = [[start]];
  const seen = new Set([start]);
  for (let d = 0; out[d]!.length; d++) {
    const next: string[] = [];
    for (const z of out[d]!)
      for (const n of graph.neighbours(z)) {
        if (seen.has(n) || !graph.open(n)) continue;
        seen.add(n);
        next.push(n);
      }
    if (!next.length) break;
    out.push(next);
  }
  return out;
}

/**
 * Put a saga onto the world from `start`: each step in a land `hop` lands away (the farthest there is, if the world is
 * smaller than the saga), never the same land twice running when it could be another. Null when the start is not open
 * country (a saga is not told in a shop).
 */
export function planEpic(epic: EpicTemplate, start: string, graph: ZoneGraph, seed = 0): EpicPlan | null {
  if (!graph.open(start)) return null;
  const rings = layers(graph, start);
  const zones: string[] = [];
  epic.steps.forEach((step, i) => {
    const ring = rings[Math.min(step.hop, rings.length - 1)]!;
    const options = ring.length > 1 ? ring.filter((z) => z !== zones[i - 1]) : ring;
    zones.push(options[hash(`${seed}${epic.id}${i}`) % options.length]!);
  });
  return { epic, zones };
}

/** How hard, how long and how far a planned saga is. */
export function gauge(plan: EpicPlan): Gauge {
  const { epic, zones } = plan;
  const lands = new Set(zones).size;
  let minutes = 0;
  epic.steps.forEach((s, i) => {
    minutes += MINUTES[s.kind];
    if (i > 0 && zones[i] !== zones[i - 1]) minutes += TRAVEL;
  });
  minutes = Math.round(minutes);
  const difficulty = Math.max(
    1,
    Math.min(5, epic.difficulty + (lands >= 4 ? 1 : 0) - (lands <= 1 && epic.difficulty > 1 ? 1 : 0)),
  );
  const length = minutes < 14 ? 'Short' : minutes < 26 ? 'Medium' : minutes < 40 ? 'Long' : 'Grand';
  return { difficulty, length, steps: epic.steps.length, lands, minutes };
}

/** "★★★☆☆". */
export const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

/** The gauge as the DM reads it on a button: "★★★☆☆ · Long · 5 steps · 4 lands · ~30 min". */
export function gaugeText(g: Gauge): string {
  return `${stars(g.difficulty)} · ${g.length} · ${g.steps} steps · ${g.lands} ${g.lands === 1 ? 'land' : 'lands'} · ~${g.minutes} min`;
}

/** What a finished saga pays each player on top of its steps, by its size and difficulty. */
export function epicReward(plan: EpicPlan): { xp: number; gold: number } {
  const g = gauge(plan);
  return { xp: 40 * g.steps * g.difficulty, gold: 15 * g.steps * g.difficulty };
}

/** A step's line for the party, with the lands named in. */
export function tellStep(step: EpicStep, area: string, from: string): string {
  return step.tell.replace('{area}', area).replace('{from}', from || area);
}

/** The sagas a start can tell, planned, easiest and shortest first. */
export function epicsFrom(start: string, graph: ZoneGraph, seed = 0): { plan: EpicPlan; gauge: Gauge }[] {
  return EPICS.flatMap((e) => {
    const plan = planEpic(e, start, graph, seed);
    return plan ? [{ plan, gauge: gauge(plan) }] : [];
  }).sort((a, b) => a.gauge.difficulty - b.gauge.difficulty || a.gauge.minutes - b.gauge.minutes);
}
