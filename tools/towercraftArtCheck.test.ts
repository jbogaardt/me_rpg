// Every picture the races name must be a file in towercraft/public/art (a missing one is a blank sprite in the game).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RACES, RACE_IDS } from '../towercraft/src/sim/races';

const art = (p: string) => fs.existsSync(`towercraft/public/art/${p}.png`);

describe('towercraft art', () => {
  for (const id of RACE_IDS) {
    const race = RACES[id];
    it(`${id}: every building, castle, sheet and portrait is a file`, () => {
      const missing = [
        ...race.towers.filter((t) => !art(t.art)).map((t) => `${t.id}: ${t.art}`),
        ...(art(race.castle.art) ? [] : [`castle: ${race.castle.art}`]),
        ...race.units.filter((u) => !art(`units/${u.sheet}`)).map((u) => `${u.id}: units/${u.sheet}`),
        ...race.units.filter((u) => u.art && !art(u.art)).map((u) => `${u.id}: ${u.art}`),
      ];
      expect(missing).toEqual([]);
    });
  }
});
