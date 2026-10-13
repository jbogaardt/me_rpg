// The outline of a group of cells as the corner-painted terrain draws it (Pixi-free, tested): the LPC terrain paints a
// pond on cell *corners*, so its drawn edge runs through the bank cells round it, about halfway between the pond's own
// corners and the land's. `cellsOutline` traces that edge with marching squares over the corners and rounds it off, so a
// shape drawn from it follows the shore the way the bank tiles do instead of stepping along the cells.

export type Point = [x: number, y: number];

/**
 * The closed outlines (in cells, corner (0, 0) at the map's top-left) round a set of cells of a map `width` cells wide.
 * `reach` (0..1) is how far the edge lies from the shape's corners toward the land's: 0.5 is halfway. Each loop is
 * smoothed `smooth` times (Chaikin), so the corners come out round.
 */
export function cellsOutline(cells: readonly number[], width: number, reach = 0.5, smooth = 2): Point[][] {
  // A corner is inside when it is a corner of one of the cells. Corner (cx, cy) is keyed cy * (width + 1) + cx.
  const stride = width + 1;
  const inside = new Set<number>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of cells) {
    const col = i % width;
    const row = Math.floor(i / width);
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      inside.add((row + dy) * stride + col + dx);
    }
    minX = Math.min(minX, col);
    minY = Math.min(minY, row);
    maxX = Math.max(maxX, col + 1);
    maxY = Math.max(maxY, row + 1);
  }
  if (!cells.length) return [];
  const at = (cx: number, cy: number) => (cx >= 0 && cy >= 0 && cx < stride ? inside.has(cy * stride + cx) : false);

  // Marching squares over the squares between corners (one square past the shape on every side), each giving the
  // edge's segments, from a point on one side of the square to a point on another. A point is kept as a string key.
  const next = new Map<string, string>();
  const where = new Map<string, Point>();
  const point = (x: number, y: number): string => {
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    where.set(key, [x, y]);
    return key;
  };
  for (let sy = minY - 1; sy <= maxY; sy++) {
    for (let sx = minX - 1; sx <= maxX; sx++) {
      const tl = at(sx, sy);
      const tr = at(sx + 1, sy);
      const br = at(sx + 1, sy + 1);
      const bl = at(sx, sy + 1);
      // A point on each side, `reach` of the way from the inside corner to the outside one.
      const top = () => point(tl ? sx + reach : sx + 1 - reach, sy);
      const right = () => point(sx + 1, tr ? sy + reach : sy + 1 - reach);
      const bottom = () => point(bl ? sx + reach : sx + 1 - reach, sy + 1);
      const left = () => point(sx, tl ? sy + reach : sy + 1 - reach);
      // Segments run with the inside on their right (clockwise round the shape, y down), so loops chain one way.
      const add = (from: string, to: string) => next.set(from, to);
      switch ((tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)) {
        case 1: add(left(), bottom()); break; // prettier-ignore
        case 2: add(bottom(), right()); break; // prettier-ignore
        case 3: add(left(), right()); break; // prettier-ignore
        case 4: add(right(), top()); break; // prettier-ignore
        case 5: add(left(), top()); add(right(), bottom()); break; // prettier-ignore
        case 6: add(bottom(), top()); break; // prettier-ignore
        case 7: add(left(), top()); break; // prettier-ignore
        case 8: add(top(), left()); break; // prettier-ignore
        case 9: add(top(), bottom()); break; // prettier-ignore
        case 10: add(top(), right()); add(bottom(), left()); break; // prettier-ignore
        case 11: add(top(), right()); break; // prettier-ignore
        case 12: add(right(), left()); break; // prettier-ignore
        case 13: add(right(), bottom()); break; // prettier-ignore
        case 14: add(bottom(), left()); break; // prettier-ignore
        default:
          break; // 0 and 15: no edge in this square
      }
    }
  }

  // Chain the segments into closed loops.
  const loops: Point[][] = [];
  const seen = new Set<string>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Point[] = [];
    for (let key: string | undefined = start; key !== undefined && !seen.has(key); key = next.get(key)) {
      seen.add(key);
      loop.push(where.get(key)!);
    }
    if (loop.length >= 3) loops.push(roundOff(loop, smooth));
  }
  return loops;
}

/** Chaikin's corner cutting on a closed loop: each pass replaces every corner by two points a quarter in from it. */
export function roundOff(loop: readonly Point[], passes: number): Point[] {
  let pts = [...loop];
  for (let p = 0; p < passes; p++) {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    pts = out;
  }
  return pts;
}
