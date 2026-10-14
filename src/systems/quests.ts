// The story quests (Pixi-free). A warden in the town hands out one task at a time, in a chain that grows harder and tells
// the first part of the game's story; the easy ones pay gold and XP, the hard ones also give rare gear (the campaign's items.json,
// `rare`) that no shop sells. Each hero keeps a `QuestLog` (combat.ts): how many quests are done, whether the current one
// has been given, and its progress. The rules here either succeed completely or change nothing.
//
// The host owns every hero (see CLAUDE.md, Co-op): solo and the host talk and count kills directly; a guest asks the host
// to talk (`DoMsg` op `talk`), is told the answer as a story key (`Talk.key`, turned back into lines with `linesFor`) and
// is told its log in every `pack` message.
//
// The quests themselves are content: a campaign's public/content/<campaign>/quests.json (givers, site kinds, chapters,
// the chain in story order, the epilogue), installed into the registries below at boot (`setQuestContent`). Add a quest
// there. Sites (`MapData.sites`, placed with `z.site`) are where gather quests send the player; their kinds are SITE_KINDS.

import { MOB_KINDS, gainXp, type Hero, type MobKind, type QuestLog } from './combat';
import { collect } from './chests';
import { packFree, takeFromPack } from './inventory';
import { itemOf, type ItemId } from './items';

/** Someone who gives quests, standing in a zone (`z.giver(id, col, row)`, MapData.givers). */
export interface Giver {
  name: string;
  /** Key of NPC_LOOKS (systems/looks.ts). */
  look: string;
  /** Floats over their head. */
  tag: string;
  /** The zone they stand in (where a quest's arrow leads to hand a task in). */
  zone: string;
}

/** The givers of the campaign (its quests.json `givers`), installed by `setQuestContent`. */
export const GIVERS: Record<string, Giver> = {};

/** The giver whose chain QUESTS is (quests.json `giver`; there is one story per campaign). */
export let QUEST_GIVER = '';

/** A place a gather quest sends the player to (`MapData.sites`): drawn as a glowing thing that is touched with the action key. */
export interface SiteKind {
  name: string;
  /** What it is drawn as (entities/QuestSite.ts). */
  shape: 'mushroom' | 'stone' | 'sand';
  /** Main and glow colours, 0xRRGGBB. */
  color: number;
  glow: number;
  /** What the player sees when they touch one: one entry per site of this kind in its zone (by placement order, repeating). */
  notes: string[][];
}

/** The site kinds of the campaign (quests.json `sites`). */
export const SITE_KINDS: Record<string, SiteKind> = {};

/** What a quest asks for. */
export type Objective =
  /** Defeat `count` of a mob kind (a key of MOB_KINDS), anywhere or only in `zone`. */
  | { t: 'kill'; kind: string; count: number; zone?: string }
  /** Touch `count` different sites of a kind (SITE_KINDS) in `zone`. */
  | { t: 'gather'; site: string; zone: string; count: number }
  /** Hand over `count` of an item from the pack. */
  | { t: 'bring'; item: ItemId; count: number };

export interface Reward {
  gold: number;
  xp: number;
  /** Gear or supplies; the hero needs room in the pack for them. */
  items?: ItemId[];
}

/** A stretch of the story: a few quests that belong together, with a title and what Maren says as it begins. */
export interface Chapter {
  title: string;
  /** Said before the first quest's offer, to set the scene and say why the next task matters. */
  intro: string[];
}

export interface Quest {
  /** Short and stable: story keys are `<id>.offer` and so on. */
  id: string;
  /** Index into CHAPTERS. A chapter's quests are next to each other, and its first quest starts with the chapter's intro. */
  chapter: number;
  /** What the hero has learned once this is handed in: one line of the story, kept in the journal on the Quests tab. */
  learned: string;
  /** The moment the task is done out in the world, before going back: a line or two of narration (shown as a dialog). */
  fieldNote: string[];
  title: string;
  /** The task in a few words, for the quest log ("Drive off 5 goblins"). */
  goal: string;
  /** Where to go and what to do, for the quest page (it names areas as ZONE_NAMES does). */
  hint: string;
  /** The zones the task can be done in, nearest first wins; `door` is the door (by the zone it leads to) a bring task starts at. */
  where: { zones: string[]; door?: string };
  /** What is counted in progress text ("goblins": "3/5 goblins"). */
  unit: string;
  objective: Objective;
  reward: Reward;
  /** The giver hands the task out. */
  offer: string[];
  /** Asked again before it is done. */
  remind: string[];
  /** The task is handed in (a line naming the reward follows automatically). */
  done: string[];
}

/** The story's chapters (quests.json `chapters`; the quests of a chapter are next to each other in QUESTS). */
export const CHAPTERS: Chapter[] = [];

/** The quest chain, in story order (quests.json `quests`). */
export const QUESTS: Quest[] = [];

/** What the giver says once the whole chain is done (quests.json `epilogue`). */
export const EPILOGUE: string[] = [];

/** Everything a campaign's quests.json holds, as the rules here use it. */
export interface QuestContent {
  giver: string;
  givers: Record<string, Giver>;
  sites: Record<string, SiteKind>;
  chapters: Chapter[];
  quests: Quest[];
  epilogue: string[];
}

/** Install a campaign's quests (ContentManager.install). The records and lists keep their identity. */
export function setQuestContent(c: QuestContent) {
  QUEST_GIVER = c.giver;
  const refill = <T>(record: Record<string, T>, from: Record<string, T>) => {
    for (const key of Object.keys(record)) delete record[key];
    Object.assign(record, from);
  };
  refill(GIVERS, c.givers);
  refill(SITE_KINDS, c.sites);
  CHAPTERS.splice(0, CHAPTERS.length, ...c.chapters);
  QUESTS.splice(0, QUESTS.length, ...c.quests);
  EPILOGUE.splice(0, EPILOGUE.length, ...c.epilogue);
}

// --- Where a hero stands ---

export type Status = 'offer' | 'active' | 'ready' | 'complete';

/** The quest the hero is on (given or not), or undefined once every one is done. */
export const currentQuest = (log: QuestLog): Quest | undefined => QUESTS[log.stage];

const bits = (n: number) => {
  let count = 0;
  for (let v = n; v > 0; v = Math.floor(v / 2)) count += v % 2;
  return count;
};

/** The mob kind's key in MOB_KINDS (for counting kills), or undefined for a kind that is not in it. */
export const mobKey = (kind: MobKind): string | undefined => Object.keys(MOB_KINDS).find((k) => MOB_KINDS[k] === kind);

/** How much of the current task is done (capped at what it needs). */
export function progressOf(hero: Hero): number {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken) return 0;
  const { objective: o } = q;
  switch (o.t) {
    case 'kill':
      return Math.min(o.count, hero.quests.progress);
    case 'gather':
      return Math.min(o.count, bits(hero.quests.progress));
    case 'bring':
      return Math.min(o.count, hero.pack.filter((i) => i === itemOf(o.item)).length);
  }
}

/** How much the current task needs. */
export const needed = (q: Quest): number => q.objective.count;

export function questStatus(hero: Hero): Status {
  const q = currentQuest(hero.quests);
  if (!q) return 'complete';
  if (!hero.quests.taken) return 'offer';
  return progressOf(hero) >= needed(q) ? 'ready' : 'active';
}

/** "3/5 goblins". */
export const progressText = (hero: Hero): string => {
  const q = currentQuest(hero.quests);
  return q ? `${progressOf(hero)}/${needed(q)} ${q.unit}` : '';
};

/** The reward as a sentence: "30 gold, 30 XP and the Wayfarer's Charm". */
export function rewardText(r: Reward): string {
  const parts = [`${r.gold} gold`, `${r.xp} XP`, ...(r.items ?? []).map((id) => itemOf(id).name)];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

// --- Progress ---

export interface Progress {
  /** Floats over the hero: "3/5 goblins". */
  text: string;
  /** The task is now done and can be handed in. */
  ready: boolean;
}

function report(hero: Hero): Progress {
  return { text: progressText(hero), ready: questStatus(hero) === 'ready' };
}

/** A kill by this hero (everyone in the zone shares a kill): counts if the current kill quest wants that kind. */
export function recordKill(hero: Hero, kind: MobKind, zone: string): Progress | null {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken || q.objective.t !== 'kill') return null;
  const { objective: o } = q;
  if (mobKey(kind) !== o.kind || (o.zone && o.zone !== zone) || hero.quests.progress >= o.count) return null;
  hero.quests.progress++;
  return report(hero);
}

/** Does the current quest send the hero to this site (kind, zone, and which of that kind in the zone) and have they not been to it? */
export function siteOpen(hero: Hero, kind: string, zone: string, index: number): boolean {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken || q.objective.t !== 'gather') return false;
  const { objective: o } = q;
  if (o.site !== kind || o.zone !== zone || index < 0 || index > 30) return false;
  return Math.floor(hero.quests.progress / 2 ** index) % 2 === 0 && bits(hero.quests.progress) < o.count;
}

/** The hero touches a site: counts it if the current gather quest wants it and it is new. */
export function recordSite(hero: Hero, kind: string, zone: string, index: number): Progress | null {
  if (!siteOpen(hero, kind, zone, index)) return null;
  hero.quests.progress += 2 ** index;
  return report(hero);
}

/** What the player reads on touching the `index`th site of `kind` in its zone. */
export function siteNote(kind: string, index: number): string[] {
  const notes = SITE_KINDS[kind]?.notes ?? [];
  return notes[index % Math.max(1, notes.length)] ?? [];
}

// --- Talking to the giver ---

export interface Talk {
  /** Which story lines were told (`linesFor`); this is what a guest is sent, and shows from its own copy of the text. */
  key: string;
  lines: string[];
  /** The hero put on gear from the reward (the sprite must be redrawn). */
  gear: boolean;
  /** Level-ups the reward's XP gave. */
  levels: number;
  /** A reward was handed over. */
  paid: boolean;
}

const FULL_LINES = ['Your pack is too full to carry my thanks. Make room, and come back.'];

/** Does this quest begin a chapter (the one before it belongs to an earlier chapter, or it is the first)? */
export const startsChapter = (q: Quest): boolean =>
  QUESTS.indexOf(q) === 0 || QUESTS[QUESTS.indexOf(q) - 1]?.chapter !== q.chapter;

/** What the giver says when handing out `q`: the chapter's opening first, when `q` is where a chapter begins. */
export const offerLines = (q: Quest): string[] => [
  ...(startsChapter(q) ? (CHAPTERS[q.chapter]?.intro ?? []) : []),
  ...q.offer,
];

/** The chapter the hero is in (the one their current quest belongs to), or the last once every quest is done. */
export function currentChapter(log: QuestLog): { index: number; chapter: Chapter } | undefined {
  const q = currentQuest(log) ?? QUESTS[QUESTS.length - 1];
  const chapter = q && CHAPTERS[q.chapter];
  return q && chapter ? { index: q.chapter, chapter } : undefined;
}

/** What the hero has learned so far, chapter by chapter: the journal. Only chapters with something learned are listed. */
export function journal(log: QuestLog): { title: string; lines: string[] }[] {
  const done = QUESTS.slice(0, log.stage);
  return CHAPTERS.flatMap((chapter, i) => {
    const lines = done.filter((q) => q.chapter === i).map((q) => q.learned);
    return lines.length ? [{ title: chapter.title, lines }] : [];
  });
}

/** The story lines behind a key ("road.offer", "road.reward", "end"...), or null for one this build does not know. */
export function linesFor(key: string): string[] | null {
  if (key === 'end') return EPILOGUE;
  const [id, part] = key.split('.');
  const q = QUESTS.find((quest) => quest.id === id);
  if (!q) return null;
  switch (part) {
    case 'offer':
      return offerLines(q);
    case 'remind':
      return q.remind;
    case 'full':
      return FULL_LINES;
    case 'reward':
      return [...q.done, `Received ${rewardText(q.reward)}.`];
    default:
      return null;
  }
}

/** Hand the reward over, if there is room for it. Nothing changes when there is not. */
function pay(hero: Hero, q: Quest): { gear: boolean; levels: number } | null {
  const { reward, objective } = q;
  const freed = objective.t === 'bring' ? objective.count : 0;
  if (packFree(hero) + freed < (reward.items?.length ?? 0)) return null;
  if (objective.t === 'bring') for (let i = 0; i < objective.count; i++) takeFromPack(hero, itemOf(objective.item));
  hero.gold += reward.gold;
  let gear = false;
  for (const id of reward.items ?? []) {
    // Worn if it beats what is there, otherwise into the pack (there is room: it was checked above).
    gear ||= collect(hero, { item: itemOf(id) }).gear !== undefined;
  }
  return { gear, levels: gainXp(hero.stats, reward.xp) };
}

/**
 * The hero speaks to the quest giver: they are given the next task, reminded of the one they are on, or (if it is done)
 * paid for it and the chain moves on. The reply says which lines to show.
 */
export function talk(hero: Hero): Talk {
  const log = hero.quests;
  const q = currentQuest(log);
  const said = (key: string, lines: string[], extra: Partial<Talk> = {}): Talk => ({
    key,
    lines,
    gear: false,
    levels: 0,
    paid: false,
    ...extra,
  });
  if (!q) return said('end', EPILOGUE);
  switch (questStatus(hero)) {
    case 'offer':
      log.taken = true;
      log.progress = 0;
      return said(`${q.id}.offer`, offerLines(q));
    case 'active':
      return said(`${q.id}.remind`, q.remind);
    default: {
      const paid = pay(hero, q);
      if (!paid) return said(`${q.id}.full`, FULL_LINES);
      log.stage++;
      log.taken = false;
      log.progress = 0;
      return said(`${q.id}.reward`, linesFor(`${q.id}.reward`) ?? [], { ...paid, paid: true });
    }
  }
}

/** The marker over the giver's head for this hero: "!" has a task to give, "?" is waiting for one to be handed in. */
export function giverMark(hero: Hero): '!' | '?' | '' {
  const status = questStatus(hero);
  return status === 'offer' ? '!' : status === 'ready' ? '?' : '';
}

// --- The log on the wire (a guest is told its log in every `pack` message) ---

export type QuestWire = [stage: number, taken: 0 | 1, progress: number];

export const questWire = ({ stage, taken, progress }: QuestLog): QuestWire => [stage, taken ? 1 : 0, progress];

/** Read a log back, or null when it cannot be one of this build's. */
export function questFromWire(w: unknown): QuestLog | null {
  if (!Array.isArray(w) || w.length !== 3) return null;
  const [stage, taken, progress] = w as number[];
  if (stage === undefined || taken === undefined || progress === undefined) return null;
  if (!Number.isInteger(stage) || stage < 0 || stage > QUESTS.length) return null;
  if ((taken !== 0 && taken !== 1) || !Number.isInteger(progress) || progress < 0 || progress > 2 ** 31) return null;
  return { stage, taken: taken === 1, progress };
}
