// Skills: small spells a hero learns from the training wizard and carries in themselves, so they work with any weapon (a
// sword, a bow, a wand). They are tapped out like the combos of a wand or tome (systems/spells.ts), but they are weaker
// than a wand's spells; what they do is make the weapon in hand hit harder. Pure data and rules; the simulation carries
// them out (scenes/overworld/Casting.ts) and the trial that earns one is scenes/overworld/Training.ts.
//
// Each skill is earned in a trial: the trainer sends the hero to a training ground (a zone of its own, `trial.zone`, with
// a wave of enemies that do not come back) and the skill is learned when every enemy is down and the hero is still
// standing. A stronger skill needs a higher level and a harder wave. Add one by adding to SKILL_IDS and SKILLS, a training
// zone (maps/training_*.ts) and its entry in TRIAL_ZONES' source (`trial.zone`).

import type { Hero } from './combat';
import { arrows, directionWords, type Combo } from './spells';

export const SKILL_IDS = ['arcaneEdge', 'sparkVolley', 'ironSkin', 'spiritMark'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** How many skills a hero can have ready at once. A wand or tome's own combos do not count toward this. */
export const LOADOUT_SLOTS = 2;

export interface Skill {
  id: SkillId;
  name: string;
  /** What it does, for the menu and the trainer. */
  about: string;
  /** The directions to tap (like a combo: four, and different from every wand and tome combo, see skills.test.ts). */
  keys: string;
  /** Mana to cast it. */
  cost: number;
  /** The level a hero must have before the trainer will test them for it: a new skill every five levels. */
  minLevel: number;
  /** The training ground that tests for it: a zone name (maps/<zone>.ts). */
  zone: string;
}

export const SKILLS: Record<SkillId, Skill> = {
  arcaneEdge: {
    id: 'arcaneEdge',
    name: 'Arcane Edge',
    about: 'Your next three sword swings, arrows or wand bolts within 12 seconds carry extra magic damage.',
    keys: 'ruld',
    cost: 5,
    minLevel: 1,
    zone: 'training_novice',
  },
  sparkVolley: {
    id: 'sparkVolley',
    name: 'Spark Volley',
    about:
      "Three bolts fan out ahead of you, each hitting for a little less than a wand's bolt: a close-range blast that works with any weapon.",
    keys: 'urdl',
    cost: 6,
    minLevel: 5,
    zone: 'training_apprentice',
  },
  ironSkin: {
    id: 'ironSkin',
    name: 'Iron Skin',
    about: 'For 8 seconds you take a little over half the damage from every blow.',
    keys: 'dlur',
    cost: 8,
    minLevel: 10,
    zone: 'training_journeyman',
  },
  spiritMark: {
    id: 'spiritMark',
    name: 'Spirit Mark',
    about: 'A pulse that stings every foe near you and marks them: for 8 seconds they take 30% more from everything.',
    keys: 'ldru',
    cost: 9,
    minLevel: 15,
    zone: 'training_adept',
  },
};

/** Arcane Edge: charges, how long they last (seconds), and the bonus as a share of the hero's magic. */
export const EDGE_CHARGES = 3;
export const EDGE_SECONDS = 12;
export const EDGE_SHARE = 0.6;
/** Spark Volley: how many bolts, and each one's share of the hero's spell power (a wand's bolt is 1.8 to 2.4 times it). */
export const VOLLEY_BOLTS = 3;
export const VOLLEY_POWER = 0.7;
/** Iron Skin: seconds, and the share of damage still taken. */
export const GUARD_SECONDS = 8;
export const GUARD_TAKEN = 0.55;
/** Spirit Mark: how long it lasts, how much more a marked foe takes, how hard the pulse itself stings (share of spell power). */
export const MARK_SECONDS = 8;
export const MARK_BONUS = 0.3;
export const MARK_STING = 0.5;
/** How far the Spirit Mark pulse reaches, in cells. */
export const MARK_REACH_CELLS = 4;

/** The training wizard (a quest-giver slot in a zone: `z.giver('orin', ...)`, see GIVERS in quests.ts). */
export const TRAINER = 'orin';
/** The room the trainer stands in, and where a hero comes back to (a cell of that room) when a trial ends. */
export const TRAINER_ROOM = 'shop_wizard';
export const TRAINER_RETURN = { col: 3, row: 7 } as const;

/** Is `zone` a training ground? (Its enemies do not come back, and a hero in it is in a trial.) */
export const isTrialZone = (zone: string): boolean => SKILL_IDS.some((id) => SKILLS[id].zone === zone);

/** The skill a training ground tests for. */
export const skillOfZone = (zone: string): Skill | undefined =>
  SKILL_IDS.map((id) => SKILLS[id]).find((s) => s.zone === zone);

export const knows = (hero: Hero, id: SkillId): boolean => hero.skills.includes(id);

/** Teach a hero a skill. Returns false (changing nothing) when they already know it. Skills stay in SKILL_IDS order. */
export function learn(hero: Hero, id: SkillId): boolean {
  if (knows(hero, id)) return false;
  hero.skills = SKILL_IDS.filter((s) => s === id || hero.skills.includes(s));
  if (hero.loadout.length < LOADOUT_SLOTS) hero.loadout = [...hero.loadout, id]; // a free slot takes it; otherwise the menu swaps
  return true;
}

/**
 * Choose which skills are ready: at most `LOADOUT_SLOTS`, each known, none twice. Slots fill from the first, so taking the
 * first one out moves the second up. Returns false (changing nothing) for anything else.
 */
export function setLoadout(hero: Hero, wanted: readonly SkillId[]): boolean {
  if (
    wanted.length > LOADOUT_SLOTS ||
    new Set(wanted).size !== wanted.length ||
    !wanted.every((id) => knows(hero, id))
  ) {
    return false;
  }
  hero.loadout = [...wanted];
  return true;
}

/** A loadout as one small number for the network: slot 1 and slot 2 as 0 (empty) or a skill's place in SKILL_IDS plus one. */
export const loadoutCode = (loadout: readonly SkillId[]): number =>
  (loadout[0] ? SKILL_IDS.indexOf(loadout[0]) + 1 : 0) * (SKILL_IDS.length + 1) +
  (loadout[1] ? SKILL_IDS.indexOf(loadout[1]) + 1 : 0);

/** The biggest value `loadoutCode` can have. */
export const MAX_LOADOUT_CODE = (SKILL_IDS.length + 1) ** 2 - 1;

/** The loadout a code stands for, or null if it is no loadout (an out-of-range code, or one skill in both slots). */
export function loadoutFromCode(code: number): SkillId[] | null {
  if (!Number.isInteger(code) || code < 0 || code > MAX_LOADOUT_CODE) return null;
  const n = SKILL_IDS.length + 1;
  const slots = [Math.floor(code / n), code % n].filter((v) => v > 0).map((v) => SKILL_IDS[v - 1]!);
  return new Set(slots).size === slots.length ? slots : null;
}

/**
 * The skills the hero can cast where they stand: the ones they have ready, except that in a training ground the skill being
 * tested takes the second slot (the first stays), so it can be tried out on the wave.
 */
export function activeSkills(hero: Hero, zone = ''): SkillId[] {
  const trial = skillOfZone(zone)?.id;
  if (!trial) return hero.loadout;
  return [...hero.loadout.slice(0, LOADOUT_SLOTS - 1).filter((id) => id !== trial), trial];
}

/** The skills a hero knows as a bit mask (bit n is `SKILL_IDS[n]`), for the network. */
export const skillMask = (hero: Hero): number =>
  SKILL_IDS.reduce((m, id, i) => (knows(hero, id) ? m | (1 << i) : m), 0);

/** The skills in a mask (bits past the last skill are ignored). */
export const skillsFromMask = (mask: number): SkillId[] => SKILL_IDS.filter((_, i) => (mask & (1 << i)) !== 0);

/** The biggest value `skillMask` can have. */
export const MAX_SKILL_MASK = (1 << SKILL_IDS.length) - 1;

/** The next skill the hero has yet to learn, in order, or null once they know them all. */
export const nextSkill = (hero: Hero): Skill | null => {
  const id = SKILL_IDS.find((s) => !knows(hero, s));
  return id ? SKILLS[id] : null;
};

/** What the trainer says, and whether a trial follows (the skill to be tested for). */
export interface TrainerTalk {
  lines: string[];
  trial: Skill | null;
}

const MENU_HELP = `Only ${LOADOUT_SLOTS === 2 ? 'two' : LOADOUT_SLOTS} of these abilities can be ready at once. Open your menu (Esc, or the ☰ button) and choose the Magic tab to put them in slot 1 or slot 2, and to swap them whenever you like. A wand or tome's own combos do not count toward the two, so with one in hand you can have both of mine ready as well.`;

/** One line about a skill: its name, the keys, what it costs and what it does. */
export const skillLine = (s: Skill): string =>
  `${s.name} (${arrows(s.keys)}: ${directionWords(s.keys)}; ${s.cost} MP): ${s.about}`;

/**
 * The training wizard's words to a hero: what they know and how the two ability slots work, and either a trial for the
 * next skill (what to do there is in the lines), or why not yet, or that there is nothing more to teach.
 */
export function trainerTalk(hero: Hero): TrainerTalk {
  const skill = nextSkill(hero);
  const known = SKILL_IDS.filter((id) => knows(hero, id)).map((id) => SKILLS[id]);
  if (!skill) {
    return {
      lines: [
        'You have learned everything I can teach. Here is what you carry:',
        ...known.map(skillLine),
        MENU_HELP,
        'Spend it well.',
      ],
      trial: null,
    };
  }
  if (hero.stats.level < skill.minLevel) {
    return {
      lines: [
        ...(known.length ? ['This is what you know so far:', ...known.map(skillLine), MENU_HELP] : []),
        `I can teach you ${skill.name} when you have reached level ${skill.minLevel}; you are level ${hero.stats.level}. A new ability every five levels: go and fight, and come back stronger.`,
      ],
      trial: null,
    };
  }
  const first = known.length === 0;
  return {
    lines: [
      first
        ? `So you want to cast without a wand? Magic can live in you, ${hero.name}, and any sword or bow can carry it. I will teach you ${skill.name}.`
        : `You have grown, ${hero.name}. Ready to learn ${skill.name}?`,
      skillLine(skill),
      first ? MENU_HELP : `Remember: Menu, then the Magic tab, puts your two ready abilities in slot 1 or slot 2.`,
      `At the training ground a wave of foes waits. Defeat every one of them, and do not fall. To let you practice, ${skill.name} will sit in your second slot while you are there (your first slot stays as it is), and your own choice comes back when you leave. Tap ${arrows(skill.keys)} to cast it.`,
      'If you fall, you wake here and can try again. Walk out through the door at the bottom to give up. Off you go.',
    ],
    trial: skill,
  };
}

/** What a hero's own spells are (the skills they have ready), as combos for the combo reader. */
export interface SkillCombo {
  keys: string;
  cost: number;
  skill: SkillId;
}

/** Every combo a hero can tap right now: those of the wand or tome in hand first (they do not use the skill slots), then their ready skills. The index is what travels. */
export type HeroCombo = (Combo & { skill?: undefined }) | SkillCombo;

export function heroCombos(hero: Hero, zone = ''): HeroCombo[] {
  const weapon: HeroCombo[] = [...(hero.weapon.focus?.combos ?? [])];
  const innate: HeroCombo[] = activeSkills(hero, zone).map((id) => ({
    keys: SKILLS[id].keys,
    cost: SKILLS[id].cost,
    skill: id,
  }));
  return [...weapon, ...innate];
}

/** The most combos a hero can have at once: a wand or tome's, plus the skills they have ready. */
export const MAX_HERO_COMBOS = 4 + LOADOUT_SLOTS;
