// The story quests (Pixi-free). A warden in the town hands out one task at a time, in a chain that grows harder and tells
// the first part of the game's story; the easy ones pay gold and XP, the hard ones also give rare gear (the campaign's items.json,
// `rare`) that no shop sells. Each hero keeps a `QuestLog` (combat.ts): how many quests are done, whether the current one
// has been given, and its progress. The rules here either succeed completely or change nothing.
//
// The host owns every hero (see src/net/CLAUDE.md, Co-op): solo and the host talk and count kills directly; a guest asks the host
// to talk (`DoMsg` op `talk`), is told the answer as a story key (`Talk.key`, turned back into lines with `linesFor`) and
// is told its log in every `pack` message.
//
// The quests themselves are content: a campaign's public/content/<campaign>/quests.json (givers, site kinds, chapters,
// the chain in story order, the epilogue), installed into the registries below at boot (`setQuestContent`). Add a quest
// there. Sites (`MapData.sites`, placed with `z.site`) are where gather quests send the player; their kinds are SITE_KINDS.

import { CELL } from '../map/types';
import { BAND_MARK, MOB_KINDS, gainXp, type Hero, type MobKind, type QuestLog } from './combat';
import type { Dial } from './capabilities';
import { collect } from './chests';
import { BOSS_KEY } from './dmBoss';
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
  /** What they say when the hero speaks to them and they have nothing to do with the quest the hero is on. */
  idle?: string[];
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
  /** Defeat the named boss `boss` (an entity with `boss: true`, systems/bosses.ts) standing in `zone`: one kill, shared by the party. */
  | { t: 'boss'; boss: string; zone: string; count: 1 }
  /** Touch `count` different sites of a kind (SITE_KINDS) in `zone`. */
  | { t: 'gather'; site: string; zone: string; count: number }
  /** Hand over `count` of an item from the pack. */
  | { t: 'bring'; item: ItemId; count: number }
  /** Speak to the person who `turnIn` names (done the moment the quest is taken: the task is to go and find them). */
  | { t: 'meet'; count: number }
  /** Walk to a named place (a `MapData.places` entry) of `zone`: done on arriving within `VISIT_RADIUS` of it. */
  | { t: 'visit'; place: string; zone: string; count: number }
  /** Cast `count` spells (combos: the `combos` capability), anywhere or only in `zone`. */
  | { t: 'cast'; count: number; zone?: string; spell?: string }
  /** Carry `count` different barrels (the `carrying` capability) of `zone` and set them down by its named place. */
  | { t: 'haul'; place: string; zone: string; count: number };

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
  /** What the Dungeon Master says to the party as this chapter begins (online): the tale told from above, not by the keeper. */
  narration?: string[];
}

export interface Quest {
  /** Short and stable: story keys are `<id>.offer` and so on. */
  id: string;
  /** Who hands this quest out (a key of GIVERS); the chain's giver when left out. */
  giver?: string;
  /** Who it is handed in to and who pays (a key of GIVERS; a `meet` quest must name one); the one who handed it out when left out. */
  turnIn?: string;
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
  /**
   * The capabilities this quest switches for the whole party while someone has it taken and not handed in (only the
   * zone-scoped ones a Dungeon Master may switch, `DIALS`): a hide-and-seek quest turns the map and guide off, a harvest
   * turns farming on, a famine turns food and water on. The host works it out and tells everyone (`questDials`).
   */
  capabilities?: Partial<Record<Dial, boolean>>;
}

/**
 * What the party's current quests switch (`Quest.capabilities`): each hero's current quest, if they have taken it and not
 * handed it in; the first hero to say a thing wins. Host and solo only: a friend is told the result.
 */
export function questDials(heroes: readonly Hero[]): Partial<Record<Dial, boolean>> {
  const out: Partial<Record<Dial, boolean>> = {};
  for (const h of heroes) {
    const q = h.quests.taken ? currentQuest(h.quests) : undefined;
    if (!q?.capabilities) continue;
    for (const [id, on] of Object.entries(q.capabilities) as [Dial, boolean][]) if (out[id] === undefined) out[id] = on;
  }
  return out;
}

/** The story's chapters (quests.json `chapters`; the quests of a chapter are next to each other in QUESTS). */
export const CHAPTERS: Chapter[] = [];

/** The quest chain, in story order (quests.json `quests`). */
export const QUESTS: Quest[] = [];

/** What the giver says once the whole chain is done (quests.json `epilogue`). */
export const EPILOGUE: string[] = [];

/** What the Dungeon Master says to the party as the game starts (quests.json `welcome`; empty: `DEFAULT_WELCOME`). */
export const WELCOME: string[] = [];

/** Everything a campaign's quests.json holds, as the rules here use it. */
export interface QuestContent {
  giver: string;
  givers: Record<string, Giver>;
  sites: Record<string, SiteKind>;
  chapters: Chapter[];
  quests: Quest[];
  epilogue: string[];
  welcome: string[];
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
  WELCOME.splice(0, WELCOME.length, ...c.welcome);
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

/** Who hands a quest out. */
export const offererOf = (q: Quest): string => q.giver ?? QUEST_GIVER;

/** Who a quest is handed in to (and who pays): a different person from the one who gave it, for a message to carry. */
export const completerOf = (q: Quest): string => q.turnIn ?? offererOf(q);

/** How close (in cells) the hero must come to a place for a `visit` quest to count it. */
export const VISIT_RADIUS = 7;

/**
 * The mob kind's key in MOB_KINDS (for counting kills), or undefined for a kind that is not in it. A kind re-banded for a
 * zone (`bands.ts`, registered as "orc@14") counts as its own kind: a quest for orcs counts every orc.
 */
export const mobKey = (kind: MobKind): string | undefined =>
  kind.boss
    ? BOSS_KEY
    : Object.keys(MOB_KINDS)
        .find((k) => MOB_KINDS[k] === kind)
        ?.split(BAND_MARK)[0];

/**
 * The rules every quest is held to, wherever it is tracked: a hero's own log (the campaign's story, handed out by its
 * people) or the party's one (the Dungeon Master's epics, `dmTasks.ts`). A rule reads and moves a `QuestLog` for a
 * `Quest`, so the two cannot disagree about what counts: `taken` is a quest being worked on, `progress` its count (a kill
 * or visit count; for a gather the sites touched, a bit each).
 */

/** How much of `q` is done in `log` (capped at what it needs). `held` is how many of a `bring` quest's item are in hand. */
export function progressIn(log: QuestLog, q: Quest, held = 0): number {
  if (!log.taken) return 0;
  const { objective: o } = q;
  switch (o.t) {
    case 'kill':
    case 'boss':
      return Math.min(o.count, log.progress);
    case 'gather':
      return Math.min(o.count, bits(log.progress));
    case 'bring':
      return Math.min(o.count, held);
    case 'meet':
      return o.count; // going to find them is all there is to it
    case 'visit':
    case 'cast':
      return Math.min(o.count, log.progress);
    case 'haul':
      return Math.min(o.count, bits(log.progress));
  }
}

/** A spell (`spell`, a spell's id) cast in `zone`: counts if `q` wants one (any, or that one) and is not yet done. */
export function castIn(log: QuestLog, q: Quest, zone: string, spell?: string): boolean {
  const { objective: o } = q;
  if (!log.taken || o.t !== 'cast' || (o.zone && o.zone !== zone) || log.progress >= o.count) return false;
  if (o.spell && o.spell !== spell) return false;
  log.progress++;
  return true;
}

/** How near (cells) to a haul quest's place a barrel must be set down to count. */
export const HAUL_RADIUS = 4;

/**
 * Barrel `index` of `zone` was set down at (x, y) pixels; `place` is where the haul quest's named place is: counts when it
 * is within HAUL_RADIUS and this barrel has not been counted yet (a bit each, like a gather's sites).
 */
export function haulIn(
  log: QuestLog,
  q: Quest,
  zone: string,
  place: { col: number; row: number } | undefined,
  index: number,
  x: number,
  y: number,
): boolean {
  const { objective: o } = q;
  if (!log.taken || o.t !== 'haul' || o.zone !== zone || !place || index < 0 || index > 30) return false;
  if (Math.floor(log.progress / 2 ** index) % 2 === 1 || bits(log.progress) >= o.count) return false;
  if (Math.hypot(x / CELL - (place.col + 0.5), y / CELL - (place.row + 0.5)) > HAUL_RADIUS) return false;
  log.progress += 2 ** index;
  return true;
}

/** A kill of the mob kind `key` in `zone`: counts if `q` wants it and is not yet done. */
export function killIn(log: QuestLog, q: Quest, key: string | undefined, zone: string): boolean {
  const { objective: o } = q;
  if (!log.taken || (o.t !== 'kill' && o.t !== 'boss') || log.progress >= o.count || (o.zone && o.zone !== zone))
    return false;
  if (key !== (o.t === 'boss' ? o.boss : o.kind)) return false;
  log.progress++;
  return true;
}

/**
 * Someone is at (x, y) pixels in `zone`; `place` is where the named place of `q` is (its cell, or undefined when the zone
 * has no such place): counts when they come within VISIT_RADIUS of it.
 */
export function visitIn(
  log: QuestLog,
  q: Quest,
  zone: string,
  place: { col: number; row: number } | undefined,
  x: number,
  y: number,
): boolean {
  const { objective: o } = q;
  if (!log.taken || o.t !== 'visit' || log.progress >= o.count || o.zone !== zone || !place) return false;
  if (Math.hypot(x / CELL - (place.col + 0.5), y / CELL - (place.row + 0.5)) > VISIT_RADIUS) return false;
  log.progress = o.count;
  return true;
}

/** Does `q` send them to this site (kind, zone, and which of that kind in the zone), and has it not been touched? */
export function siteOpenIn(log: QuestLog, q: Quest, kind: string, zone: string, index: number): boolean {
  const { objective: o } = q;
  if (!log.taken || o.t !== 'gather' || o.site !== kind || o.zone !== zone || index < 0 || index > 30) return false;
  return Math.floor(log.progress / 2 ** index) % 2 === 0 && bits(log.progress) < o.count;
}

/** The site is touched: counts if `q` wants it and it is new. */
export function siteIn(log: QuestLog, q: Quest, kind: string, zone: string, index: number): boolean {
  if (!siteOpenIn(log, q, kind, zone, index)) return false;
  log.progress += 2 ** index;
  return true;
}

/** How much of the hero's current task is done (capped at what it needs). */
export function progressOf(hero: Hero): number {
  const q = currentQuest(hero.quests);
  if (!q) return 0;
  const o = q.objective;
  return progressIn(hero.quests, q, o.t === 'bring' ? hero.pack.filter((i) => i === itemOf(o.item)).length : 0);
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
  return q && killIn(hero.quests, q, mobKey(kind), zone) ? report(hero) : null;
}

/** A spell this hero cast in `zone`: counts if the current quest is a cast quest that wants it. */
export function recordCast(hero: Hero, zone: string): Progress | null {
  const q = currentQuest(hero.quests);
  return q && castIn(hero.quests, q, zone) ? report(hero) : null;
}

/** Barrel `index` of `zone`, set down by this hero at (x, y): counts for a haul quest whose place it is near. */
export function recordHaul(
  hero: Hero,
  zone: string,
  places: readonly { name: string; col: number; row: number }[],
  index: number,
  x: number,
  y: number,
): Progress | null {
  const q = currentQuest(hero.quests);
  if (!q || q.objective.t !== 'haul') return null;
  const name = q.objective.place;
  return haulIn(
    hero.quests,
    q,
    zone,
    places.find((p) => p.name === name),
    index,
    x,
    y,
  )
    ? report(hero)
    : null;
}

/**
 * The hero is at (x, y) pixels in `zone`, whose named places are `places`: counts a `visit` quest's place when they come
 * within VISIT_RADIUS of it. Cheap when the current quest is not one (it is asked every tick).
 */
export function recordVisit(
  hero: Hero,
  zone: string,
  places: readonly { name: string; col: number; row: number }[],
  x: number,
  y: number,
): Progress | null {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken || q.objective.t !== 'visit') return null;
  const name = q.objective.place;
  return visitIn(
    hero.quests,
    q,
    zone,
    places.find((p) => p.name === name),
    x,
    y,
  )
    ? report(hero)
    : null;
}

/** Does the current quest send the hero to this site (kind, zone, and which of that kind in the zone) and have they not been to it? */
export function siteOpen(hero: Hero, kind: string, zone: string, index: number): boolean {
  const q = currentQuest(hero.quests);
  return !!q && siteOpenIn(hero.quests, q, kind, zone, index);
}

/** The hero touches a site: counts it if the current gather quest wants it and it is new. */
export function recordSite(hero: Hero, kind: string, zone: string, index: number): Progress | null {
  const q = currentQuest(hero.quests);
  return q && siteIn(hero.quests, q, kind, zone, index) ? report(hero) : null;
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
  /** The hand-in was the climax of the story (`isFinale`): the epilogue follows the reward lines. The hook for a closing scene. */
  finale: boolean;
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

/**
 * Is `q` the climax of the story: a boss quest that is the last of the chain? Handing it in tells the epilogue at once
 * (`linesFor`) and flags the `Talk` (`finale`), the one place a closing scene hooks in (docs/epics.md, End bosses).
 */
export const isFinale = (q: Quest): boolean => q.objective.t === 'boss' && QUESTS[QUESTS.length - 1] === q;

/** The story lines behind a key ("road.offer", "road.reward", "end"...), or null for one this build does not know. */
export function linesFor(key: string): string[] | null {
  if (key === 'end') return EPILOGUE;
  const [id = '', part] = key.split('.');
  if (part === 'idle') return GIVERS[id] ? idleLines(id) : null;
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
      return [...q.done, `Received ${rewardText(q.reward)}.`, ...(isFinale(q) ? EPILOGUE : [])];
    default:
      return null;
  }
}

/** What a person says when the hero has nothing to do with them just now. */
const idleLines = (giverId: string): string[] => {
  const lines = GIVERS[giverId]?.idle;
  return lines && lines.length ? lines : ['...'];
};

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
 * The hero speaks to `giverId` (the chain's giver unless they name someone else): that person gives them the next task,
 * reminds them of the one they are on, or (if it is done) takes it and pays, and the chain moves on. Someone who has nothing
 * to do with the quest the hero is on just says their piece (`GIVERS[id].idle`), and so does everyone when `story` is off
 * (online, where only the Dungeon Master's quests count). The reply says which lines to show.
 */
export function talk(hero: Hero, giverId: string = QUEST_GIVER, story = true): Talk {
  const log = hero.quests;
  const q = currentQuest(log);
  const said = (key: string, lines: string[], extra: Partial<Talk> = {}): Talk => ({
    key,
    lines,
    gear: false,
    levels: 0,
    paid: false,
    finale: false,
    ...extra,
  });
  const idle = () => said(`${giverId}.idle`, idleLines(giverId));
  if (!story) return idle(); // online the Dungeon Master gives the quests: everyone else only passes the time of day
  if (!q) return giverId === QUEST_GIVER ? said('end', EPILOGUE) : idle();
  const [offerer, completer] = [offererOf(q), completerOf(q)];
  switch (questStatus(hero)) {
    case 'offer':
      if (giverId !== offerer) return idle();
      log.taken = true;
      log.progress = 0;
      return said(`${q.id}.offer`, offerLines(q));
    case 'active':
      return giverId === offerer || giverId === completer ? said(`${q.id}.remind`, q.remind) : idle();
    default: {
      if (giverId !== completer) return giverId === offerer ? said(`${q.id}.remind`, q.remind) : idle();
      const paid = pay(hero, q);
      if (!paid) return said(`${q.id}.full`, FULL_LINES);
      log.stage++;
      log.taken = false;
      log.progress = 0;
      return said(`${q.id}.reward`, linesFor(`${q.id}.reward`) ?? [], { ...paid, paid: true, finale: isFinale(q) });
    }
  }
}

/**
 * The marker over a person's head for this hero: "!" has a task to give, "?" is waiting for one to be handed in. Only the
 * person the current quest is about shows one (`giverId` left out means the chain's giver).
 */
export function giverMark(hero: Hero, giverId: string = QUEST_GIVER): '!' | '?' | '' {
  const q = currentQuest(hero.quests);
  if (!q) return '';
  const status = questStatus(hero);
  if (status === 'offer') return giverId === offererOf(q) ? '!' : '';
  return status === 'ready' && giverId === completerOf(q) ? '?' : '';
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
