import { describe, expect, it } from 'vitest';
import { ALARM_EVERY, SoundWatch, WARN_EVERY } from './soundEvents';
import { canSee, TIME_LIMIT, PAY_EVERY, type Shot } from './sim/sim';
import { CLASSIC, RACES, newMatch, put, quiet, spawn } from './sim/testkit';

const fresh = () => quiet(newMatch(['legion', 'legion']));
const shot = (from: readonly [number, number], melee: boolean, splash = 0): Shot => ({
  by: { kind: 'unit', id: 1 },
  from: [from[0], from[1]],
  to: [from[0], from[1]],
  melee,
  splash,
});

describe('what a tick sounds like', () => {
  it('is silent when nothing happened', () => {
    const m = fresh();
    expect(new SoundWatch(m).collect(m, 0)).toEqual([]);
  });

  it('plays an attack by the weapon class of whoever made it, and where a missile lands', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const home = CLASSIC.castles[0];
    const unit = spawn(m, 0, 'legion', 'warrior', 3);
    const by = { kind: 'unit' as const, id: unit.id };
    m.shots.push({ ...shot(home, true), by }, { ...shot(home, false), by: { kind: 'castle', id: 0 } });
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['sword', 'bow', 'arrowhit']);
  });

  it('gives a tower’s shot its own weapon, and a catapult’s stone a landing on the wall it hits', () => {
    const m = fresh();
    const home = CLASSIC.castles[0];
    const t = put(m, 0, 'legion', 'catapult', Math.round(home[0]) + 3, Math.round(home[1]));
    const watch = new SoundWatch(m);
    watch.collect(m, 0);
    m.shots.push({
      ...shot([t.col + 0.5, t.row + 0.5], false, 0.8),
      by: { kind: 'tower', id: t.id },
      to: [home[0], home[1]],
    });
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['catapult', 'hitstone']);
  });

  it('plays a death by race and creature, and a blast when the unit blew itself up', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const home = CLASSIC.castles[0];
    const def = (id: string) => RACES.legion.units.find((u) => u.id === id)!;
    m.deaths.push(
      { at: [home[0], home[1]], owner: 0, def: def('warrior'), s: 0 },
      { at: [home[0], home[1]], owner: 0, def: def('ritter'), s: 0 },
      { at: [home[0], home[1]], owner: 0, def: def('falcon'), s: 0 },
      { at: [home[0], home[1]], owner: 0, def: def('sapper'), s: 0, boom: 2 },
    );
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['deathhuman', 'deathbeast', 'deathflyer', 'blast']);
  });

  it('keeps what the player cannot see silent', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const foe = CLASSIC.castles[1];
    expect(canSee(m, 0, foe)).toBe(false);
    m.shots.push(shot(foe, true));
    expect(watch.collect(m, 0)).toEqual([]);
  });

  it('hears a tower go up once, in full when it is the player’s own', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const home = CLASSIC.castles[0];
    put(m, 0, 'legion', RACES.legion.towers[0]!.id, Math.round(home[0]) + 3, Math.round(home[1]));
    const cues = watch.collect(m, 0);
    expect(cues.map((c) => [c.kind, c.own])).toEqual([['build', true]]);
    expect(watch.collect(m, 0)).toEqual([]);
  });

  it('hears a castle level and an upgrade, and the fall of a castle', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    m.players[0].castle.level++;
    expect(watch.collect(m, 0).map((c) => [c.kind, c.own])).toEqual([['castle', true]]);
    m.players[0].upgrades.groundDamage = 1;
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['upgrade']);
    m.players[1].castle.hp = 0;
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['fall']);
    expect(watch.collect(m, 0)).toEqual([]);
  });

  it('plays a razed tower', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const home = CLASSIC.castles[0];
    m.razed.push({ col: Math.round(home[0]), row: Math.round(home[1]) });
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['razedSmall']);
  });

  it('collapses a big building as stone and a small one as timber', () => {
    const m = fresh();
    const home = CLASSIC.castles[0];
    const big = RACES.legion.towers.find((t) => t.hp >= 500)!;
    const small = RACES.legion.towers.find((t) => t.hp < 500)!;
    put(m, 0, 'legion', big.id, Math.round(home[0]) + 3, Math.round(home[1]));
    put(m, 0, 'legion', small.id, Math.round(home[0]) + 6, Math.round(home[1]));
    const watch = new SoundWatch(m);
    m.razed.push(
      { col: Math.round(home[0]) + 3, row: Math.round(home[1]) },
      { col: Math.round(home[0]) + 6, row: Math.round(home[1]) },
    );
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['razedLarge', 'razedSmall']);
  });

  it('hears a unit go into a bunker', () => {
    const m = fresh();
    const home = CLASSIC.castles[0];
    const bunker = RACES.legion.towers.find((t) => t.bunker)!;
    const t = put(m, 0, 'legion', bunker.id, Math.round(home[0]) + 3, Math.round(home[1]));
    const watch = new SoundWatch(m);
    t.garrison.push({ def: RACES.legion.units[0]!, cooldown: 0 });
    expect(watch.collect(m, 0).map((c) => [c.kind, c.own])).toEqual([['bunker', true]]);
    expect(watch.collect(m, 0)).toEqual([]);
  });

  it('sounds the alarm when the player’s castle is hit, at most once every ALARM_EVERY seconds', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    m.time = 100;
    m.players[0].castle.hp -= 10;
    expect(watch.collect(m, 0).map((c) => [c.kind, c.own])).toEqual([['alarm', true]]);
    m.time += 1;
    m.players[0].castle.hp -= 10;
    expect(watch.collect(m, 0)).toEqual([]);
    m.time += ALARM_EVERY;
    m.players[0].castle.hp -= 10;
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['alarm']);
  });

  it('does not alarm for the rival’s castle, nor for a castle that fell (that has its own sound)', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    m.players[1].castle.hp -= 10;
    expect(watch.collect(m, 0)).toEqual([]);
    m.players[0].castle.hp = 0;
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['fall']);
  });

  it('warns about a hurt building of the player’s, throttled, and not when it is mended', () => {
    const m = fresh();
    const home = CLASSIC.castles[0];
    const t = put(m, 0, 'legion', RACES.legion.towers[0]!.id, Math.round(home[0]) + 3, Math.round(home[1]));
    const watch = new SoundWatch(m);
    t.hp -= 5;
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['warn']);
    t.hp -= 5;
    m.time += 1;
    expect(watch.collect(m, 0)).toEqual([]);
    m.time += WARN_EVERY;
    t.hp += 3; // mended
    expect(watch.collect(m, 0)).toEqual([]);
    t.hp -= 3;
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['warn']);
  });

  it('ticks a coin only when pay-day brings income', () => {
    const m = fresh();
    m.payTimer = PAY_EVERY - 0.01;
    const watch = new SoundWatch(m);
    m.payTimer = 0.04; // wrapped: a pay-day happened
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['coin']);
    m.payTimer = 0.09;
    expect(watch.collect(m, 0)).toEqual([]);
  });

  it('warns once at a minute and once at ten seconds before the time limit', () => {
    const m = fresh();
    m.time = TIME_LIMIT - 61;
    const watch = new SoundWatch(m);
    const kinds: string[] = [];
    for (const t of [TIME_LIMIT - 59.95, TIME_LIMIT - 59.9, TIME_LIMIT - 10.05, TIME_LIMIT - 9.95, TIME_LIMIT - 9.9]) {
      m.time = t;
      kinds.push(...watch.collect(m, 0).map((c) => c.kind));
    }
    expect(kinds).toEqual(['clock', 'clockLast']);
  });

  it('plays a stinger once at the end: victory for the winner’s team, defeat for the other, nothing for a draw', () => {
    const won = fresh();
    const w = new SoundWatch(won);
    won.winner = 0;
    expect(w.collect(won, 0).map((c) => c.kind)).toEqual(['win']);
    expect(w.collect(won, 0)).toEqual([]);
    const lost = fresh();
    const l = new SoundWatch(lost);
    lost.winner = 1;
    expect(l.collect(lost, 0).map((c) => c.kind)).toEqual(['lose']);
    const draw = fresh();
    const d = new SoundWatch(draw);
    draw.winner = 2;
    expect(d.collect(draw, 0)).toEqual([]);
  });
});
