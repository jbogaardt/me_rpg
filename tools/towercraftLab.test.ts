import { describe, expect, it } from 'vitest';
import { RACES } from '../towercraft/src/sim/races';
import { applyOverride, lengthThirds, planJobs, type Result, playMatch, toCsv, winRate } from './towercraftLab';

describe('what-if overrides', () => {
  const races = () => structuredClone(RACES);

  it('sets, scales and adds numbers, walking lists by id or index', () => {
    const r = races();
    const glider = () => r.swarm.units.find((u) => u.id === 'glider')!;
    const hp = glider().hp;
    applyOverride(r, 'swarm.units.glider.hp=*1.5');
    expect(glider().hp).toBeCloseTo(hp * 1.5);
    applyOverride(r, 'swarm.units.glider.hp=+10');
    expect(glider().hp).toBeCloseTo(hp * 1.5 + 10);
    applyOverride(r, 'titan.castle.hp=-10%');
    expect(r.titan.castle.hp).toBeCloseTo(RACES.titan.castle.hp * 0.9);
    applyOverride(r, 'swarm.castle.upgrades.0.wood=99');
    expect(r.swarm.castle.upgrades[0].wood).toBe(99);
    expect(RACES.swarm.castle.upgrades[0].wood).not.toBe(99);
  });

  it('refuses a path or value that is not a number in the data', () => {
    const r = races();
    expect(() => applyOverride(r, 'swarm.units.nope.hp=1')).toThrow(/nope/);
    expect(() => applyOverride(r, 'swarm.name=3')).toThrow(/not a number/);
    expect(() => applyOverride(r, 'swarm.units.glider.hp=lots')).toThrow(/not a number/);
    expect(() => applyOverride(r, 'swarm')).toThrow(/path=value/);
  });
});

describe('the matrix and its statistics', () => {
  it('pairs every entrant with every other and itself, on every map, alternating the sides', () => {
    const jobs = planJobs({
      maps: ['serpent', 'straight'],
      races: ['swarm', 'titan'],
      strategies: ['rush', 'turtle'],
      n: 4,
      seedBase: 1,
    });
    expect(jobs).toHaveLength(2 * 10 * 4); // 4 entrants -> 10 pairs
    expect(new Set(jobs.map((j) => j.seed)).size).toBe(jobs.length);
    const pair = jobs.filter((j) => j.map === 'serpent' && j.top.race !== j.bottom.race);
    expect(pair.some((j) => j.top.race === 'swarm')).toBe(true);
    expect(pair.some((j) => j.top.race === 'titan')).toBe(true);
  });

  it('splits decisive matches into early, middle and late thirds, leaving stalemates out', () => {
    const side = { race: 'swarm' as const, plan: 'random' };
    const at = (time: number, winner: -1 | 0 | 1): Result => ({
      map: 'serpent',
      top: side,
      bottom: side,
      seed: 1,
      winner,
      time,
      hp: [1, 0],
      made: [{}, {}],
    });
    const rs = [at(60, 0), at(120, 1), at(180, 0), at(240, 1), at(300, 0), at(360, 1), at(900, -1)];
    const [early, middle, late] = lengthThirds(rs);
    expect([early.rs.length, middle.rs.length, late.rs.length]).toEqual([2, 2, 2]);
    expect(Math.max(...early.rs.map((r) => r.time))).toBeLessThan(Math.min(...late.rs.map((r) => r.time)));
  });

  it('puts a Wilson interval round a win rate that narrows with the sample', () => {
    const small = winRate(6, 4);
    const big = winRate(60, 40);
    expect(small.p).toBeCloseTo(0.6);
    expect(big.hi - big.lo).toBeLessThan(small.hi - small.lo);
    expect(big.lo).toBeLessThan(0.6);
    expect(big.hi).toBeGreaterThan(0.6);
    expect(winRate(0, 0).n).toBe(0);
  });

  it('plays the same match twice the same way, on any map, and writes it as a CSV row', () => {
    const job = {
      map: 'switchback',
      top: { race: 'legion' as const, plan: 'rush' },
      bottom: { race: 'swarm' as const, plan: 'turtle' },
      seed: 5,
    };
    const [a, b] = [playMatch(job), playMatch(job)];
    expect(a).toEqual(b);
    const csv = toCsv([a]).trim().split('\n');
    expect(csv).toHaveLength(2);
    expect(csv[1].split(',').length).toBe(csv[0].split(',').length);
  });

  it('refuses an unknown map or strategy by name', () => {
    const side = { race: 'swarm' as const, plan: 'random' };
    expect(() => playMatch({ map: 'nowhere', top: side, bottom: side, seed: 1 })).toThrow(/nowhere/);
    expect(() => playMatch({ map: 'serpent', top: { ...side, plan: 'zzz' }, bottom: side, seed: 1 })).toThrow(/zzz/);
  });
});
