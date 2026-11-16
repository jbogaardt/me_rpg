// What each unit and tower sounds like (Pixi-free, cosmetic; layer: this game's own): the weapon class of every attacker, the
// death of every unit by race and creature, and the sound a missile makes where it lands. Everything is keyed by the races'
// ids (`sim/races.ts`), and a test fails when a unit or tower has no entry, so a new one cannot be added silent.
// Map ids are here too: the ambience and the battle music follow the map's theme.

import type { RaceId, UnitDef } from './sim/races';
import { BANK, COMMON_KINDS, type FileKind } from './soundBank';

/** `null`: it makes no swing of its own (a bomb: the blast is its death). */
export type Weapon = FileKind | null;

export const UNIT_WEAPON: Record<RaceId, Record<string, Weapon>> = {
  swarm: {
    spearman: 'spear',
    archer: 'bow',
    boomer: null,
    thief: 'dagger',
    swordsman: 'sword',
    glider: 'bat',
    bombbat: null,
    dreadbat: 'bat',
  },
  titan: {
    axefighter: 'axe',
    thunderer: 'gun',
    runesmith: 'flame',
    thane: 'axe',
    yale: 'charge',
    scout: 'gryphon',
    gryphon: 'gryphon',
    thundergryphon: 'gryphon',
  },
  legion: {
    warrior: 'sword',
    archer: 'bow',
    saxon: 'sword',
    sapper: null,
    ritter: 'charge',
    ram: 'catapult',
    falcon: 'gryphon',
    griffin: 'gryphon',
  },
};

/** Buildings that shoot (`null`: they never do). */
export const TOWER_WEAPON: Record<RaceId, Record<string, Weapon>> = {
  swarm: {
    mill: null,
    quarry: null,
    hatchery: null,
    den: null,
    aerie: null,
    roost: null,
    smithy: null,
    nest: 'bow',
    spitter: 'spit',
    skycannon: 'gun',
    hut: 'bow',
    temple: null,
    academy: null,
    catapult: 'catapult',
  },
  titan: {
    mill: null,
    quarry: null,
    hall: null,
    foundry: null,
    pen: null,
    aviary: null,
    skyforge: null,
    smithy: null,
    ballista: 'ballista',
    bunker: 'bow',
    cannon: 'cannon',
    skyguard: 'ballista',
    shrine: null,
  },
  legion: {
    mill: null,
    quarry: null,
    barracks: null,
    stables: null,
    workshop: null,
    falconry: null,
    griffinroost: null,
    armoury: null,
    watch: 'bow',
    guard: 'bow',
    skybow: 'ballista',
    fort: 'bow',
    catapult: 'catapult',
    lookout: null,
    church: null,
  },
};

/** The castle shoots arrows. */
export const CASTLE_WEAPON: Weapon = 'bow';

type Death = Extract<FileKind, `death${string}` | 'razedSmall'>;
/** How each unit dies: goblins, dwarves and men by race, the mounts as beasts, every flyer as a flyer, an engine as a wreck. */
export const UNIT_DEATH: Record<RaceId, Record<string, Death>> = {
  swarm: {
    spearman: 'deathgoblin',
    archer: 'deathgoblin',
    boomer: 'deathgoblin',
    thief: 'deathgoblin',
    swordsman: 'deathgoblin',
    glider: 'deathflyer',
    bombbat: 'deathflyer',
    dreadbat: 'deathflyer',
  },
  titan: {
    axefighter: 'deathdwarf',
    thunderer: 'deathdwarf',
    runesmith: 'deathdwarf',
    thane: 'deathdwarf',
    yale: 'deathbeast',
    scout: 'deathflyer',
    gryphon: 'deathflyer',
    thundergryphon: 'deathflyer',
  },
  legion: {
    warrior: 'deathhuman',
    archer: 'deathhuman',
    saxon: 'deathhuman',
    sapper: 'deathhuman',
    ritter: 'deathbeast',
    ram: 'razedSmall',
    falcon: 'deathflyer',
    griffin: 'deathflyer',
  },
};

/** The death sound of a unit (a unit missing from the table falls back on its race's foot soldier). */
export function deathKind(race: RaceId, def: Pick<UnitDef, 'id' | 'air'>): Death {
  return UNIT_DEATH[race]?.[def.id] ?? (def.air ? 'deathflyer' : 'deathhuman');
}

/** What a missile does where it lands, by weapon: an arrow into flesh, a bolt (a building's wall by its material, else flesh), a stone from a catapult, a cannon's burst, nothing. */
export type Impact = 'arrow' | 'bolt' | 'siege' | 'blast';
export const IMPACT: Partial<Record<FileKind, Impact>> = {
  bow: 'arrow',
  ballista: 'bolt',
  catapult: 'siege',
  cannon: 'blast',
};
/** The sound where a ranged shot lands, given the material of the building it hit (`undefined`: open ground or a unit); `null` for none. */
export function impactKind(weapon: FileKind, target: 'stone' | 'wood' | undefined): FileKind | null {
  const wall = target === 'stone' ? 'hitstone' : 'hitwood';
  switch (IMPACT[weapon]) {
    case 'arrow':
      return 'arrowhit';
    case 'bolt':
      return target ? wall : 'arrowhit';
    case 'siege':
      return target ? wall : 'hitstone';
    case 'blast':
      return 'blast';
    default:
      return null;
  }
}

/** Hit points from which a building is stone rather than timber (the dwarves build all in stone). */
export const STONE_HP = 500;
export const isStone = (race: RaceId, hp: number) => race === 'titan' || hp >= STONE_HP;

/** The look of a map for the ambience and the battle music: the co-op fields wear the duels' themes (`tools/towercraftBoard.ts`). */
export type Theme = 'greenwood' | 'frostlands' | 'desert' | 'mire' | 'ember';
export const THEMES: readonly Theme[] = ['greenwood', 'frostlands', 'desert', 'mire', 'ember'];
const THEME_OF: Record<string, Theme> = {
  greenwood: 'greenwood',
  frostlands: 'frostlands',
  desert: 'desert',
  mire: 'mire',
  ember: 'ember',
  crossroads: 'greenwood',
  hbridge: 'desert',
  twinfords: 'frostlands',
  delta: 'ember',
};
export const themeOf = (boardId: string): Theme => THEME_OF[boardId] ?? 'greenwood';

/** Every effect a match of these races may play: the common set plus each race's weapons, deaths and what they land with. */
export function kindsForMatch(races: readonly RaceId[]): FileKind[] {
  const out = new Set<FileKind>(COMMON_KINDS);
  for (const r of new Set(races)) {
    for (const w of [...Object.values(UNIT_WEAPON[r]), ...Object.values(TOWER_WEAPON[r])]) {
      if (!w) continue;
      out.add(w);
      const i = impactKind(w, undefined);
      if (i) out.add(i);
    }
    for (const d of Object.values(UNIT_DEATH[r])) out.add(d);
  }
  for (const k of out) if (!(k in BANK)) throw new Error(`no such sound: ${k}`);
  return [...out];
}
