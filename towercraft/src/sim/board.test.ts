import { describe, expect, it } from 'vitest';
import { createAi } from './ai';
import { BOARDS, BOARD_IDS, CASTLE_CLEAR, COLS, ROWS, cellIndex } from './board';
import { TIME_LIMIT, canBuild, newMatch, step } from './sim';
import { RACES } from './races';

describe('the maps', () => {
  it('has several, each with its own picture and a road that is not the same as another', () => {
    expect(BOARD_IDS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(Object.values(BOARDS).map((b) => Math.round(b.length))).size).toBeGreaterThan(2);
  });

  for (const board of Object.values(BOARDS)) {
    describe(board.id, () => {
      it('runs from a castle to the other, in one piece, inside the field', () => {
        expect(board.length).toBeGreaterThan(150);
        let prev = board.pointAt(0);
        expect(prev).toEqual(board.castles[0]);
        for (let d = 0.25; d <= board.length; d += 0.25) {
          const p = board.pointAt(d);
          expect(Math.hypot(p[0] - prev[0], p[1] - prev[1])).toBeLessThan(0.3); // no jumps
          expect(p[0]).toBeGreaterThan(1);
          expect(p[0]).toBeLessThan(COLS - 1);
          expect(p[1]).toBeGreaterThan(1);
          expect(p[1]).toBeLessThan(ROWS - 1);
          prev = p;
        }
        expect(board.pointAt(board.length)).toEqual(board.castles[1]);
        expect(board.headingAt(board.length / 2).reduce((a, b) => a + b * b, 0)).toBeCloseTo(1);
      });

      it('is turned half way round onto itself: road, scenery and castles, so neither side has better ground', () => {
        const turn = (i: number) => cellIndex(COLS - 1 - (i % COLS), ROWS - 1 - Math.floor(i / COLS));
        expect(board.castles[1][0]).toBeCloseTo(COLS - board.castles[0][0]);
        expect(board.castles[1][1]).toBeCloseTo(ROWS - board.castles[0][1]);
        for (const i of board.roadCells) expect(board.roadCells.has(turn(i))).toBe(true);
        for (const i of board.sceneryCells) expect(board.sceneryCells.has(turn(i))).toBe(true);
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
        const m = newMatch(['legion', 'legion'], board.id);
        m.players[0].gold = 9999;
        const watch = RACES.legion.towers[0]!;
        let free = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canBuild(m, 0, watch, c, r) === 'ok') free++;
        expect(free).toBeGreaterThan(25);
        // Open ground somewhere along the road for a tower to cover it (the AI needs this to place anything).
        const covered = Array.from({ length: Math.floor(board.length / 8) }, (_, k) => k).every((k) => {
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

      it('plays out: two AIs fight on it until a castle falls', () => {
        const m = newMatch(['legion', 'swarm'], board.id);
        const ai = [createAi(0, 5), createAi(1, 6)] as const;
        while (m.winner < 0) {
          ai[0](m, 0.05);
          ai[1](m, 0.05);
          step(m, 0.05);
        }
        expect(m.time).toBeLessThan(TIME_LIMIT);
        expect(m.winner === 0 || m.winner === 1).toBe(true);
      }, 60000);
    });
  }
});
