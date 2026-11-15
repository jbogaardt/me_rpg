import { describe, expect, it } from 'vitest';
import {
  ALERT_EVERY,
  AlertWatch,
  castleShare,
  clockText,
  inView,
  miniToCell,
  payDay,
  sides,
  timeLeft,
  unitsOut,
} from './hudModel';
import { PAY_EVERY, TIME_LIMIT } from './sim/sim';
import { CLASSIC, RACES, newMatch, put, quiet } from './sim/testkit';

const fresh = () => quiet(newMatch(['legion', 'legion']));
const far = { cx: 0, cy: 0, halfW: 1, halfH: 1 };
const here = (at: readonly [number, number]) => ({ cx: at[0], cy: at[1], halfW: 10, halfH: 10 });

describe('the status numbers', () => {
  it('writes the clock as minutes and seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(61.9)).toBe('1:01');
    expect(clockText(-4)).toBe('0:00');
    expect(timeLeft(fresh())).toBe(TIME_LIMIT);
  });

  it('adds up a side’s castle health', () => {
    const m = fresh();
    expect(castleShare(m, [0])).toBe(1);
    m.players[1].castle.hp = m.players[1].castle.maxHp / 4;
    expect(castleShare(m, [1])).toBeCloseTo(0.25);
    expect(castleShare(m, [0, 1])).toBeCloseTo(0.625);
  });

  it('tells your side from the others whoever you are', () => {
    const m = fresh();
    expect(sides(m, 1)).toEqual({ mine: [1], foes: [0] });
  });

  it('counts your units and the next pay day', () => {
    const m = fresh();
    expect(unitsOut(m, 0)).toBe(0);
    m.payTimer = PAY_EVERY / 2;
    const pay = payDay(m, 0);
    expect(pay.progress).toBeCloseTo(0.5);
    expect(pay.total).toBe(pay.wood + pay.stone);
    expect(pay.total).toBeGreaterThan(0);
  });

  it('maps the minimap to the field', () => {
    const m = fresh();
    expect(miniToCell(m, 0.5, 0.5)).toEqual([m.board.cols / 2, m.board.rows / 2]);
    expect(miniToCell(m, -1, 2)).toEqual([0, m.board.rows]);
    expect(inView(far, [0.5, 0.5])).toBe(true);
    expect(inView(far, [3, 0])).toBe(false);
  });
});

describe('alerts', () => {
  it('says nothing while nothing is hurt', () => {
    const m = fresh();
    expect(new AlertWatch(m).collect(m, 0, far)).toEqual([]);
  });

  it('warns once when the castle is hit off screen, then waits', () => {
    const m = fresh();
    const w = new AlertWatch(m);
    m.players[0].castle.hp -= 10;
    expect(w.collect(m, 0, far).map((a) => a.kind)).toEqual(['castle']);
    m.players[0].castle.hp -= 10;
    expect(w.collect(m, 0, far)).toEqual([]);
    m.time += ALERT_EVERY;
    m.players[0].castle.hp -= 10;
    expect(w.collect(m, 0, far).map((a) => a.kind)).toEqual(['castle']);
  });

  it('keeps quiet about a castle you can see, and about a foe’s', () => {
    const m = fresh();
    const w = new AlertWatch(m);
    m.players[0].castle.hp -= 10;
    expect(w.collect(m, 0, here(CLASSIC.castles[0]))).toEqual([]);
    m.players[1].castle.hp -= 10;
    expect(w.collect(m, 0, far)).toEqual([]);
  });

  it('is for whoever you are: the guest’s castle is seat 1', () => {
    const m = fresh();
    const w = new AlertWatch(m);
    m.players[1].castle.hp -= 10;
    expect(w.collect(m, 1, far).map((a) => a.kind)).toEqual(['castle']);
  });

  it('warns about your tower off screen, not a repair', () => {
    const m = fresh();
    const home = CLASSIC.castles[0];
    const t = put(m, 0, 'legion', RACES.legion.towers[0]!.id, Math.round(home[0]) + 3, Math.round(home[1]));
    const w = new AlertWatch(m);
    t.hp += 5;
    expect(w.collect(m, 0, far)).toEqual([]);
    t.hp -= 20;
    const [a] = w.collect(m, 0, far);
    expect(a?.kind).toBe('tower');
    expect(a?.at).toEqual([t.col + 0.5, t.row + 0.5]);
  });

  it('announces a fallen ally', () => {
    const m = fresh();
    m.players[1].team = m.players[0].team; // make the rival an ally
    const w = new AlertWatch(m);
    m.players[1].out = true;
    expect(w.collect(m, 0, far).map((x) => x.kind)).toEqual(['ally']);
  });
});
