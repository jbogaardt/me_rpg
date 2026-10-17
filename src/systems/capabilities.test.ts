import { afterEach, describe, expect, it } from 'vitest';
import { parseScenarios } from '../content/schema';
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  CapabilityTable,
  checkCapabilities,
  disabledCapabilities,
  enabled,
  enabledAnywhere,
  flag,
  setCapabilities,
  setting,
  withDials,
  DIALS,
  type Capability,
  type SettingDef,
} from './capabilities';
import { newHero } from './combat';
import { itemOf } from './items';
import { lecternPages } from './lectern';
import { SHOPS, stockOf } from './shops';
import { heroCombos, NO_TRAINING, trainerTalk } from './skills';

afterEach(() => setCapabilities({}));

describe('capabilities', () => {
  it('are all on unless a campaign says otherwise', () => {
    // (campaign 1, installed by the test setup, turns the level gates off everywhere but its two underground rooms)
    for (const id of CAPABILITY_IDS) expect(enabled(id)).toBe(id !== 'levelGates');
    setCapabilities({ guide: false, needs: false });
    expect(disabledCapabilities()).toEqual(['guide', 'needs']);
    setCapabilities({ combos: false }); // a new campaign starts from all on again
    expect(disabledCapabilities()).toEqual(['combos']);
  });

  it('are read from scenarios.json, and a wrong one is reported', () => {
    const file = (capabilities: unknown) => ({ version: 1, start: 'a', capabilities, nodes: [] });
    expect(parseScenarios(file({ guide: false, compass: true })).capabilities).toEqual({ guide: false, compass: true });
    expect(parseScenarios({ version: 1, start: 'a', nodes: [] }).capabilities).toEqual({});
    expect(() => parseScenarios(file({ jetpack: false }))).not.toThrow(); // parse only collects; parseContent throws
  });
});

describe('what each switch takes away', () => {
  const wizard = () => {
    const hero = newHero();
    hero.weapon = itemOf('apprenticeWand');
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

describe('settings, zones and what needs what', () => {
  it('tunes a capability: defaults, the campaign’s word, then the zone’s', () => {
    expect(setting('needs', 'drain')).toBe(1);
    expect(flag('guide', 'fog')).toBe(true);
    setCapabilities(
      { needs: { drain: 2 }, weather: { calm: 0.5 } },
      { swamp: { needs: { drain: 3 } }, cave: { needs: false } },
    );
    expect(setting('needs', 'drain')).toBe(2);
    expect(setting('needs', 'drain', 'swamp')).toBe(3);
    expect(setting('needs', 'drain', 'meadow')).toBe(2); // a zone with nothing of its own takes the campaign's
    expect(setting('weather', 'calm', 'swamp')).toBe(0.5);
    expect(enabled('needs', 'cave')).toBe(false);
    expect(enabled('needs')).toBe(true);
  });

  it('lets a zone switch on what the campaign switched off, and says so', () => {
    setCapabilities({ guide: false }, { town: { guide: { fog: false } } });
    expect(enabled('guide')).toBe(false);
    expect(enabled('guide', 'town')).toBe(true);
    expect(flag('guide', 'fog', 'town')).toBe(false);
    expect(enabledAnywhere('guide')).toBe(true);
    setCapabilities({ guide: false });
    expect(enabledAnywhere('guide')).toBe(false);
  });

  it('ignores a zone’s word on a campaign-wide capability', () => {
    const t = new CapabilityTable({}, { cave: { coop: false } });
    expect(t.enabled('coop', 'cave')).toBe(true);
  });

  it('switches off what needs a capability that is off', () => {
    setCapabilities({ coop: false });
    expect(enabled('trading')).toBe(false);
    setCapabilities({});
    expect(enabled('trading')).toBe(true);
  });

  it('says what is wrong with a spec', () => {
    expect(checkCapabilities({ guide: { fog: false }, needs: { drain: 0.5 } }, 'x')).toEqual([]);
    expect(checkCapabilities(undefined, 'x')).toEqual([]);
    expect(checkCapabilities([], 'x')).toEqual(['x: must be an object']);
    expect(checkCapabilities({ compass: 1 }, 'x')).toEqual(['x.compass: must be true, false or an object of settings']);
    expect(checkCapabilities({ map: false }, 'x')).toEqual([expect.stringContaining('the map is always on')]);
    expect(checkCapabilities({ guide: { fog: 'thick' } }, 'x')).toEqual(['x.guide.fog: must be true or false']);
    expect(checkCapabilities({ compass: { arrow: 1 } }, 'x')).toEqual([
      'x.compass.arrow: is not a setting of compass (it has none)',
    ]);
    expect(checkCapabilities({ weather: { calm: 2 } }, 'x')).toEqual(['x.weather.calm: must be a number from 0 to 1']);
    expect(checkCapabilities({ skills: false }, 'x', 'zone')).toEqual([
      'x.skills: is set for the whole campaign, not per zone',
    ]);
    expect(checkCapabilities({ coop: false, trading: {} }, 'x')).toEqual([
      'x.trading: needs coop, which is switched off',
    ]);
    expect(checkCapabilities({ coop: false }, 'x')).toEqual([]); // trading is simply off with it
  });

  it('gives every setting a default inside its bounds', () => {
    for (const id of CAPABILITY_IDS)
      for (const def of Object.values((CAPABILITIES[id] as { settings?: Record<string, SettingDef> }).settings ?? {}))
        if ('min' in def) {
          expect(def.default).toBeGreaterThanOrEqual(def.min);
          expect(def.default).toBeLessThanOrEqual(def.max);
        }
  });
});

describe('the Dungeon Master’s dials', () => {
  it('lays a switch over the campaign and every zone, and keeps a switched-on capability’s settings', () => {
    const campaign = { needs: { drain: 2 }, guide: false } as const;
    const zones = { swamp: { needs: false, guide: true }, cave: { weather: false } };
    const { campaign: c, zones: z } = withDials(campaign, zones, { needs: true, guide: false, weather: true });
    expect(c).toEqual({ needs: { drain: 2 }, guide: false, weather: true });
    expect(z).toEqual({ swamp: {}, cave: {} });
    const table = new CapabilityTable(c, z);
    expect(table.enabled('needs', 'swamp')).toBe(true);
    expect(table.enabled('guide', 'swamp')).toBe(false);
    expect(table.enabled('weather', 'cave')).toBe(true);
  });

  it('changes nothing with no dials set', () => {
    const zones = { swamp: { needs: false } };
    expect(withDials({ guide: false }, zones, {})).toEqual({ campaign: { guide: false }, zones });
  });

  it('only offers capabilities that change what a zone shows, never what a hero has or who can play', () => {
    for (const id of DIALS) expect(CAPABILITIES[id].scope).toBe('zone');
  });
});
