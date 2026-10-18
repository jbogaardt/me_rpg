import { describe, expect, it } from 'vitest';
import type { Command, Player } from '../../entities/Player';
import { AttackBuffer } from '../../systems/inputBuffer';
import { setCapabilities } from '../../systems/capabilities';
import { CELL } from '../../map/types';
import { hopTick, watchLedge } from './Ledges';
import type { Arena } from './Arena';

// A bare player and arena: just the fields the ledge rules touch.
function setup() {
  const b = {
    x: 3 * CELL + 16,
    y: 4 * CELL,
    size: 1,
    facing: 'down',
    face(d: string) {
      this.facing = d;
    },
    cancelAction() {},
    release() {},
    position: {
      set(x: number, y: number) {
        b.x = x;
        b.y = y;
      },
    },
  };
  const p = {
    body: b,
    hop: null,
    dropHold: 0,
    hitstop: 0,
    knock: { x: 0, y: 0 },
    roll: null,
    down: null,
    dm: false,
    grace: 0,
    vel: { x: 0, y: 0 },
    swing: null,
    pendingShot: null,
    drinking: null,
    aim: { x: 0, y: 1 },
    zone: 'z',
    attackBuffer: new AttackBuffer(),
    rollBuffer: new AttackBuffer(),
  } as unknown as Player;
  const arena = {
    zone: { name: 'z', data: { ledges: [{ col: 2, row: 3, w: 3, land: 6 }] } },
    collision: { fitsMap: () => true },
  } as unknown as Arena;
  return { p, arena };
}
const south: Command = { dx: 0, dy: 1, act: false };

describe('ledge drops in the simulation', () => {
  it('starts after the confirm, runs a fixed arc, lands on the landing row, grants grace and keeps a pending press', () => {
    setCapabilities({}, {});
    const { p, arena } = setup();
    for (let i = 0; i < 3; i++) watchLedge(arena, p, south, p.body.y, 1 / 60);
    expect(p.hop).toBeNull(); // a brush does not drop you
    for (let i = 0; i < 4; i++) watchLedge(arena, p, south, p.body.y, 1 / 60);
    expect(p.hop).not.toBeNull();
    expect(p.grace).toBeGreaterThan(0.4);
    p.attackBuffer.press('z');
    let ticks = 0;
    while (p.hop && ticks++ < 100) hopTick(p, { dx: 1, dy: 0, act: false }, 1 / 60);
    expect(ticks).toBeGreaterThanOrEqual(24);
    expect(ticks).toBeLessThanOrEqual(26);
    expect(p.body.y).toBe(6.5 * CELL);
    expect(p.body.facing).toBe('right'); // facing stays the player's
    expect(p.attackBuffer.pending).toBe(true);
  });
  it('never starts when the capability is off, or while the hero still moves', () => {
    const a = setup();
    setCapabilities({ ledges: false }, {});
    for (let i = 0; i < 20; i++) watchLedge(a.arena, a.p, south, a.p.body.y, 1 / 60);
    expect(a.p.hop).toBeNull();
    setCapabilities({}, {});
    const b = setup();
    for (let i = 0; i < 20; i++) watchLedge(b.arena, b.p, south, b.p.body.y - 1, 1 / 60);
    expect(b.p.hop).toBeNull();
  });
});
