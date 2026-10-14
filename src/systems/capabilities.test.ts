import { afterEach, describe, expect, it } from 'vitest';
import { parseScenarios } from '../content/schema';
import { CAPABILITY_IDS, disabledCapabilities, enabled, setCapabilities, type Capability } from './capabilities';
import { newHero } from './combat';
import { ITEMS } from './items';
import { lecternPages } from './lectern';
import { SHOPS, stockOf } from './shops';
import { heroCombos, NO_TRAINING, trainerTalk } from './skills';

afterEach(() => setCapabilities({}));

describe('capabilities', () => {
  it('are all on unless a campaign says otherwise', () => {
    for (const id of CAPABILITY_IDS) expect(enabled(id)).toBe(true);
    setCapabilities({ map: false, needs: false });
    expect(disabledCapabilities()).toEqual(['map', 'needs']);
    setCapabilities({ combos: false }); // a new campaign starts from all on again
    expect(disabledCapabilities()).toEqual(['combos']);
  });

  it('are read from scenarios.json, and a wrong one is reported', () => {
    const file = (capabilities: unknown) => ({ version: 1, start: 'a', capabilities, nodes: [] });
    expect(parseScenarios(file({ map: false, guide: true })).capabilities).toEqual({ map: false, guide: true });
    expect(parseScenarios({ version: 1, start: 'a', nodes: [] }).capabilities).toEqual({});
    expect(() => parseScenarios(file({ jetpack: false }))).not.toThrow(); // parse only collects; parseContent throws
  });
});

describe('what each switch takes away', () => {
  const wizard = () => {
    const hero = newHero();
    hero.weapon = ITEMS.apprenticeWand;
    hero.skills = ['arcaneEdge'];
    hero.loadout = ['arcaneEdge'];
    return hero;
  };
  const kinds = (off: Capability[]) => {
    setCapabilities(Object.fromEntries(off.map((id) => [id, false])));
    return heroCombos(wizard()).map((c) => (c.skill ? 'skill' : 'wand'));
  };

  it('combos and skills: the combos a hero can tap', () => {
    expect(new Set(kinds([]))).toEqual(new Set(['wand', 'skill']));
    expect(kinds(['combos'])).toEqual(['skill']);
    expect(new Set(kinds(['skills']))).toEqual(new Set(['wand']));
    expect(kinds(['combos', 'skills'])).toEqual([]);
    expect(lecternPages().length).toBe(1);
  });

  it('skills: the trainer teaches nothing', () => {
    setCapabilities({ skills: false });
    expect(trainerTalk(newHero())).toEqual({ lines: NO_TRAINING, trial: null });
  });

  it('needs: shops sell no food or water, but potions still', () => {
    const all = Object.values(SHOPS).flatMap((s) => [...stockOf(s)]);
    setCapabilities({ needs: false });
    const left = Object.values(SHOPS).flatMap((s) => [...stockOf(s)]);
    expect(left.length).toBeLessThan(all.length);
    expect(left).not.toContain('bread');
    expect(left).toContain('potion');
  });
});
