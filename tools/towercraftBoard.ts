// Draws Towercraft's field (towercraft/public/art/lane.png) and lists what blocks building (towercraft/src/sim/scenery.ts) with Me RPG's
// own map pipeline: grass, a dirt road painted on cell corners (so every bend gets the real LPC autotile blend, tools/map/terrain.ts),
// and Me RPG's woods, lakes, rocks and bushes for scenery. The road is towercraft/src/sim/road.ts. The field turns half way round onto
// itself, scenery included, so neither player has better ground: everything is placed once and again rotated, lakes in shapes that
// are the same upside down. Woods keep to the margins and the corners away from the castles, and a band of open ground is left along
// both sides of the road for towers (bushes and rocks may still stand in it, and then block their cell).
// Run `npm run towercraft:board` after changing the road or the scenery.

import fs from 'node:fs';
import path from 'node:path';
import { TREES } from './map/catalog';
import { ROOT, renderMap, writePng } from './map/image';
import { Zone, type Rect } from './map/zone';
import { COLS, ROWS, WAYPOINTS } from '../towercraft/src/sim/road';

/** A rectangle turned half way round the field. */
const turnRect = (r: Rect): Rect => ({ col: COLS - (r.col + r.w), row: ROWS - (r.row + r.h), w: r.w, h: r.h });
/** A cell turned half way round the field. */
const turnCell = (c: number, r: number): [number, number] => [COLS - 1 - c, ROWS - 1 - r];

/** The road as rectangles of cells, one per straight run. */
export function roadRects(): Rect[] {
  const runs: Rect[] = [];
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [a, b] = [WAYPOINTS[i], WAYPOINTS[i + 1]];
    runs.push({
      col: Math.min(a[0], b[0]),
      row: Math.min(a[1], b[1]),
      w: Math.abs(b[0] - a[0]) + 1,
      h: Math.abs(b[1] - a[1]) + 1,
    });
  }
  return runs;
}

/** An oval lake as rows of cells that read the same turned upside down (so its turned twin is the same shape). */
function lakeRows(cx: number, cy: number, hw: number, hh: number): Rect[] {
  const rows: Rect[] = [];
  for (let dy = -hh; dy <= hh; dy++) {
    const half = Math.max(1, Math.round(hw * Math.sqrt(1 - (dy / (hh + 0.6)) ** 2)));
    rows.push({ col: cx - half, row: cy + dy, w: half * 2, h: 1 });
  }
  return rows;
}

const lcg = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
};

export function fieldZone(): Zone {
  const z = new Zone(COLS, ROWS);
  z.fill('grass');
  const road = roadRects();
  z.paint('dirt', road);
  z.spawn(WAYPOINTS[0][0], WAYPOINTS[0][1]); // a map needs one; it is not drawn

  // Woods: the side margins and the corners away from the castles (the margin is everything past the band of open ground by the road).
  const woods: [Rect, number][] = [
    [{ col: -2, row: -2, w: 4, h: ROWS + 4 }, 1], // the left margin (its turn is the right one)
    [{ col: 12, row: -2, w: 16, h: 3 }, 2], // the top edge, clear of the first castle
  ];
  for (const [rect, seed] of woods) {
    z.forest(rect, { seed, trees: [...TREES] });
    z.forest(turnRect(rect), { seed: seed + 10, trees: [...TREES] });
  }

  // Lakes in the pockets between runs: their middle rows only, leaving three clear rows each side for towers.
  const lakes: [number, number, number, number][] = [
    [17, 9, 4, 1],
    [22, 23, 4, 1],
    [14, 37, 4, 1],
  ];
  for (const [cx, cy, hw, hh] of lakes) {
    for (const [x, y] of [[cx, cy], turnCell(cx, cy)] as const) {
      const rows = lakeRows(x, y, hw, hh);
      z.paint(
        'sand',
        rows.map((r) => ({ col: r.col - 1, row: r.row - 1, w: r.w + 2, h: r.h + 2 })),
      );
      z.paint('pond', rows);
      for (const r of rows) z.block(r, 'pond');
    }
  }

  // Bushes and rocks, placed in the top half and again turned, off the road by two cells and off the lakes.
  const rand = lcg(7);
  const taken = new Set<number>();
  const near = (c: number, r: number) =>
    WAYPOINTS.some((q, i) => (i === 0 || i === WAYPOINTS.length - 1) && Math.hypot(c - q[0], r - q[1]) < 13) || // room round the castles
    road.some((q) => c >= q.col - 2 && c < q.col + q.w + 2 && r >= q.row - 2 && r < q.row + q.h + 2) ||
    lakes.some(([cx, cy, hw, hh]) => Math.abs(c - cx) <= hw + 1 && Math.abs(r - cy) <= hh + 2);
  const scatter = (names: string[], count: number) => {
    for (let placed = 0, tries = 0; placed < count && tries < 8000; tries++) {
      const col = 2 + Math.floor(rand() * (COLS - 4));
      const row = 2 + Math.floor(rand() * (ROWS / 2 - 3));
      const [tc, tr] = turnCell(col, row);
      if (near(col, row) || near(tc, tr) || taken.has(row * COLS + col) || taken.has(tr * COLS + tc)) continue;
      taken.add(row * COLS + col);
      taken.add(tr * COLS + tc);
      const name = names[Math.floor(rand() * names.length)] as never;
      z.prop(name, col, row);
      z.prop(name, tc, tr);
      placed++;
    }
  };
  scatter(['bush'], 14);
  scatter(['rock', 'rockSmall', 'rockB', 'rockC'], 12);
  return z;
}

if (process.argv[1] === import.meta.filename) {
  const data = fieldZone().toMapData();
  const out = path.join(ROOT, 'towercraft/public/art/lane.png');
  writePng(out, renderMap(data));
  // What blocks building: everything the map blocks, and its turned twin (the woods are random, so the two halves can differ by a
  // cell or two at the margins; blocking both keeps the field fair).
  const blocked = new Set<number>();
  for (const i of data.collision) {
    blocked.add(i);
    const [c, r] = turnCell(i % COLS, Math.floor(i / COLS));
    blocked.add(r * COLS + c);
  }
  const file = path.join(ROOT, 'towercraft/src/sim/scenery.ts');
  fs.writeFileSync(
    file,
    `// Generated by \`npm run towercraft:board\` (tools/towercraftBoard.ts): do not edit by hand.\nexport const SCENERY: readonly number[] = [${[...blocked].sort((a, b) => a - b).join(', ')}];\n`,
  );
  console.log(
    `wrote ${path.relative(ROOT, out)} and ${path.relative(ROOT, file)} (${blocked.size} blocked cells of ${COLS * ROWS})`,
  );
}
