import { describe, expect, it } from 'vitest';
import { readSavedWorld, saveWorld, savedWorldSearch } from '../../src/content/savedWorld';
import { World } from '../../src/content/world';
import { chooseCampaign } from '../../src/content/campaignChoice';
import { readPacks } from './disk';

const packs = readPacks();

describe('a saved world', () => {
  it('saves a live world and loads it again as the same world', () => {
    const world = new World(5, packs);
    world.open();
    const cue = world.options()[0];
    if (cue) world.apply(world.choose(cue.cue));
    const saved = readSavedWorld(JSON.parse(JSON.stringify(saveWorld(world))))!;
    expect(saved).not.toBeNull();
    // The page opens the world the save names, and replays its log.
    const choice = chooseCampaign(savedWorldSearch(saved), 'campaign1', () => 1);
    expect(choice).toMatchObject({ campaign: 'live', seed: 5, arc: world.arcName });
    const again = new World(choice.seed, packs);
    again.replay(saved.log);
    expect(again.files()).toEqual(world.files());
  });

  it('refuses what is not a save', () => {
    const good = { kind: 'me_rpg-world', version: 1, seed: 5, arc: 'lost_lanterns', log: [{ t: 'begin' }] };
    expect(readSavedWorld(good)).not.toBeNull();
    for (const bad of [
      null,
      'x',
      { ...good, kind: 'other' },
      { ...good, version: 2 },
      { ...good, seed: -1 },
      { ...good, arc: '../x' },
      { ...good, log: [] },
      { ...good, log: [1] },
    ])
      expect(readSavedWorld(bad), JSON.stringify(bad)).toBeNull();
  });
});
