// One-way drops off a plateau's edge (core engine, Pixi-free, host-owned): where a hero standing on a ledge's edge row and
// walking south drops to. The map says where (`MapData.ledges`, `z.plateau(..., { ledges })`); `systems` and the scene do the
// hop. Pure maths, unit-tested.

import { CELL, type LedgeSpawn } from './types';

/** The ledge whose edge row the feet at (x, y) stand in, if any. */
export function ledgeAt(ledges: readonly LedgeSpawn[] | undefined, x: number, y: number): LedgeSpawn | undefined {
  if (!ledges?.length) return undefined;
  const [col, row] = [Math.floor(x / CELL), Math.floor(y / CELL)];
  return ledges.find((l) => l.row === row && col >= l.col && col < l.col + l.w);
}

/** Where a hero who drops from a ledge at feet x lands: straight below, in the middle of the landing row's cell. */
export function landingOf(ledge: LedgeSpawn, x: number): { x: number; y: number } {
  const col = Math.min(ledge.col + ledge.w - 1, Math.max(ledge.col, Math.floor(x / CELL)));
  return { x: col * CELL + CELL / 2, y: ledge.land * CELL + CELL / 2 };
}
