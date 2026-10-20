import { describe, expect, it } from 'vitest';
import { REPAIR_TIME, repairCost, repairTower, step } from './sim';
import { newMatch, put } from './testkit';

const fresh = () => {
  const m = newMatch(['swarm', 'swarm']);
  const t = put(m, 0, 'swarm', m.races.swarm.towers.find((d) => d.damage > 0)!.id, 10, 10);
  return { m, t };
};

describe('tower repair', () => {
  it('costs a share of the price by the health missing, and heals over time', () => {
    const { m, t } = fresh();
    expect(repairTower(m, 0, t.id)).toBe('max');
    t.hp = t.def.hp / 2;
    const cost = repairCost(t);
    expect(cost.wood + cost.stone).toBeGreaterThan(0);
    m.players[0].wood = m.players[0].stone = 1000;
    expect(repairTower(m, 0, t.id)).toBe('ok');
    expect(m.players[0].wood).toBe(1000 - cost.wood);
    expect(t.hp).toBe(t.def.hp / 2);
    expect(repairTower(m, 0, t.id)).toBe('max'); // already being mended
    step(m, REPAIR_TIME / 4);
    expect(t.hp).toBeGreaterThan(t.def.hp / 2);
    expect(t.hp).toBeLessThan(t.def.hp);
    step(m, REPAIR_TIME);
    expect(t.hp).toBeCloseTo(t.def.hp);
    expect(t.mend).toBeUndefined();
  });

  it('needs the money', () => {
    const { m, t } = fresh();
    t.hp = 1;
    m.players[0].wood = m.players[0].stone = 0;
    expect(repairTower(m, 0, t.id)).toBe('gold');
  });
});

describe('selling a tower', () => {
  it('pays half the price, frees the ground and lets another one go there', async () => {
    const { sellRefund, sellTower, buildTower } = await import('./sim');
    const { m, t } = fresh();
    m.players[0].wood = m.players[0].stone = 0;
    const back = sellRefund(t);
    expect(back.wood).toBe(Math.floor(t.def.cost.wood / 2));
    expect(sellTower(m, 1, t.id)).toBe('unknown'); // not the rival's
    expect(sellTower(m, 0, t.id)).toBe('ok');
    expect(m.towers.includes(t)).toBe(false);
    expect(m.players[0].wood).toBe(back.wood);
    expect(m.players[0].stone).toBe(back.stone);
    expect(sellTower(m, 0, t.id)).toBe('unknown');
    m.players[0].wood = m.players[0].stone = 1000;
    expect(buildTower(m, 0, t.def.id, t.col, t.row)).not.toBe('taken'); // the cell is free again
  });
});

describe('camps', () => {
  it('walk units out from the producer buildings, taking turns, and from the castle for the base unit', async () => {
    const { trainUnit } = await import('./sim');
    const m = newMatch(['swarm', 'swarm']);
    m.players[0].wood = m.players[0].stone = 9999;
    const unit = m.races.swarm.units.find((u) => u.needs)!;
    const a = put(m, 0, 'swarm', unit.needs!, 12, 14);
    const b = put(m, 0, 'swarm', unit.needs!, 12, 30);
    for (let i = 0; i < 4; i++) expect(trainUnit(m, 0, unit.id)).toBe('ok');
    expect([a.spawned, b.spawned]).toEqual([2, 2]);
    expect(m.units.some((u) => u.s > 1)).toBe(true); // out where the camps are, not all at the castle
    const base = m.races.swarm.units.find((u) => !u.needs)!;
    const before = m.units.length;
    expect(trainUnit(m, 0, base.id)).toBe('ok');
    expect(m.units.slice(before).every((u) => u.s < 9)).toBe(true);
  });
});
