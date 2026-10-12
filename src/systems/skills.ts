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

export const SKILL_IDS = ['arcaneEdge', 'spiritMark'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface Skill {
  id: SkillId;
  name: string;
  /** What it does, for the menu and the trainer. */
  about: string;
  /** The directions to tap (like a combo: four, and different from every wand and tome combo, see skills.test.ts). */
  keys: string;
  /** Mana to cast it. */
  cost: number;
  /** The level a hero must have before the trainer will test them for it. */
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
  return true;
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

/**
 * The training wizard's words to a hero: what they know, and either a trial for the next skill (what to do there is the
 * lines), or why not yet, or that there is nothing more to teach.
 */
export function trainerTalk(hero: Hero): TrainerTalk {
  const skill = nextSkill(hero);
  const known = SKILL_IDS.filter((id) => knows(hero, id)).map(
    (id) => `${SKILLS[id].name} (${arrows(SKILLS[id].keys)})`,
  );
  const recap = known.length ? [`You already know ${known.join(' and ')}.`] : [];
  if (!skill) {
    return { lines: [...recap, 'There is nothing more I can teach you. Spend it well.'], trial: null };
  }
  if (hero.stats.level < skill.minLevel) {
    return {
      lines: [
        ...recap,
        `I can teach you ${skill.name} when you have reached level ${skill.minLevel}. You are level ${hero.stats.level}. Go and fight; come back stronger.`,
      ],
      trial: null,
    };
  }
  const hard = skill.minLevel > 1;
  return {
    lines: [
      ...recap,
      hard
        ? `You have grown, ${hero.name}. Ready for the second trial? I will teach you ${skill.name}.`
        : `So you want to cast without a wand? Magic can live in you, ${hero.name}, and any sword or bow can carry it. I will teach you ${skill.name}.`,
      skill.about,
      `At the training ground, a wave of foes waits. Defeat every one of them, and do not fall. If you fall, you wake here and can try again; walk out through the door at the bottom to give up.`,
      `Once you have it, cast ${skill.name} by tapping ${arrows(skill.keys)} (${directionWords(skill.keys)}: a circle, on the pad too). It costs ${skill.cost} MP, so keep some for it.`,
      'Off you go. I will send you now.',
    ],
    trial: skill,
  };
}

/** What a hero's own spells are (the skills they know), as combos for the combo reader. */
export interface SkillCombo {
  keys: string;
  cost: number;
  skill: SkillId;
}

/** Every combo a hero can tap right now: those of the wand or tome in hand first, then their skills. The index is what travels. */
export type HeroCombo = (Combo & { skill?: undefined }) | SkillCombo;

export function heroCombos(hero: Hero): HeroCombo[] {
  const weapon: HeroCombo[] = [...(hero.weapon.focus?.combos ?? [])];
  const innate: HeroCombo[] = hero.skills.map((id) => ({ keys: SKILLS[id].keys, cost: SKILLS[id].cost, skill: id }));
  return [...weapon, ...innate];
}

/** The most combos a hero can have at once: a tome's, plus every skill. */
export const MAX_HERO_COMBOS = 4 + SKILL_IDS.length;
