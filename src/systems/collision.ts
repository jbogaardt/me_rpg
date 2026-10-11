import { CELL } from '../map/types';

/** Anything with a feet position that can be moved and can block others. */
export interface Body {
  x: number;
  y: number;
  /** Hidden bodies (e.g. a faded-out mob) don't block. */
  visible?: boolean;
}

// The collision box is a small rectangle around the feet: [dx, dy] corners in pixels.
const FOOT_BOX: readonly (readonly [number, number])[] = [
  [-6, -6],
  [6, -6],
  [-6, -1],
  [6, -1],
];
const BODY_W = 14; // bodies closer than this in x AND BODY_H in y overlap
const BODY_H = 8;

/** Cell collision plus body-vs-body blocking. Pure data and maths, so it runs (and is tested) without Pixi. */
export class Collision {
  private blocked: Set<number>;

  constructor(
    private width: number,
    private height: number,
    blocked: Iterable<number>,
  ) {
    this.blocked = new Set(blocked);
  }

  /** Cells outside the map count as blocked. */
  isBlocked(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return true;
    return this.blocked.has(row * this.width + col);
  }

  /** Whether feet at (x, y) fit the map. */
  fitsMap(x: number, y: number): boolean {
    return FOOT_BOX.every(([dx, dy]) => !this.isBlocked(Math.floor((x + dx) / CELL), Math.floor((y + dy) / CELL)));
  }

  /** Whether `body` may step to (x, y): on open ground, and not pushing further into another body. */
  canMove(body: Body, x: number, y: number, others: Iterable<Body>): boolean {
    if (!this.fitsMap(x, y)) return false;
    for (const other of others) {
      if (other === body || other.visible === false) continue;
      const overlaps = Math.abs(x - other.x) < BODY_W && Math.abs(y - other.y) < BODY_H;
      // Moving apart is always allowed, so bodies that end up overlapping (e.g. via knockback) can't get stuck.
      if (overlaps && Math.hypot(x - other.x, y - other.y) < Math.hypot(body.x - other.x, body.y - other.y)) {
        return false;
      }
    }
    return true;
  }

  /** Move with collision, resolving axes separately so bodies slide along walls. Returns true if it moved. */
  slide(body: Body, mx: number, my: number, others: Iterable<Body>): boolean {
    let moved = false;
    if (mx && this.canMove(body, body.x + mx, body.y, others)) {
      body.x += mx;
      moved = true;
    }
    if (my && this.canMove(body, body.x, body.y + my, others)) {
      body.y += my;
      moved = true;
    }
    return moved;
  }
}
