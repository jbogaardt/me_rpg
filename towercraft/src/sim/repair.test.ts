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
