import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import { BOARDS, BOARD_IDS, CASTLE_CLEAR, boardIdsFor } from './board';
import { TIME_LIMIT, canBuild, newMatch, step } from './sim';
import { RACES } from './races';

describe('the maps', () => {
  it('has maps that are not symmetric: only the classic road is turned half way round onto itself', () => {
    const symmetric = (id: string) => {
      const { cols, rows, roadCells } = BOARDS[id]!;
      return [...roadCells].every((i) =>
        roadCells.has((rows - 1 - Math.floor(i / cols)) * cols + (cols - 1 - (i % cols))),
      );
    };
    expect(symmetric('greenwood')).toBe(true);
    // The fields for two against two are turned half way round onto themselves too, roads and camps, so neither side has better ground.
    for (const id of boardIdsFor(4)) expect(symmetric(id)).toBe(true);
    expect(BOARD_IDS.filter((id) => !symmetric(id)).length).toBeGreaterThanOrEqual(4);
  });

  it('has several, each with its own picture and a road that is not the same as another', () => {
    expect(BOARD_IDS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(Object.values(BOARDS).map((b) => Math.round(b.roadLength))).size).toBeGreaterThan(2);
  });

  it('has maps for every format: duels, two against one and two against two, with at least two fields each', () => {
    for (const seats of [2, 3, 4]) expect(boardIdsFor(seats).length).toBeGreaterThanOrEqual(seats === 2 ? 4 : 2);
  });

  for (const board of Object.values(BOARDS)) {
    describe(board.id, () => {
      const [COLS, ROWS] = [board.cols, board.rows];
      const cellIndex = board.cellIndex;
      it("has roads that run from a castle to a foe's, in one piece, inside the field", () => {
        expect(board.roadLength).toBeGreaterThan(board.seats === 2 ? 140 : 90);
        // Every camp has a road out to a foe's camp (and none leads to a friend's).
        for (let seat = 0; seat < board.seats; seat++) {
          expect(board.lanes.some((l) => l.from === seat)).toBe(true);
          expect(board.homeLane[seat]).toBe(board.lanes.findIndex((l) => l.from === seat));
        }
        for (const lane of board.lanes) {
          expect(board.teams[lane.from]).not.toBe(board.teams[lane.to]);
          let prev = lane.pointAt(0);
          expect(prev).toEqual(board.castles[lane.from]);
          for (let d = 0.25; d <= lane.length; d += 0.25) {
            const p = lane.pointAt(d);
            expect(Math.hypot(p[0] - prev[0], p[1] - prev[1])).toBeLessThan(0.3); // no jumps
            expect(p[0]).toBeGreaterThan(1);
            expect(p[0]).toBeLessThan(COLS - 1);
            expect(p[1]).toBeGreaterThan(1);
            expect(p[1]).toBeLessThan(ROWS - 1);
            prev = p;
          }
          expect(lane.pointAt(lane.length)).toEqual(board.castles[lane.to]);
          expect(lane.directionAt(lane.length / 2).reduce((a, b) => a + b * b, 0)).toBeCloseTo(1);
        }
      });

      if (board.seats > 2)
        it('forks: the roads from a camp share a stretch and then part, and the roads of two camps cross or merge', () => {
          const from0 = board.lanes.filter((l) => l.from === 0);
          expect(from0.length).toBeGreaterThanOrEqual(2);
          const [a, b] = [from0[0]!, from0[1]!];
          const apart = (d: number) => {
            const [p, q] = [a.pointAt(d), b.pointAt(d)];
            return Math.hypot(p[0] - q[0], p[1] - q[1]);
          };
          expect(apart(5)).toBeLessThan(0.5); // the same road at first
          let widest = 0;
          for (let d = 0; d <= Math.min(a.length, b.length); d += 1) widest = Math.max(widest, apart(d));
          expect(widest).toBeGreaterThan(8); // and then not
          // Roads meet: a lane of the first camp and a lane of the second share road (a crossing, or a merge before the foe's gate).
          const cells = (lane: (typeof board.lanes)[number]) => {
            const set = new Set<number>();
            for (let d = 0; d <= lane.length; d += 0.5) {
              const [x, y] = lane.pointAt(d);
              set.add(Math.floor(y) * board.cols + Math.floor(x));
            }
            return set;
          };
          const theirs = board.lanes.filter((l) => l.from === 1).map(cells);
          const meets = from0.some((l) => [...cells(l)].some((c) => theirs.some((t) => t.has(c))));
          expect(meets).toBe(true);
        });

      it('gives every castle about the same room to build in, whether or not the field is symmetric', () => {
        const m = newMatch(
          Array.from({ length: board.seats }, () => 'legion' as const),
          board,
        );
        const watch = RACES.legion.towers[0]!;
        const room = m.players.map((p, o) => {
          p.wood = p.stone = 9999;
          p.castle.level = 3;
          let n = 0;
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canBuild(m, o, watch, c, r) === 'ok') n++;
          return n;
        });
        expect(Math.min(...room)).toBeGreaterThan(50);
        expect(Math.min(...room) / Math.max(...room)).toBeGreaterThan(0.7);
      });

      it('keeps the road, the castles and a ring of open ground round each free of scenery', () => {
        for (const i of board.roadCells) expect(board.sceneryCells.has(i)).toBe(false);
        for (const [cx, cy] of board.castles)
          for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
              if (Math.hypot(c + 0.5 - cx, r + 0.5 - cy) < CASTLE_CLEAR + 1)
                expect(board.sceneryCells.has(cellIndex(c, r))).toBe(false);
      });

      it('leaves room beside the road for towers within the castle reach and beyond it', () => {
        const m = newMatch(
          Array.from({ length: board.seats }, () => 'legion' as const),
          board,
        );
        m.players[0].wood = m.players[0].stone = 9999;
        const watch = RACES.legion.towers[0]!;
        let free = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canBuild(m, 0, watch, c, r) === 'ok') free++;
        expect(free).toBeGreaterThan(25);
        // Open ground somewhere along the road for a tower to cover it (the AI needs this to place anything).
        const covered = Array.from({ length: Math.floor(board.roadLength / 8) }, (_, k) => k).every((k) => {
          const [x, y] = board.pointAt(k * 8 + 4);
          for (let r = Math.floor(y) - 5; r <= y + 5; r++)
            for (let c = Math.floor(x) - 5; c <= x + 5; c++)
              if (
                c >= 0 &&
                r >= 0 &&
                c < COLS &&
                r < ROWS &&
                !board.roadCells.has(cellIndex(c, r)) &&
                !board.sceneryCells.has(cellIndex(c, r))
              )
                return true;
          return false;
        });
        expect(covered).toBe(true);
      });

      it('plays out: an AI on every seat fights on it until a whole side has fallen', () => {
        const races = Array.from({ length: board.seats }, (_, i) => (i % 2 ? 'swarm' : 'legion'));
        const m = newMatch(races, board);
        const ais = races.map((_, i) => createAi(i, 5 + i));
        while (m.winner < 0) {
          for (const ai of ais) ai(m, 0.05);
          step(m, 0.05);
        }
        expect(m.time).toBeLessThan(TIME_LIMIT);
        expect(m.winner === 0 || m.winner === 1).toBe(true);
        // The side that won still has a castle, and everyone on the other side is out.
        expect(m.players.some((p) => !p.out && p.team === m.winner)).toBe(true);
        expect(m.players.filter((p) => p.team !== m.winner).every((p) => p.out)).toBe(true);
      }, 120000);
    });
  }
});
