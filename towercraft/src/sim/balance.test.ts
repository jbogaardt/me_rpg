// Cheap guards on the balance work (see CLAUDE.md): the real measurement is `npm run towercraft:balance`, this only keeps the
// AI from going back to trickling units and every pairing from going back to stalemating.

import { describe, expect, it } from 'vitest';
import { createAi, styleFor, seeded } from './ai';
import { ROAD_LENGTH } from './board';
import { RACE_IDS, RACES, type RaceId } from './races';
import { TIME_LIMIT, newMatch, step, type Match } from './sim';

const play = (top: RaceId, bottom: RaceId, seed: number): Match => {
  const m = newMatch([top, bottom]);
  const ai = [createAi(0, seed * 2 + 1), createAi(1, seed * 2 + 2)] as const;
  while (m.winner < 0) {
    ai[0](m, 0.05);
    ai[1](m, 0.05);
    step(m, 0.05);
  }
  return m;
};

describe('the AI', () => {
  it('buys its units in waves, never one by one, while nothing threatens it', () => {
    for (const race of RACE_IDS) {
      const m = newMatch([race, race]);
      const ai = createAi(0, 11);
      const waves: number[] = [];
      const seen = new Set<number>();
      for (let i = 0; i < 20 * 150 && m.units.every((u) => u.owner === 0); i++) {
        ai(m, 0.05);
        const fresh = m.units.filter((u) => !seen.has(u.id));
        for (const u of fresh) seen.add(u.id);
        if (fresh.length > 0) waves.push(fresh.length); // a purchase moment is a group of units
        step(m, 0.05);
        m.players[0].wood += 0.25; // a steady income on top of the pay days
        m.players[0].stone += 0.1;
      }
      expect(waves.length).toBeGreaterThan(1);
      expect(Math.min(...waves)).toBeGreaterThanOrEqual(2); // every purchase moment is a group
      expect(Math.max(...waves)).toBeGreaterThanOrEqual(3);
    }
  });

  it('answers cloaked units with a detector and air with something that shoots it', () => {
    const m = newMatch(['legion', 'swarm']);
    m.players[0].wood = m.players[0].stone = 1000;
    m.players[0].castle.level = 2;
    m.time = 100; // well into the match: a side whose foe can field cloaked units has a detector by now
    m.units.push({
      id: 900,
      def: RACES.swarm.units.find((u) => u.id === 'thief')!,
      owner: 1,
      hp: 40,
      maxHp: 40,
      s: 5,
      cooldown: 99,
    });
    const ai = createAi(0, 3);
    for (let i = 0; i < 20 * 10; i++) ai(m, 0.05);
    expect(m.towers.some((t) => t.owner === 0 && t.def.detect)).toBe(true);

    const air = newMatch(['swarm', 'titan']);
    air.players[0].wood = air.players[0].stone = 1000;
    air.players[0].castle.level = 2;
    air.units.push({
      id: 901,
      def: RACES.titan.units.find((u) => u.id === 'gryphon')!,
      owner: 1,
      hp: 360,
      maxHp: 360,
      s: ROAD_LENGTH - 6, // in sight of player 0's castle
      cooldown: 99,
    });
    const ai2 = createAi(0, 3);
    for (let i = 0; i < 20 * 10; i++) ai2(air, 0.05);
    expect(air.towers.some((t) => t.owner === 0 && t.def.damage > 0 && t.def.hits !== 'ground')).toBe(true);
  });

  it('draws its style from the seed alone, and gives neighbouring seeds different styles', () => {
    expect(styleFor(seeded(5))).toEqual(styleFor(seeded(5)));
    const styles = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(styleFor(seeded(i)))));
    expect(styles.size).toBeGreaterThan(10);
  });
});

describe('the races', () => {
  it.each([
    ['swarm', 'titan'],
    ['swarm', 'legion'],
    ['titan', 'legion'],
    ['swarm', 'swarm'],
    ['titan', 'titan'],
    ['legion', 'legion'],
  ] as const)(
    '%s against %s ends with a castle falling in time, whichever side it is on, and replays the same',
    (a, b) => {
      for (const [top, bottom] of [
        [a, b],
        [b, a],
      ] as const) {
        const first = play(top, bottom, 4);
        expect(first.winner === 0 || first.winner === 1).toBe(true);
        expect(first.time).toBeLessThan(TIME_LIMIT);
        const again = play(top, bottom, 4);
        expect([again.winner, again.time, again.players[0].castle.hp, again.players[1].castle.hp]).toEqual([
          first.winner,
          first.time,
          first.players[0].castle.hp,
          first.players[1].castle.hp,
        ]);
      }
    },
    30_000,
  );
});
