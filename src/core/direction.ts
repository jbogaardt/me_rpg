// Facing: the four directions a character can look, as names, indices (the wire format and sprite rows use them) and
// unit vectors. Pure; shared by the sprites, the entities and the network layer.

export type Direction = 'down' | 'up' | 'left' | 'right';

/** Every facing, in the order the network sends them (index = what goes on the wire). */
export const DIRS: readonly Direction[] = ['down', 'up', 'left', 'right'];
export const dirIndex = (d: Direction): number => DIRS.indexOf(d);

/** Unit vector for each facing. */
export const DIR_VEC: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** The facing that best points along (dx, dy). */
export function directionToward(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
