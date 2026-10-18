// Saving a solo game in the browser (Pixi-free). The core engine's persistence: a save is the local hero (items by id, so
// a later deploy that retunes an item still loads), where they stand and which chests are open, kept per world in
// localStorage under the world's tag ("campaign1", "random:4242"). Co-op is not saved: only a solo game writes, and a
// guest's hero belongs to the host. Content can change between deploys, so a save that names something the world no
// longer has loads without it (an unknown item is dropped, a missing zone sends the hero to the start) and a save from
// a newer format is ignored rather than guessed at. Cleared site data loses saves, hence the export and import of the
// save as text.

import { GEAR_SLOTS, type Hero, type Stats } from './combat';
import { idOfItem, ITEMS, FUSED, itemOf } from './items';
import { newNeeds } from './needs';
import { SKILL_IDS, type SkillId } from './skills';

/** Bumped when the format changes in a way an older save cannot be read as. */
export const SAVE_VERSION = 1;

const KEY = 'me_rpg.save.';

/** A hero as saved: gear and pack are item ids. */
export interface HeroSave {
  name: string;
  stats: Stats;
  gear: Partial<Record<(typeof GEAR_SLOTS)[number], string>>;
  pack: string[];
  gold: number;
  quests: Hero['quests'];
  skills: SkillId[];
  loadout: SkillId[];
  needs: Hero['needs'];
}

export interface SaveData {
  v: number;
  /** The world's tag (`CampaignChoice.tag`): a save only loads into the world it was made in. */
  world: string;
  savedAt: number;
  hero: HeroSave;
  /** The scenario node the game was in, the zone the hero stands in and where (feet, in pixels). */
  node: string;
  zone: string;
  x: number;
  y: number;
  /** Indices of the chests opened, by zone. */
  opened: Record<string, number[]>;
}

const STAT_KEYS = ['level', 'xp', 'hp', 'maxHp', 'mp', 'maxMp', 'attack', 'defense', 'magic'] as const;

/** The hero as a save: an item not in the campaign's list (one the DM made up) cannot be named, so it is left out. */
export function heroToSave(hero: Hero): HeroSave {
  const gear: HeroSave['gear'] = {};
  for (const slot of GEAR_SLOTS) {
    const id = hero[slot] && idOfItem(hero[slot]);
    if (id) gear[slot] = id;
  }
  return {
    name: hero.name,
    stats: { ...hero.stats },
    gear,
    pack: hero.pack.flatMap((i) => idOfItem(i) ?? []),
    gold: hero.gold,
    quests: { ...hero.quests },
    skills: [...hero.skills],
    loadout: [...hero.loadout],
    needs: { ...hero.needs },
  };
}

const known = (id: unknown): id is string => typeof id === 'string' && (id in ITEMS || id in FUSED);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Put a saved hero into `hero` (in place: the player, the menu and the HUD hold the same object). */
export function applyHeroSave(hero: Hero, s: HeroSave): void {
  for (const slot of GEAR_SLOTS) {
    const id = s.gear[slot];
    if (known(id)) hero[slot] = itemOf(id);
    else if (slot !== 'weapon') delete hero[slot]; // the weapon stays what the hero had if its id is gone: always armed
  }
  hero.name = s.name;
  for (const k of STAT_KEYS) hero.stats[k] = num(s.stats[k], hero.stats[k]);
  hero.pack = s.pack.filter(known).map(itemOf);
  hero.gold = Math.max(0, Math.floor(num(s.gold, 0)));
  hero.quests = { stage: s.quests.stage, taken: s.quests.taken, progress: s.quests.progress };
  hero.skills = s.skills.filter((id) => SKILL_IDS.includes(id));
  hero.loadout = s.loadout.filter((id) => hero.skills.includes(id));
  hero.needs = { ...newNeeds(), ...s.needs };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read a save from text: null for anything that is not a save of this format (never throws). */
export function parseSave(text: string): SaveData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.v !== SAVE_VERSION || typeof raw.world !== 'string') return null;
  const h = raw.hero;
  if (!isObj(h) || !isObj(h.stats) || !isObj(h.gear) || !isObj(h.quests) || !isObj(h.needs)) return null;
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (typeof h.name !== 'string' || !ids(h.pack) || !ids(h.skills) || !ids(h.loadout)) return null;
  const q = h.quests;
  if (typeof q.stage !== 'number' || typeof q.taken !== 'boolean' || typeof q.progress !== 'number') return null;
  if (typeof raw.node !== 'string' || typeof raw.zone !== 'string') return null;
  if (!isObj(raw.opened)) return null;
  const opened: Record<string, number[]> = {};
  for (const [zone, list] of Object.entries(raw.opened))
    if (Array.isArray(list)) opened[zone] = list.filter((i): i is number => Number.isInteger(i) && i >= 0);
  return {
    v: SAVE_VERSION,
    world: raw.world,
    savedAt: num(raw.savedAt, 0),
    hero: h as unknown as HeroSave,
    node: raw.node,
    zone: raw.zone,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    opened,
  };
}

/** Where saves are kept: `localStorage`, or anything with its three calls (tests). */
export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStore = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked (a private window, site data off): the game plays on without saving
  }
};

/** The save for a world (null if there is none, it is unreadable, or storage is unavailable). */
export function loadSave(world: string, store: Store | null = browserStore()): SaveData | null {
  try {
    const text = store?.getItem(KEY + world);
    const save = text ? parseSave(text) : null;
    return save?.world === world ? save : null;
  } catch {
    return null;
  }
}

/** Keep a save; false if storage refused (full, or blocked). */
export function writeSave(save: SaveData, store: Store | null = browserStore()): boolean {
  try {
    store?.setItem(KEY + save.world, JSON.stringify(save));
    return !!store;
  } catch {
    return false;
  }
}

/** Forget a world's save (a new game). */
export function clearSave(world: string, store: Store | null = browserStore()): void {
  try {
    store?.removeItem(KEY + world);
  } catch {
    // nothing to clear if storage is blocked
  }
}
