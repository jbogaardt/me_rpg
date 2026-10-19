// Draws Towercraft's fields (towercraft/public/art/maps/<id>.png) and lists what blocks building on each
// (towercraft/src/sim/scenery.ts) with Me RPG's own map pipeline: a ground, a road painted on cell corners (so every bend gets the
// real LPC autotile blend, tools/map/terrain.ts), and Me RPG's woods, lakes, rocks and bushes for scenery, in the look of one of its
// biomes (greenwood, frostlands, desert, emberwaste, witchmire). The roads are towercraft/src/sim/road.ts. Every field turns half way
// round onto itself, scenery included, so neither player has better ground: everything is placed once and again turned, lakes in
// shapes that are the same upside down. Woods keep to the margins and the clumps away from the road, and a band of open ground is
// left along both sides of the road for towers (bushes and rocks may still stand in it, and then block their cell).
// Run `npm run towercraft:board` after changing a road or the scenery (`-- <id>` for one map).

import fs from 'node:fs';
import path from 'node:path';
import { DEAD_TREES, DRY_TREES, FROST_TREES, SWAMP_TREES, TREES, type PrefabName } from './map/catalog';
import { ROOT, renderMap, writePng } from './map/image';
import { Zone, type Rect } from './map/zone';
import type { GroundName } from './map/catalog';
import type { TerrainName } from './map/terrain';
import { BOARDS } from '../towercraft/src/sim/board';
import { COLS, ROADS, ROWS, type Pt, type RoadDef } from '../towercraft/src/sim/road';

/** How one map looks: Me RPG's grounds, terrains and kits for it. */
interface Theme {
  ground: GroundName;
  /** Laid over the whole field (soft-edged), so the ground reads as that biome's. */
  cover?: TerrainName;
  /** Patches of other earth over the ground. */
  patches?: TerrainName[];
  road: TerrainName;
  /** What a lake is made of, and the ring round it. */
  lake: { terrain: TerrainName; shore?: TerrainName };
  trees: PrefabName[];
  bushes: PrefabName[];
  rocks: PrefabName[];
}
const names = (...n: string[]) => n as PrefabName[];
const THEMES: Record<string, Theme> = {
  greenwood: {
    ground: 'grass',
    road: 'dirt',
    lake: { terrain: 'pond', shore: 'sand' },
    trees: [...TREES],
    bushes: names('bush'),
    rocks: names('rock', 'rockSmall', 'rockB', 'rockC'),
  },
  frostlands: {
    ground: 'snow',
    cover: 'snow',
    road: 'dirt',
    lake: { terrain: 'ice', shore: 'snow' },
    trees: [...FROST_TREES],
    bushes: names('frostBush', 'frostBushSmall'),
    rocks: names('frostRock', 'frostRockSmall', 'frostRockB', 'frostRockC'),
  },
  desert: {
    ground: 'sand',
    cover: 'sand',
    patches: ['redDirt'],
    road: 'dirt',
    lake: { terrain: 'pond', shore: 'meadow' },
    trees: [...DRY_TREES],
    bushes: names('dryBush', 'dryBushSmall'),
    rocks: names('sandBoulder', 'sandBoulderB', 'sandSpire'),
  },
  mire: {
    ground: 'grass',
    cover: 'darkGrass',
    patches: ['mud'],
    road: 'mud',
    lake: { terrain: 'murk', shore: 'mud' },
    trees: [...SWAMP_TREES],
    bushes: names('swampBush', 'swampBushSmall'),
    rocks: names('rockSmall'),
  },
  ember: {
    ground: 'grass',
    cover: 'ash',
    patches: ['soot', 'redDirt'],
    road: 'mud',
    lake: { terrain: 'lava' },
    trees: [...DEAD_TREES],
    bushes: names('deadBush', 'deadBushSmall'),
    rocks: names('darkBoulder', 'darkBoulderB', 'darkSpire'),
  },
};

/** A rectangle turned half way round the field. */
const turnRect = (r: Rect): Rect => ({ col: COLS - (r.col + r.w), row: ROWS - (r.row + r.h), w: r.w, h: r.h });
/** A cell turned half way round the field. */
const turnCell = (c: number, r: number): [number, number] => [COLS - 1 - c, ROWS - 1 - r];

/** An oval as rows of cells that read the same turned upside down (so its turned twin is the same shape). */
function ovalRows(cx: number, cy: number, hw: number, hh: number): Rect[] {
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

export function fieldZone(def: RoadDef): Zone {
  const theme = THEMES[def.id];
  if (!theme) throw new Error(`no theme for the map "${def.id}"`);
  const z = new Zone(COLS, ROWS);
  z.fill(theme.ground);
  const whole: Rect = { col: 0, row: 0, w: COLS, h: ROWS };
  if (theme.cover) z.paint(theme.cover, whole);
  const rand = lcg(def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));

  const pts: readonly Pt[] = def.points;
  const castles = [pts[0], pts[pts.length - 1]];
  // Points along the road every half cell (a road may be a few long straight runs, so its corners alone are not enough).
  const board = BOARDS[def.id];
  const along = Array.from({ length: Math.ceil(board.length * 2) + 1 }, (_, i) => board.pointAt(i / 2));
  const roadDist = (x: number, y: number) => {
    let best = Infinity;
    for (const p of along) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y));
    return best;
  };
  const castleDist = (x: number, y: number) => Math.min(...castles.map((c) => Math.hypot(c[0] - x, c[1] - y)));

  // Patches of other earth (ground only: they never block), then the road over them.
  for (const terrain of theme.patches ?? [])
    for (let placed = 0, tries = 0; placed < 4 && tries < 400; tries++) {
      const [cx, cy] = [3 + Math.floor(rand() * (COLS - 6)), 3 + Math.floor(rand() * (ROWS / 2 - 4))];
      if (roadDist(cx, cy) < 5) continue;
      for (const [x, y] of [[cx, cy], turnCell(cx, cy)] as const)
        z.paint(terrain, ovalRows(x, y, 3 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2)));
      placed++;
    }
  const road = [...BOARDS[def.id].roadCells].map((i): Rect => ({
    col: i % COLS,
    row: Math.floor(i / COLS),
    w: 1,
    h: 1,
  }));
  z.paint(theme.road, road);
  z.spawn(Math.floor(castles[0][0]), Math.floor(castles[0][1])); // a map needs one; it is not drawn

  // Woods in the side margins (the margin is everything past the band of open ground by the road); the road keeps clear of it.
  const margin: Rect = { col: -2, row: -2, w: 4, h: ROWS + 4 };
  z.forest(margin, { seed: 1, trees: theme.trees });
  z.forest(turnRect(margin), { seed: 11, trees: theme.trees });

  // Lakes in the pockets between runs, as far from the road as the field allows: their middle rows only, leaving clear ground each side.
  const lakes: [number, number][] = [];
  const spots: [number, number, number][] = [];
  for (let col = 6; col < COLS - 6; col++)
    for (let row = 5; row < ROWS / 2 - 1; row++) {
      // Every cell of the lake and its shore must be well clear of the road (two clear cells for towers) and of both castles.
      const cells: (readonly [number, number])[] = [];
      for (let c = col - 5; c <= col + 4; c++) for (let r = row - 2; r <= row + 2; r++) cells.push([c, r]);
      const room = Math.min(
        ...cells.map(([c, r]) => roadDist(c + 0.5, r + 0.5) - def.halfWidth - 2),
        castleDist(col + 0.5, row + 0.5) - 8,
      );
      if (room >= 0 && col >= 7 && col <= COLS - 8) spots.push([col, row, room]);
    }
  spots.sort((a, b) => b[2] - a[2]);
  const apart = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) >= 10;
  for (const [col, row] of spots) {
    if (lakes.length >= 3) break;
    const [tc, tr] = turnCell(col, row);
    const mine: [number, number] = [col, row];
    if (lakes.every((l) => apart(l, mine) && apart(turnCell(...l), mine)) && Math.hypot(tc - col, tr - row) >= 10)
      lakes.push(mine);
  }
  for (const [cx, cy] of lakes)
    for (const [x, y] of [[cx, cy], turnCell(cx, cy)] as const) {
      const rows = ovalRows(x, y, 4, 1);
      if (theme.lake.shore)
        z.paint(
          theme.lake.shore,
          rows.map((r) => ({ col: r.col - 1, row: r.row - 1, w: r.w + 2, h: r.h + 2 })),
        );
      z.paint(theme.lake.terrain, rows);
      for (const r of rows) z.block(r, 'lake');
    }

  // Trees in clumps well off the road, bushes and rocks nearer it, all placed in the top half and again turned.
  const taken = new Set<number>();
  const scatter = (kit: PrefabName[], count: number, minRoad: number, minCastle: number) => {
    for (let placed = 0, tries = 0; placed < count && tries < 12000; tries++) {
      const col = 2 + Math.floor(rand() * (COLS - 4));
      const row = 2 + Math.floor(rand() * (ROWS / 2 - 3));
      const [tc, tr] = turnCell(col, row);
      const ok = (c: number, r: number) =>
        roadDist(c + 0.5, r + 0.5) >= minRoad &&
        castleDist(c + 0.5, r + 0.5) >= minCastle &&
        lakes.every(([lx, ly]) => Math.abs(c - lx) > 6 || Math.abs(r - ly) > 3);
      if (!ok(col, row) || !ok(tc, tr) || taken.has(row * COLS + col) || taken.has(tr * COLS + tc)) continue;
      taken.add(row * COLS + col);
      taken.add(tr * COLS + tc);
      const name = kit[Math.floor(rand() * kit.length)];
      z.prop(name, col, row);
      z.prop(name, tc, tr);
      placed++;
    }
  };
  scatter(theme.trees, 14, 3.2, 11);
  scatter(theme.bushes, 18, 2.6, 9);
  scatter(theme.rocks, 14, 2.6, 9);
  return z;
}

export const PUBLIC_MAPS = path.join(ROOT, 'towercraft/public/art/maps');

if (process.argv[1] === import.meta.filename) {
  const only = process.argv[2];
  const scenery: Record<string, number[]> = {};
  fs.mkdirSync(PUBLIC_MAPS, { recursive: true });
  for (const def of ROADS) {
    // What blocks building: everything the map blocks, and its turned twin (the woods are random, so the two halves can differ by a
    // cell or two at the margins; blocking both keeps the field fair). A map not asked for keeps its list.
    if (only && only !== def.id) {
      scenery[def.id] = [...(BOARDS[def.id].sceneryCells as Set<number>)];
      continue;
    }
    const data = fieldZone(def).toMapData();
    writePng(path.join(PUBLIC_MAPS, `${def.id}.png`), renderMap(data));
    const blocked = new Set<number>();
    for (const i of data.collision) {
      blocked.add(i);
      const [c, r] = turnCell(i % COLS, Math.floor(i / COLS));
      blocked.add(r * COLS + c);
    }
    // A bush at the road's edge may spill onto it in the picture: the road wins (the sim asks about the road first anyway).
    scenery[def.id] = [...blocked].filter((i) => !BOARDS[def.id].roadCells.has(i)).sort((a, b) => a - b);
    console.log(`${def.id}: ${blocked.size} blocked cells of ${COLS * ROWS}`);
  }
  const lines = ROADS.map((d) => `  ${d.id}: [${scenery[d.id].join(', ')}],`).join('\n');
  fs.writeFileSync(
    path.join(ROOT, 'towercraft/src/sim/scenery.ts'),
    `// Generated by \`npm run towercraft:board\` (tools/towercraftBoard.ts): do not edit by hand.\n// The cells (row * COLS + col) each map's scenery covers: nothing is built there.\nexport const SCENERY: Readonly<Record<string, readonly number[]>> = {\n${lines}\n};\n`,
  );
}
