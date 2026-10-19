import { describe, expect, it } from 'vitest';
import { SoundWatch } from './soundEvents';
import { canSee, type Shot } from './sim/sim';
import { CLASSIC, RACES, newMatch, put, quiet } from './sim/testkit';

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

  it('plays a blow, a missile and a blast by the kind of attack', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const home = CLASSIC.castles[0];
    m.shots.push(shot(home, true), shot(home, false), shot(home, false, 2));
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['melee', 'shoot', 'blast']);
  });

  it('plays a death, and a blast when the unit blew itself up', () => {
    const m = fresh();
    const watch = new SoundWatch(m);
    const home = CLASSIC.castles[0];
    const def = Object.values(m.races)[0]!.units[0]!;
    m.deaths.push(
      { at: [home[0], home[1]], owner: 0, def, s: 0 },
      { at: [home[0], home[1]], owner: 0, def, s: 0, boom: 2 },
    );
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['death', 'blast']);
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
    expect(watch.collect(m, 0).map((c) => c.kind)).toEqual(['razed']);
  });
});
