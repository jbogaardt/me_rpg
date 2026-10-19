// Draws Towercraft's fields (towercraft/public/art/maps/<id>.png) and lists what blocks building on each
// (towercraft/src/sim/scenery.ts) with Me RPG's own map pipeline: a ground, a road painted on cell corners (so every bend gets the
// real LPC autotile blend, tools/map/terrain.ts), and Me RPG's woods, lakes, rocks and bushes for scenery, in the look of one of its
// biomes (greenwood, frostlands, desert, emberwaste, witchmire). The roads are towercraft/src/sim/road.ts. The classic road turns half
// way round onto itself, scenery included (everything placed once and again turned, lakes in shapes that are the same upside down);
// the other roads wander freely and so does their scenery. Woods keep to the margins and the clumps away from the road, and a band of open ground is
// left along both sides of the road for towers (bushes and rocks may still stand in it, and then block their cell).
// Run `npm run towercraft:board` after changing a road or the scenery (`-- <id>` for one map).

import fs from 'node:fs';
import path from 'node:path';
import { DEAD_TREES, DRY_TREES, FROST_TREES, SWAMP_TREES, TREES, type PrefabName } from './map/catalog';
import { ROOT, renderMap, writePng, type Image } from './map/image';
import { Zone, type Rect } from './map/zone';
import type { GroundName } from './map/catalog';
import type { TerrainName } from './map/terrain';
import { BOARDS } from '../towercraft/src/sim/board';
import { EDGE, GROW, ROADS, type Pt, type RoadDef } from '../towercraft/src/sim/road';

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
const turnRect = (r: Rect, cols: number, rows: number): Rect => ({
  col: cols - (r.col + r.w),
  row: rows - (r.row + r.h),
  w: r.w,
  h: r.h,
});
/** A cell turned half way round the field. */
const turnCell = (c: number, r: number, cols: number, rows: number): [number, number] => [cols - 1 - c, rows - 1 - r];

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
  const [COLS, ROWS] = [def.cols, def.rows];
  const z = new Zone(COLS, ROWS);
  z.fill(theme.ground);
  const whole: Rect = { col: 0, row: 0, w: COLS, h: ROWS };
  if (theme.cover) z.paint(theme.cover, whole);
  // The classic road is turned half way round onto itself, so its scenery is too; every other map is free of that.
  const twin = def.id === 'greenwood';
  const sites = (c: number, r: number): [number, number][] => (twin ? [[c, r], turnCell(c, r, COLS, ROWS)] : [[c, r]]);
  const reach = twin ? ROWS / 2 : ROWS - 2; // rows (from the top) things are placed in; a twin is placed once and turned
  const rand = lcg(def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));

  const pts: readonly Pt[] = def.points;
  const castles = [pts[0], pts[pts.length - 1]];
  // Points along the road every half cell (a road may be a few long straight runs, so its corners alone are not enough).
  const board = BOARDS[def.id];
  const along = Array.from({ length: Math.ceil(board.roadLength * 2) + 1 }, (_, i) => board.pointAt(i / 2));
  const roadDist = (x: number, y: number) => {
    let best = Infinity;
    for (const p of along) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y));
    return best;
  };
  const castleDist = (x: number, y: number) => Math.min(...castles.map((c) => Math.hypot(c[0] - x, c[1] - y)));

  // Patches of other earth (ground only: they never block), then the road over them.
  for (const terrain of theme.patches ?? [])
    for (let placed = 0, tries = 0; placed < Math.round((twin ? 4 : 7) * GROW * GROW) && tries < 400; tries++) {
      const [cx, cy] = [3 + Math.floor(rand() * (COLS - 6)), 3 + Math.floor(rand() * (reach - 4))];
      if (roadDist(cx, cy) < 5) continue;
      for (const [x, y] of sites(cx, cy))
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
  z.forest(turnRect(margin, COLS, ROWS), { seed: 11, trees: theme.trees });

  // Scenery blocks the cells a building could stand on, so there is little of it and it keeps to a few big, different things: a
  // handful of lakes (each its own size and outline), a couple of tree patches, and a few lone trees, bushes and rocks. Everything keeps
  // well off the road and further off the castles; the clearings at the edges stay open.
  const taken = new Set<number>(); // cells with something on them
  const lakeCells = new Set<number>();
  const near = (c: number, r: number, set: Set<number>, gap: number) => {
    for (let dc = -gap; dc <= gap; dc++)
      for (let dr = -gap; dr <= gap; dr++) if (set.has((r + dr) * COLS + c + dc)) return true;
    return false;
  };
  const roomFor = (c: number, r: number, fromRoad: number, fromCastle: number) =>
    c >= 1 &&
    c < COLS - 1 &&
    r >= 1 &&
    r < ROWS - 1 &&
    roadDist(c + 0.5, r + 0.5) >= fromRoad &&
    castleDist(c + 0.5, r + 0.5) >= fromCastle;

  /** An irregular lake: rows of cells round (cx, cy), each row's width and middle jittered, so no two lakes are alike. */
  const lakeRows = (cx: number, cy: number, hw: number, hh: number): Rect[] => {
    const rows: Rect[] = [];
    let drift = 0;
    for (let dy = -hh; dy <= hh; dy++) {
      const base = hw * Math.sqrt(1 - (dy / (hh + 0.7)) ** 2);
      const half = Math.max(1, Math.round(base * (0.7 + 0.6 * rand())));
      drift = Math.max(-2, Math.min(2, drift + Math.round(rand() * 2 - 1)));
      rows.push({ col: cx + drift - half, row: cy + dy, w: half * 2 + Math.round(rand()), h: 1 });
    }
    return rows;
  };
  const lakes: Rect[][] = [];
  for (let tries = 0; lakes.length < (twin ? 2 : 3) && tries < 600; tries++) {
    const hw = 3 + Math.floor(rand() * 6);
    const hh = 1 + Math.floor(rand() * 3);
    const cx = EDGE + 12 + Math.floor(rand() * (COLS - 2 * EDGE - 24));
    const cy = 8 + Math.floor(rand() * (reach - 16));
    const rows = lakeRows(cx, cy, hw, hh);
    const cells = rows.flatMap((r) => Array.from({ length: r.w }, (_, k) => [r.col + k, r.row] as const));
    // Clear ground all round it (the shore, then room to build) from the road and the castles, and apart from the other lakes.
    if (!cells.every(([c, r]) => roomFor(c, r, def.halfWidth + 3.5, 24) && !near(c, r, lakeCells, 7))) continue;
    lakes.push(rows);
    for (const [c, r] of cells) lakeCells.add(r * COLS + c);
  }
  for (const rows of lakes)
    for (const at of twin ? [rows, rows.map((r) => turnRect(r, COLS, ROWS))] : [rows]) {
      if (theme.lake.shore)
        z.paint(
          theme.lake.shore,
          at.map((r) => ({ col: r.col - 1, row: r.row - 1, w: r.w + 2, h: r.h + 2 })),
        );
      z.paint(theme.lake.terrain, at);
      for (const r of at) z.block(r, 'lake');
      if (twin) for (const r of at) for (let k = 0; k < r.w; k++) lakeCells.add(r.row * COLS + r.col + k);
    }

  /** Put a prop at (col, row) and, on a turned map, at its turned twin; false when there is no room for it. */
  const plant = (kit: PrefabName[], col: number, row: number, fromRoad: number, fromCastle: number, gap: number) => {
    const at = sites(col, row);
    if (
      !at.every(([c, r]) => roomFor(c, r, fromRoad, fromCastle) && !near(c, r, lakeCells, 3) && !near(c, r, taken, gap))
    )
      return false;
    const name = kit[Math.floor(rand() * kit.length)];
    for (const [c, r] of at) {
      taken.add(r * COLS + c);
      z.prop(name, c, r);
    }
    return true;
  };
  // Patches of trees: a few cells across, close-set inside, with open ground between them and everything else.
  for (let placed = 0, tries = 0; placed < (twin ? 2 : 4) && tries < 300; tries++) {
    const radius = 3 + rand() * 3.5;
    const cx = 6 + Math.floor(rand() * (COLS - 12));
    const cy = 6 + Math.floor(rand() * (reach - 8));
    if (!roomFor(cx, cy, radius + 5, radius + 22) || near(cx, cy, lakeCells, Math.ceil(radius) + 4)) continue;
    let planted = 0;
    for (let k = 0; k < radius * radius * 1.4; k++) {
      const [a, d] = [rand() * Math.PI * 2, radius * Math.sqrt(rand())];
      if (plant(theme.trees, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.8), 4.5, 20, 1))
        planted++;
    }
    if (planted >= 4) placed++;
  }
  const scatter = (kit: PrefabName[], count: number, fromRoad: number, fromCastle: number) => {
    for (let placed = 0, tries = 0; placed < count && tries < 4000; tries++)
      if (
        plant(kit, 2 + Math.floor(rand() * (COLS - 4)), 2 + Math.floor(rand() * (reach - 3)), fromRoad, fromCastle, 3)
      )
        placed++;
  };
  const more = twin ? 1 : 2;
  scatter(theme.trees, 3 * more, 5, 24);
  scatter(theme.bushes, 4 * more, 4, 20);
  scatter(theme.rocks, 3 * more, 4, 20);
  return z;
}

export const PUBLIC_MAPS = path.join(ROOT, 'towercraft/public/art/maps');

/** A small copy of a picture (each pixel the average of the block it covers): the title screen's map thumbnails, so it need not fetch the full fields. */
function thumbOf(img: Image, w: number): Image {
  const h = Math.round((img.height * w) / img.width);
  const out: Image = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [x0, x1] = [
        Math.floor((x * img.width) / w),
        Math.max(Math.floor(((x + 1) * img.width) / w), Math.floor((x * img.width) / w) + 1),
      ];
      const [y0, y1] = [
        Math.floor((y * img.height) / h),
        Math.max(Math.floor(((y + 1) * img.height) / h), Math.floor((y * img.height) / h) + 1),
      ];
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++) for (let c = 0; c < 4; c++) sum[c] += img.data[(sy * img.width + sx) * 4 + c];
      const n = (x1 - x0) * (y1 - y0);
      for (let c = 0; c < 4; c++) out.data[(y * w + x) * 4 + c] = Math.round(sum[c] / n);
    }
  return out;
}

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
    const picture = renderMap(data);
    writePng(path.join(PUBLIC_MAPS, `${def.id}.png`), picture);
    fs.mkdirSync(path.join(PUBLIC_MAPS, 'thumbs'), { recursive: true });
    writePng(path.join(PUBLIC_MAPS, 'thumbs', `${def.id}.png`), thumbOf(picture, 120));
    const blocked = new Set<number>();
    for (const i of data.collision) {
      blocked.add(i);
      if (def.id !== 'greenwood') continue;
      const [c, r] = turnCell(i % def.cols, Math.floor(i / def.cols), def.cols, def.rows);
      blocked.add(r * def.cols + c);
    }
    // A bush at the road's edge may spill onto it in the picture: the road wins (the sim asks about the road first anyway).
    scenery[def.id] = [...blocked].filter((i) => !BOARDS[def.id].roadCells.has(i)).sort((a, b) => a - b);
    console.log(`${def.id}: ${blocked.size} blocked cells of ${def.cols * def.rows}`);
  }
  const lines = ROADS.map((d) => `  ${d.id}: [${scenery[d.id].join(', ')}],`).join('\n');
  fs.writeFileSync(
    path.join(ROOT, 'towercraft/src/sim/scenery.ts'),
    `// Generated by \`npm run towercraft:board\` (tools/towercraftBoard.ts): do not edit by hand.\n// The cells (row * COLS + col) each map's scenery covers: nothing is built there.\nexport const SCENERY: Readonly<Record<string, readonly number[]>> = {\n${lines}\n};\n`,
  );
}
