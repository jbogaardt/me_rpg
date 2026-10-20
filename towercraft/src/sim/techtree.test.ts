// Sweeps every race's tech tree with the real rules: with endless money, can a player reach castle level 3 and unlock every unit
// and building? Catches a race whose upgrade asks for buildings it can never have (a tier it has no producer of, a limit too low).

import { describe, expect, it } from 'vitest';
import { RACE_IDS, RACES, type RaceId } from './races';
import {
  buildTower,
  garrisonUnits,
  newMatch,
  towerUnlocked,
  unitUnlocked,
  upgradeCastle,
  upgradeLacks,
  type Match,
} from './sim';

/** Build everything now allowed (one pass over the cells near the castle) and return how many went up. */
const buildAll = (m: Match): number => {
  const [cx, cy] = m.board.castles[0];
  const cells: [number, number][] = [];
  for (let row = Math.floor(cy) - 14; row <= cy + 14; row++)
    for (let col = Math.floor(cx) - 14; col <= cx + 14; col++) cells.push([col, row]);
  cells.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  let built = 0;
  for (const def of RACES[m.players[0].race].towers) {
    while (towerUnlocked(m, 0, def) === 'ok' && m.towers.filter((t) => t.def.id === def.id).length < 3) {
      const at = cells.find(([c, r]) => buildTower(m, 0, def.id, c, r) === 'ok');
      if (!at) break;
      built++;
    }
  }
  return built;
};

describe('the tech tree', () => {
  it.each(RACE_IDS)('%s can reach castle level 3 and unlock every unit and building', (race: RaceId) => {
    const m = newMatch([race, race]);
    const p = m.players[0];
    p.wood = p.stone = 1e6;
    for (let pass = 0; pass < 6; pass++) {
      buildAll(m);
      if (upgradeLacks(m, 0).length === 0 && p.castle.level < 3) expect(upgradeCastle(m, 0)).toBe('ok');
    }
    expect(upgradeLacks(m, 0)).toEqual([]);
    expect(p.castle.level).toBe(3);
    for (const t of RACES[race].towers) expect(towerUnlocked(m, 0, t), `${race} tower ${t.id}`).not.toBe('needs');
    for (const u of RACES[race].units) expect(unitUnlocked(m, 0, u), `${race} unit ${u.id}`).toBe('ok');
  });
});

describe('garrisoning', () => {
  it('sends picked soldiers near a bunker into it, up to its free slots, and not others', () => {
    const m = newMatch(['titan', 'legion']);
    const [cx, cy] = m.board.castles[0];
    m.players[0].wood = m.players[0].stone = 1e6;
    m.players[0].castle.level = 3;
    const col = Math.floor(cx) + 4;
    const row = Math.floor(cy) + 4;
    const spot = [col, row, col + 1, row, col - 1, row, col, row + 1, col, row - 1];
    let id = '';
    for (let i = 0; i < spot.length && !id; i += 2)
      if (buildTower(m, 0, 'bunker', spot[i]!, spot[i + 1]!) === 'ok') id = 'ok';
    const bunker = m.towers.find((t) => t.def.id === 'bunker')!;
    const thunder = RACES.titan.units.find((u) => u.id === 'thunderer')!;
    const axe = RACES.titan.units.find((u) => u.id === 'axefighter')!;
    const mk = (def: typeof thunder, s: number) => {
      const u = { id: m.nextId++, def, owner: 0, hp: def.hp, maxHp: def.hp, s, cooldown: 0 };
      m.units.push(u);
      return u.id;
    };
    const ids = [mk(thunder, 2), mk(thunder, 2.5), mk(axe, 3), ...Array.from({ length: 5 }, () => mk(thunder, 3))];
    const went = garrisonUnits(m, 0, bunker.id, ids);
    expect(went).toBe(bunker.def.bunker!.slots);
    expect(bunker.garrison).toHaveLength(went);
    expect(m.units.some((u) => u.id === ids[2])).toBe(true); // the axefighter cannot man it
  });
});
