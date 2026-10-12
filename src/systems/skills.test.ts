import { describe, expect, it } from 'vitest';
import { MOB_KINDS, newHero } from './combat';
import { ITEM_COUNT } from './inventory';
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
  activeSkills,
  LOADOUT_SLOTS,
  loadoutCode,
  loadoutFromCode,
  MAX_LOADOUT_CODE,
  setLoadout,
  type SkillId,
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

  it('come one every five levels, at 1, 5, 10 and 15', () => {
    expect(SKILL_IDS.map((id) => SKILLS[id].minLevel)).toEqual([1, 5, 10, 15]);
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
    learn(hero, 'swiftSurge');
    learn(hero, 'ironSkin');
    expect(skillMask(hero)).toBe(MAX_SKILL_MASK);
    expect(skillsFromMask(1)).toEqual(['arcaneEdge']);
    expect(skillsFromMask(MAX_SKILL_MASK)).toEqual([...SKILL_IDS]);
    expect(skillsFromMask(0)).toEqual([]);
    expect(knows(hero, 'spiritMark')).toBe(true);
  });
});

describe('heroCombos', () => {
  it('lists the wand or tome first, then the skills, with sword and bow users getting only skills', () => {
    const hero = newHero();
    expect(heroCombos(hero)).toEqual([]);
    learn(hero, 'arcaneEdge');
    expect(heroCombos(hero).map((c) => c.keys)).toEqual(['ruld']); // learned into a free slot: ready
    hero.weapon = ITEMS.noviceTome;
    const list = heroCombos(hero);
    expect(list.map((c) => c.keys)).toEqual([...ITEMS.noviceTome.focus.combos.map((c) => c.keys), 'ruld']);
    expect(list.at(-1)?.skill).toBe('arcaneEdge');
  });

  it('stays within what the network allows, with a tome and every slot full', () => {
    const hero = newHero();
    hero.weapon = ITEMS.arcaneGrimoire;
    for (const id of SKILL_IDS) learn(hero, id);
    expect(heroCombos(hero).length).toBeLessThanOrEqual(MAX_HERO_COMBOS);
    expect(heroCombos(hero, 'training_adept').length).toBeLessThanOrEqual(MAX_HERO_COMBOS);
  });

  it('keeps a wand’s combos out of the two-skill limit: two skills plus all of the wand’s', () => {
    const hero = newHero();
    hero.weapon = ITEMS.stormcallerWand;
    for (const id of SKILL_IDS) learn(hero, id);
    expect(hero.loadout).toHaveLength(LOADOUT_SLOTS);
    expect(heroCombos(hero)).toHaveLength(ITEMS.stormcallerWand.focus.combos.length + LOADOUT_SLOTS);
    const plain = newHero();
    for (const id of SKILL_IDS) learn(plain, id);
    expect(heroCombos(plain)).toHaveLength(LOADOUT_SLOTS); // a sword gets just the two
  });
});

describe('the loadout', () => {
  it('takes the first two skills learned, and leaves later ones to be swapped in', () => {
    const hero = newHero();
    for (const id of SKILL_IDS) learn(hero, id);
    expect(hero.skills).toEqual([...SKILL_IDS]);
    expect(hero.loadout).toEqual(['arcaneEdge', 'swiftSurge']);
  });

  it('can be changed to any two known skills, but not to more, to unknown ones or to the same twice', () => {
    const hero = newHero();
    learn(hero, 'arcaneEdge');
    learn(hero, 'swiftSurge');
    learn(hero, 'ironSkin');
    expect(setLoadout(hero, ['ironSkin', 'arcaneEdge'])).toBe(true);
    expect(hero.loadout).toEqual(['ironSkin', 'arcaneEdge']);
    expect(setLoadout(hero, ['ironSkin'])).toBe(true);
    expect(setLoadout(hero, [])).toBe(true);
    expect(setLoadout(hero, ['arcaneEdge', 'swiftSurge', 'ironSkin'])).toBe(false);
    expect(setLoadout(hero, ['spiritMark'])).toBe(false); // not learned
    expect(setLoadout(hero, ['arcaneEdge', 'arcaneEdge'])).toBe(false);
    expect(hero.loadout).toEqual([]);
  });

  it('travels as a small code that no wrong loadout can come back from', () => {
    for (const a of [undefined, ...SKILL_IDS]) {
      for (const b of [undefined, ...SKILL_IDS]) {
        const loadout = [a, b].filter((x): x is SkillId => x !== undefined);
        if (a !== undefined && a === b) continue;
        if (a === undefined && b !== undefined) continue; // slots fill from the first
        expect(loadoutFromCode(loadoutCode(loadout))).toEqual(loadout);
      }
    }
    expect(loadoutFromCode(MAX_LOADOUT_CODE + 1)).toBeNull();
    expect(loadoutFromCode(-1)).toBeNull();
    expect(loadoutFromCode(1 * 5 + 1)).toBeNull(); // the same skill in both slots
    expect(MAX_LOADOUT_CODE).toBeLessThanOrEqual(ITEM_COUNT); // a `do` message's item field has to hold it
  });

  it('puts the skill being tested in the second slot of a training ground, and leaves the first alone', () => {
    const hero = newHero();
    learn(hero, 'arcaneEdge');
    expect(activeSkills(hero, 'training_apprentice')).toEqual(['arcaneEdge', 'swiftSurge']);
    expect(activeSkills(hero, 'town')).toEqual(['arcaneEdge']);
    const fresh = newHero();
    expect(activeSkills(fresh, 'training_novice')).toEqual(['arcaneEdge']); // nothing in slot 1: just the one on loan
    learn(hero, 'swiftSurge');
    expect(activeSkills(hero, 'training_journeyman')).toEqual(['arcaneEdge', 'ironSkin']); // replaces slot 2
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

  it('tells a new hero how the two slots and the Magic menu work, and that the skill is on loan in the trial', () => {
    const text = trainerTalk(newHero()).lines.join(' ');
    expect(text).toContain('Magic tab');
    expect(text).toMatch(/two/);
    expect(text).toContain('wand or tome');
    expect(text).toContain('second slot');
    expect(text).toContain('Walk out');
  });

  it('asks a hero for the next level, by name, and reminds them what they know', () => {
    const hero = newHero();
    learn(hero, 'arcaneEdge');
    const talk = trainerTalk(hero);
    expect(talk.trial).toBeNull();
    expect(talk.lines.join(' ')).toContain('level 5');
    expect(talk.lines.join(' ')).toContain('Arcane Edge');
    hero.stats.level = 5;
    expect(trainerTalk(hero).trial?.id).toBe('swiftSurge');
    learn(hero, 'swiftSurge');
    hero.stats.level = 12;
    expect(trainerTalk(hero).trial?.id).toBe('ironSkin');
    learn(hero, 'ironSkin');
    expect(trainerTalk(hero).lines.join(' ')).toContain('level 15');
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
  it('are real kinds, and the later trials’ hit hard enough to matter at their level (defense 14 and 24)', () => {
    for (const [name, atLeast] of [
      ['chieftain', 28],
      ['cultist', 28],
      ['warlord', 40],
      ['wraith', 40],
    ] as const) {
      const kind = MOB_KINDS[name]!;
      expect(kind, name).toBeTruthy();
      expect(kind.attack, name).toBeGreaterThanOrEqual(atLeast);
      expect(kind.defense, name).toBeLessThan(7); // a hero can always hurt them
    }
  });
});
