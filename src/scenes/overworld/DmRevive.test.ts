import { describe, expect, it } from 'vitest';
import type { Player } from '../../entities/Player';
import type { Arena } from './Arena';
import { DmRevive, REVIVE_WINDOW } from './DmRevive';
import type { Simulation } from './Simulation';
import type { Zones } from './Zones';

function game(role: 'host' | 'solo' = 'host') {
  const fen = { name: 'fen' };
  const wood = { name: 'wood' };
  const zones = new Map([
    ['fen', fen],
    ['wood', wood],
  ]);
  const player = (slot: number, name: string) => ({ slot, hero: { name }, body: { x: 0, y: 0 } }) as unknown as Player;
  const party = [player(1, 'Ana'), player(2, 'Bo')];
  const dm = { dm: true, slot: 0, body: { x: 320, y: 480 } };
  const arena = {
    role,
    zones,
    view: wood,
    local: dm,
    // `party()` is only the zone being worked in (the DM's); the fallen wake at the start, so they are elsewhere
    party: () => [],
    everyone: () => [dm, ...party],
    inZone: <T>(_z: unknown, fn: () => T) => fn(),
  } as unknown as Arena;
  const moved: { slot: number; zone: string; cell: { col: number; row: number } }[] = [];
  const zonesApi = {
    travel: (p: Player, dest: { name: string }, cell: { col: number; row: number }) =>
      moved.push({ slot: p.slot, zone: dest.name, cell }),
  } as unknown as Zones;
  const fx: string[] = [];
  const sim = { onDefeat: () => {}, fx: (n: string) => fx.push(n), text: () => {} } as unknown as Simulation;
  const revive = new DmRevive(arena, sim, zonesApi);
  const fall = (p: Player, zone: string, x: number, y: number) => sim.onDefeat(p, zone, x, y);
  return { revive, fall, party, moved, fx };
}

describe('raising the fallen', () => {
  it('remembers who fell and where, once each', () => {
    const { revive, fall, party } = game();
    fall(party[0]!, 'fen', 64, 96);
    fall(party[0]!, 'fen', 70, 100); // falls again: the newest counts
    fall(party[1]!, 'wood', 10, 10);
    expect(revive.fallen.map((f) => [f.slot, f.zone, f.x])).toEqual([
      [1, 'fen', 70],
      [2, 'wood', 10],
    ]);
    expect(revive.unoffered?.slot).toBe(1);
  });

  it('raises them where they fell, with a flourish', () => {
    const { revive, fall, party, moved, fx } = game();
    fall(party[0]!, 'fen', 64, 96);
    expect(revive.raiseWhere(1)).toBe(true);
    expect(moved).toEqual([{ slot: 1, zone: 'fen', cell: { col: 2, row: 3 } }]);
    expect(fx).toEqual(['heal']);
    expect(revive.fallen).toEqual([]);
    expect(revive.raiseWhere(1)).toBe(false); // nobody to raise now
  });

  it('brings them to the DM, or lets them wake at the start', () => {
    const { revive, fall, party, moved } = game();
    fall(party[0]!, 'fen', 64, 96);
    fall(party[1]!, 'fen', 64, 96);
    expect(revive.bringHere(1)).toBe(true);
    expect(moved).toEqual([{ slot: 1, zone: 'wood', cell: { col: 10, row: 15 } }]);
    revive.leave(2);
    expect(moved).toHaveLength(1);
    expect(revive.fallen).toEqual([]);
  });

  it('falls back to the DM when the land they fell in is no longer loaded', () => {
    const { revive, fall, party, moved } = game();
    fall(party[0]!, 'gone', 64, 96);
    expect(revive.raiseWhere(1)).toBe(true);
    expect(moved[0]!.zone).toBe('wood');
  });

  it('lets the moment pass, and only counts online', () => {
    const { revive, fall, party } = game();
    fall(party[0]!, 'fen', 1, 1);
    revive.update(REVIVE_WINDOW + 1);
    expect(revive.fallen).toEqual([]);
    const solo = game('solo');
    solo.fall(solo.party[0]!, 'fen', 1, 1);
    expect(solo.revive.fallen).toEqual([]);
  });
});
