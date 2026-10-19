import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import { BOARDS, laneOf } from './board';
import {
  allied,
  canBuild,
  canSee,
  foesOf,
  incomeOf,
  isSeen,
  newMatch,
  openLanes,
  playing,
  setFocus,
  setLane,
  step,
  switchLane,
  teamSeats,
  trainUnit,
  unitPos,
  visionOf,
  TIME_LIMIT,
  type Match,
  type Owner,
  type Unit,
} from './sim';
import { RACES, type RaceId } from './races';

const FOUR = BOARDS.crossroads!; // seats 0, 1 against 2, 3
const THREE = BOARDS.twinfords!; // seats 0, 1 against 2

const match = (board = FOUR, race: RaceId = 'legion', pace: number[] = []) =>
  newMatch(
    board.teams.map(() => race),
    board,
    undefined,
    pace,
  );

/** A unit put on a lane without buying it. */
function place(m: Match, owner: Owner, lane: number, s: number, id = 'ritter', over: Partial<Unit> = {}): Unit {
  const def = RACES.legion.units.find((u) => u.id === id) ?? RACES.legion.units[0]!;
  const u: Unit = { id: m.nextId++, def, owner, lane, s, hp: def.hp, maxHp: def.hp, cooldown: 0, ...over };
  m.units.push(u);
  return u;
}
const quiet = (m: Match) => {
  for (const p of m.players) p.castle.cooldown = 1e9;
  return m;
};
const run = (m: Match, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) step(m, 1 / 20);
};
const lane = (m: Match, from: Owner, to: Owner, nth = 0) =>
  m.board.lanes.filter((l) => l.from === from && l.to === to)[nth]!;

describe('sides', () => {
  it("puts seats on the board's sides and knows who fights whom", () => {
    const m = match();
    expect(m.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    expect(allied(m, 0, 1)).toBe(true);
    expect(allied(m, 0, 2)).toBe(false);
    expect(foesOf(m, 0)).toEqual([2, 3]);
    expect(foesOf(m, 3)).toEqual([0, 1]);
    expect(teamSeats(m, 1)).toEqual([0, 1]);
    // A duel is two sides of one.
    const duel = newMatch(['legion', 'swarm']);
    expect(foesOf(duel, 0)).toEqual([1]);
  });

  it('never has allies hurt each other: units, towers and castles pass one another by', () => {
    const m = quiet(match());
    // Seat 0's and seat 1's units meet on a shared crossing and fight only the foes'.
    const a = place(m, 0, lane(m, 0, 3).id, 30);
    const b = place(m, 1, lane(m, 1, 2).id, 30);
    const [pa, pb] = [unitPos(a, m.board), unitPos(b, m.board)];
    expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])).toBeGreaterThan(0); // they are on different roads
    b.s = 0;
    a.s = 0;
    run(m, 5);
    expect(a.hp).toBe(a.maxHp);
    expect(b.hp).toBe(b.maxHp);
  });

  it("shares what a side sees: an ally's tower reveals foes to the whole side", () => {
    const m = quiet(match());
    const foe = place(m, 2, lane(m, 2, 0).id, 40);
    const at = unitPos(foe, m.board);
    const before = visionOf(m);
    expect(canSee(m, 0, at, 0, before) || canSee(m, 1, at, 0, before)).toBe(false);
    // A tower of seat 1 standing by the foe sees it, and seat 0 sees it through seat 1.
    const def = RACES.legion.towers[0]!;
    m.towers.push({
      id: m.nextId++,
      def,
      owner: 1,
      col: Math.floor(at[0]) + 2,
      row: Math.floor(at[1]),
      hp: def.hp,
      cooldown: 0,
      garrison: [],
    });
    const v = visionOf(m);
    expect(isSeen(m, 1, foe, v)).toBe(true);
    expect(isSeen(m, 0, foe, v)).toBe(true);
    expect(isSeen(m, 3, foe, v)).toBe(true); // its own side always sees it
  });

  it('refuses building near any foe castle', () => {
    const m = match();
    const watch = RACES.legion.towers[0]!;
    m.players[0].wood = m.players[0].stone = 9999;
    const [cx, cy] = m.board.castles[2]!;
    expect(canBuild(m, 0, watch, Math.floor(cx) + 6, Math.floor(cy) - 4)).toBe('foe');
    const [bx, by] = m.board.castles[3]!;
    expect(canBuild(m, 0, watch, Math.floor(bx) - 6, Math.floor(by) - 4)).toBe('foe');
  });

  it("pays a kill to the seat that landed it, not to the foe's first seat", () => {
    const m = quiet(match());
    // Seat 3 kills a unit of seat 0: seat 3 is paid, seat 2 is not.
    const victim = place(m, 0, lane(m, 0, 3).id, 40, 'ritter', { hp: 1 });
    const killer = place(m, 3, lane(m, 3, 0).id, lane(m, 3, 0).length - 40);
    void killer;
    const [w2, w3] = [m.players[2]!.wood, m.players[3]!.wood];
    victim.by = 3;
    victim.hp = 0;
    step(m, 0.05);
    expect(m.players[3]!.wood).toBeGreaterThan(w3);
    expect(m.players[2]!.wood).toBe(w2);
  });
});

describe('roads that fork', () => {
  it('has units walk the lane they are bought for, and sends new ones where the seat last pointed', () => {
    const m = match();
    const lanes = openLanes(m, 0);
    expect(lanes.map((l) => l.to).sort()).toEqual([2, 3]);
    m.players[0].wood = m.players[0].stone = 9999;
    expect(setLane(m, 0, lanes[1]!.id)).toBe('ok');
    expect(trainUnit(m, 0, RACES.legion.units[0]!.id)).toBe('ok');
    const u = m.units.at(-1)!;
    expect(u.lane).toBe(lanes[1]!.id);
    expect(laneOf(m.board, u).to).toBe(lanes[1]!.to);
    // A lane that is another seat's (or an ally's) cannot be chosen.
    expect(setLane(m, 0, m.board.lanes.find((l) => l.from === 2)!.id)).toBe('unknown');
  });

  it('walks a unit to the foe castle at the end of its lane and hits only that', () => {
    const m = match();
    const l = lane(m, 0, 3);
    const u = place(m, 0, l.id, l.length - 8, 'ritter');
    const before = [m.players[2]!.castle.hp, m.players[3]!.castle.hp];
    run(m, 20);
    expect(m.players[3]!.castle.hp).toBeLessThan(before[1]!);
    expect(m.players[2]!.castle.hp).toBe(before[0]);
    expect(u.lane).toBe(l.id);
  });

  it('sends units after a given castle, crossing to it only where the roads meet', () => {
    const m = quiet(match());
    const west = lane(m, 0, 2); // seat 0's road to seat 2
    const u = place(m, 0, west.id, 5); // still on the stem both roads of seat 0 share
    expect(setFocus(m, 0, [u.id], { kind: 'castle', owner: 3 })).toBe('ok');
    expect(laneOf(m.board, u).to).toBe(3);
    expect(u.focus).toEqual({ kind: 'castle', owner: 3 });
    // Far down a road that does not meet the other, it stays where it is.
    const far = place(m, 0, west.id, west.length / 2);
    expect(setFocus(m, 0, [far.id], { kind: 'castle', owner: 3 })).toBe('unreachable');
    expect(laneOf(m.board, far).to).toBe(2);
    // An ally's castle is no target.
    expect(setFocus(m, 0, [u.id], { kind: 'castle', owner: 1 })).toBe('unknown');
  });

  it('can move a unit to another lane at the nearest point, or refuses when it is too far', () => {
    const m = quiet(match());
    const [a, b] = [lane(m, 0, 2), lane(m, 0, 3)];
    const u = place(m, 0, a.id, 6);
    expect(switchLane(m, u, b.id, 2)).toBe(true);
    expect(u.lane).toBe(b.id);
    expect(u.s).toBeGreaterThan(4);
    expect(u.s).toBeLessThan(8);
    const stray = place(m, 0, a.id, a.length - 3);
    expect(switchLane(m, stray, b.id, 2)).toBe(false);
    expect(stray.lane).toBe(a.id);
    // A lane that is another seat's cannot be taken.
    expect(switchLane(m, u, lane(m, 2, 0).id)).toBe(false);
  });
});

describe('a seat falls', () => {
  it("takes its units and buildings with it and turns the foes' armies to the other camp, while the match goes on", () => {
    const m = quiet(match());
    const toTwo = place(m, 0, lane(m, 0, 2).id, 60);
    const own = place(m, 2, lane(m, 2, 0).id, 20);
    const def = RACES.legion.towers[0]!;
    m.towers.push({ id: m.nextId++, def, owner: 2, col: 60, row: 60, hp: def.hp, cooldown: 0, garrison: [] });
    m.players[2]!.castle.hp = 0;
    step(m, 0.05);
    expect(m.players[2]!.out).toBe(true);
    expect(m.winner).toBe(-1);
    expect(m.units.includes(own)).toBe(false);
    expect(m.towers.some((t) => t.owner === 2)).toBe(false);
    expect(laneOf(m.board, toTwo).to).toBe(3);
    expect(foesOf(m, 0)).toEqual([3]);
    expect(playing(m, 2)).toBe(false);
    // The fallen seat can no longer act.
    m.players[2]!.wood = m.players[2]!.stone = 9999;
    expect(trainUnit(m, 2, RACES.legion.units[0]!.id)).toBe('over');
    expect(incomeOf(m, 3).wood).toBeGreaterThan(0);
  });

  it("ends the match when the whole side is out, for the winning side, and a seat's own fall alone does not", () => {
    const m = quiet(match());
    m.players[2]!.castle.hp = 0;
    step(m, 0.05);
    expect(m.winner).toBe(-1);
    m.players[3]!.castle.hp = 0;
    step(m, 0.05);
    expect(m.winner).toBe(0);
    const lost = quiet(match());
    lost.players[0].castle.hp = lost.players[1].castle.hp = 0;
    step(lost, 0.05);
    expect(lost.winner).toBe(1);
  });

  it('is a draw when both sides fall at once, and decided on castle health left at the time limit', () => {
    const both = quiet(match());
    for (const p of both.players) p.castle.hp = 0;
    step(both, 0.05);
    expect(both.winner).toBe(2);
    const late = quiet(match());
    late.time = TIME_LIMIT;
    late.players[3]!.castle.hp = late.players[3]!.castle.maxHp / 4;
    step(late, 0.05);
    expect(late.winner).toBe(0); // team 0 has all of its castles' health, team 1 less
  });
});

describe('pace', () => {
  it('multiplies what a seat earns every pay day', () => {
    const m = match(THREE, 'legion', [1, 1, 1.5]);
    expect(incomeOf(m, 2).wood).toBeCloseTo(incomeOf(m, 0).wood * 1.5);
    expect(incomeOf(m, 2).stone).toBeCloseTo(incomeOf(m, 0).stone * 1.5);
  });
});

describe('computers on every seat', () => {
  it('plays a three-seat match to the end, and the lone side takes more than one road', () => {
    const m = newMatch(['legion', 'swarm', 'titan'], THREE, undefined, [1, 1, 1.8]);
    const ais = m.players.map((_, i) => createAi(i, 11 + i));
    const lanesUsed = new Set<number>();
    while (m.winner < 0) {
      for (const ai of ais) ai(m, 0.05);
      step(m, 0.05);
      for (const u of m.units) if (u.owner === 2) lanesUsed.add(u.lane ?? -1);
    }
    expect(m.winner === 0 || m.winner === 1).toBe(true);
    expect(lanesUsed.size).toBeGreaterThan(1);
  }, 120_000);

  it('is the same game again from the same seeds, and an AI rebuilt from its saved memory carries on exactly', () => {
    const [m1, m2] = [match(FOUR, 'legion'), match(FOUR, 'legion')];
    const first = m1.players.map((_, i) => createAi(i, 3 + i));
    let second = m2.players.map((_, i) => createAi(i, 3 + i));
    for (let i = 0; i < 20 * 120; i++) {
      for (const ai of first) ai(m1, 0.05);
      for (const ai of second) ai(m2, 0.05);
      step(m1, 0.05);
      step(m2, 0.05);
      if (i === 20 * 60) {
        // A page that joins now: new AIs with only the saved memory (the style comes from the seed).
        second = second.map((ai, k) => {
          const fresh = createAi(k, 3 + k);
          fresh.load(ai.save());
          return fresh;
        });
      }
    }
    const view = (m: Match) => m.players.map((p) => [p.wood, p.stone, p.castle.hp, p.castle.level]);
    expect(view(m1)).toEqual(view(m2));
    expect(m1.units.map((u) => [u.id, u.s, u.lane])).toEqual(m2.units.map((u) => [u.id, u.s, u.lane]));
    expect(m1.towers.length).toBeGreaterThan(0);
  }, 120_000);
});
