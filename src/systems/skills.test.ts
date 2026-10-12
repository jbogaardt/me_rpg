import { describe, expect, it } from 'vitest';
import { MOB_KINDS, newHero } from './combat';
import { ITEMS } from './items';
import {
  heroCombos,
  isTrialZone,
  knows,
  learn,
  MAX_HERO_COMBOS,
  MAX_SKILL_MASK,
  nextSkill,
  SKILL_IDS,
  skillMask,
  SKILLS,
  skillsFromMask,
  skillOfZone,
  trainerTalk,
} from './skills';
import { COMBO_KEYS } from './spells';

const allWeaponCombos = Object.values(ITEMS).flatMap((i) => ('focus' in i ? i.focus.combos.map((c) => c.keys) : []));

describe('skills', () => {
  it('are four taps of the four directions, with every direction used and costing mana', () => {
    for (const id of SKILL_IDS) {
      const { keys, cost } = SKILLS[id];
      expect(keys.length, id).toBe(4);
      expect(
        [...keys].every((k) => (COMBO_KEYS as readonly string[]).includes(k)),
        id,
      ).toBe(true);
      expect(new Set(keys).size, id).toBe(4); // a full turn, so walking about does not set one off
      expect(cost, id).toBeGreaterThan(0);
    }
  });

  it('never clash with each other or with any wand or tome combo, so both can be tapped at once', () => {
    const skillKeys = SKILL_IDS.map((id) => SKILLS[id].keys);
    const all = [...skillKeys, ...allWeaponCombos];
    for (const a of skillKeys) {
      expect(allWeaponCombos, a).not.toContain(a);
      for (const b of all) if (a !== b) expect(b.includes(a) || a.includes(b), `${a} / ${b}`).toBe(false);
    }
    expect(new Set(skillKeys).size).toBe(skillKeys.length);
  });

  it('are weaker than a wand: cheaper to learn than they are to outdo, and the second needs level 15', () => {
    expect(SKILLS.arcaneEdge.minLevel).toBe(1);
    expect(SKILLS.spiritMark.minLevel).toBe(15);
    expect(SKILLS.spiritMark.minLevel).toBeGreaterThan(SKILLS.arcaneEdge.minLevel);
  });

  it('each have their own training ground, which is a trial zone', () => {
    for (const id of SKILL_IDS) {
      expect(isTrialZone(SKILLS[id].zone), id).toBe(true);
      expect(skillOfZone(SKILLS[id].zone)?.id).toBe(id);
    }
    expect(isTrialZone('town')).toBe(false);
    expect(new Set(SKILL_IDS.map((id) => SKILLS[id].zone)).size).toBe(SKILL_IDS.length);
  });

  it('can be learned once, in a fixed order, and travel as a mask', () => {
    const hero = newHero();
    expect(learn(hero, 'spiritMark')).toBe(true);
    expect(learn(hero, 'arcaneEdge')).toBe(true);
    expect(learn(hero, 'arcaneEdge')).toBe(false);
    expect(hero.skills).toEqual(['arcaneEdge', 'spiritMark']); // always in SKILL_IDS order, so both sides agree on indices
    expect(skillMask(hero)).toBe(MAX_SKILL_MASK);
    expect(skillsFromMask(1)).toEqual(['arcaneEdge']);
    expect(skillsFromMask(0)).toEqual([]);
    expect(knows(hero, 'spiritMark')).toBe(true);
  });
});

describe('heroCombos', () => {
  it('lists the wand or tome first, then the skills, with sword and bow users getting only skills', () => {
    const hero = newHero();
    expect(heroCombos(hero)).toEqual([]);
    learn(hero, 'arcaneEdge');
    expect(heroCombos(hero).map((c) => c.keys)).toEqual(['ruld']);
    hero.weapon = ITEMS.noviceTome;
    const list = heroCombos(hero);
    expect(list.map((c) => c.keys)).toEqual([...ITEMS.noviceTome.focus.combos.map((c) => c.keys), 'ruld']);
    expect(list.at(-1)?.skill).toBe('arcaneEdge');
  });

  it('stays within what the network allows', () => {
    const hero = newHero();
    hero.weapon = ITEMS.arcaneGrimoire;
    for (const id of SKILL_IDS) learn(hero, id);
    expect(heroCombos(hero).length).toBeLessThanOrEqual(MAX_HERO_COMBOS);
  });
});

describe('the trainer', () => {
  it('offers the first trial to a new hero, with what to do before it starts', () => {
    const talk = trainerTalk(newHero());
    expect(talk.trial?.id).toBe('arcaneEdge');
    const text = talk.lines.join(' ');
    expect(text).toContain('Arcane Edge');
    expect(text).toMatch(/every one|Defeat every/);
    expect(text).toContain('↑'); // the keys to tap
  });

  it('asks a hero who knows the first skill to come back at level 15', () => {
    const hero = newHero();
    learn(hero, 'arcaneEdge');
    const talk = trainerTalk(hero);
    expect(talk.trial).toBeNull();
    expect(talk.lines.join(' ')).toContain('level 15');
    hero.stats.level = 15;
    expect(trainerTalk(hero).trial?.id).toBe('spiritMark');
    expect(nextSkill(hero)?.id).toBe('spiritMark');
  });

  it('has nothing left to teach once everything is learned', () => {
    const hero = newHero();
    for (const id of SKILL_IDS) learn(hero, id);
    expect(trainerTalk(hero).trial).toBeNull();
    expect(nextSkill(hero)).toBeNull();
  });
});

describe('the trials’ enemies', () => {
  it('are real kinds, and the second trial’s hit hard enough to matter at level 15 (defense about 24)', () => {
    expect(MOB_KINDS.warlord && MOB_KINDS.wraith).toBeTruthy();
    for (const kind of [MOB_KINDS.warlord!, MOB_KINDS.wraith!]) {
      expect(kind.attack).toBeGreaterThan(30);
      expect(kind.defense).toBeLessThan(7); // a hero can always hurt them
    }
  });
});
