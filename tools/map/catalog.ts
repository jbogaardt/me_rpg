// Named map assets for zone specs. Every coordinate here was checked against the sheets in
// public/tilesets/ (see the map pitfalls in tools/map/CLAUDE.md); add new entries only after looking at the art.

import { LANDMARK_ATLAS } from '../../src/systems/landmarkAtlas';
import { RUINS_ATLAS } from './ruinsAtlas';
import { TREE_ATLAS } from './treeAtlas';

export const GROUND_SHEET = 'ground_tiles.png';
export const OBJECT_SHEET = 'object-layer.png';
// Derived by tools/map/recolor.ts (`npm run tilesets`): same layout as the originals, recoloured.
export const PLUS_SHEET = 'ground_plus.png'; // ground_tiles + a plain water tile matching the lake ring
export const FROST_SHEET = 'frost_ground.png'; // sand -> snow, water -> ice
export const FROST_OBJECTS = 'frost_objects.png'; // blue-grey rocks (trees and bushes: trees_<kind>.png, see trees.ts)
export const RUINS_SHEET = 'ruins.png'; // ruined temples, walls, pillars, statues: tools/map/ruins.ts (LPC Jungle Ruins)
export const TOWN_SHEET = 'town.png'; // the shop buildings, composed from the LPC City outside pack by tools/map/town.ts
export const INTERIOR_SHEET = 'interior.png'; // shop interiors: floor, wall, counter, shelves, signs (tools/map/interior.ts, LPC art)
export const TERRAIN_SHEET = 'lpc_terrain.png'; // the LPC terrain atlas (art/lpc_terrain/): autotiled terrains, see terrain.ts
export const CLIFF_SHEET = 'Cliff_tileset.png'; // Avalon cliffs: a plateau blob, stairs, notches
export const FROST_CLIFFS = 'frost_cliffs.png'; // cliffs with snow tops and blue-grey rock (recolor.ts)
export const DRY_CLIFFS = 'dry_cliffs.png'; // cliffs with sandy tops and ochre rock (recolor.ts)
export const ROCK_CAVE_SHEET = 'rock_cave.png'; // the rock cave's ground tiles, cut from the mountains by tools/map/rockCave.ts
export const ROCK_SHEET = 'lpc_mountains.png'; // the LPC base assets' mountains: the rock plateau (kind 'rock', see zone.plateau)

// MrBeast's cave, sewer and desert tilesets (art/oga_dungeon/, CC-BY 3.0), doubled to the 32px cell by dungeonSheets.ts.
export const CAVE_SHEET = 'dungeon_cave.png';
export const SEWER_SHEET = 'sewer_lpc.png'; // the sewer's ground tiles and props, cut from the LPC base assets by tools/map/sewerLpc.ts
export const ENTRANCE_SHEET = 'entrances.png'; // the overworld ends of the caves and sewers, composed by tools/map/entrances.ts
export const DUNES_SHEET = 'dunes.png'; // the desert sheet's cliffs, sand keyed out

export { SHADOW_RGB, SHADOW_FROST, SHADOWS } from './shadows';

/** A repeating ground fill: `tiles[row % rows][col % cols]` gives the source [x, y] of each map cell. */
export interface GroundFill {
  sheet: string;
  tiles: [number, number][][];
}

/** Source tile indices (tx, ty) of a 16px-grid sheet, as pixel positions on its doubled copy (see dungeonSheets.ts). */
const tiles = (sheet: string, rows: [number, number][][]): GroundFill => ({
  sheet,
  tiles: rows.map((row) => row.map(([tx, ty]) => [tx * 32, ty * 32] as [number, number])),
});

/**
 * The grounds of the caves and sewers (maps are painted by tools/map/delve.ts): a floor, a roof (the dark top of the rock),
 * and the wall that shows where a roof meets a floor to its south: `faceL` (the row against the floor), `faceU` above it
 * and a rim or two of roof (`edge`, `cap`) before the plain roof. Alternating tiles are two columns wide so they repeat.
 */
function dungeonGrounds() {
  const C = CAVE_SHEET;
  const S = SEWER_SHEET;
  const R = ROCK_CAVE_SHEET;
  return {
    rockFloor: tiles(R, [
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [2, 0],
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
        [0, 0],
      ],
    ]),
    rockRoof: tiles(R, [[[3, 0]]]),
    rockEdge: tiles(R, [[[4, 0]]]),
    rockFaceU: tiles(R, [[[5, 0]]]),
    rockFaceL: tiles(R, [[[6, 0]]]),
    rockFloorShade: tiles(R, [[[7, 0]]]),
    rockFaceM: tiles(R, [[[8, 0]]]),
    rockRoofB: tiles(R, [[[9, 0]]]),
    caveFloor: tiles(C, [
      [
        [0, 10],
        [1, 10],
        [0, 9],
      ],
      [
        [1, 9],
        [0, 10],
        [1, 10],
      ],
      [
        [0, 9],
        [1, 9],
        [0, 10],
      ],
    ]),
    caveRubble: tiles(C, [
      [
        [0, 7],
        [1, 7],
      ],
      [
        [0, 8],
        [1, 8],
      ],
    ]),
    caveRoof: tiles(C, [[[7, 0]]]),
    caveEdge: tiles(C, [
      [
        [13, 4],
        [14, 4],
      ],
    ]),
    caveFaceU: tiles(C, [
      [
        [13, 5],
        [14, 5],
      ],
    ]),
    caveFaceL: tiles(C, [
      [
        [13, 6],
        [14, 6],
      ],
    ]),
    caveFaceLWater: tiles(C, [
      [
        [13, 9],
        [14, 9],
      ],
    ]),
    caveWater: tiles(C, [
      [
        [11, 13],
        [6, 13],
        [11, 13],
      ],
      [
        [11, 13],
        [11, 13],
        [8, 13],
      ],
    ]),
    caveLava: tiles(C, [
      [
        [0, 19],
        [1, 19],
      ],
      [
        [1, 20],
        [0, 20],
      ],
    ]),
    sewerFloor: tiles(S, [
      [
        [0, 0],
        [1, 0],
        [0, 0],
        [0, 0],
        [1, 0],
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [0, 0],
        [0, 0],
        [1, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [0, 0],
        [1, 0],
        [0, 0],
        [0, 0],
        [2, 0],
        [0, 0],
      ],
    ]),
    sewerRoof: tiles(S, [[[5, 0]]]),
    sewerCapTop: tiles(S, [[[6, 0]]]),
    sewerCap: tiles(S, [[[7, 0]]]),
    sewerFaceU: tiles(S, [[[8, 0]]]),
    sewerFaceL: tiles(S, [[[9, 0]]]),
    sewerWater: tiles(S, [
      [
        [3, 0],
        [4, 0],
      ],
      [
        [4, 0],
        [3, 0],
      ],
    ]),
  } satisfies Record<string, GroundFill>;
}

export const GROUND = {
  grass: {
    sheet: GROUND_SHEET,
    tiles: [
      [
        [32, 64],
        [64, 64],
      ],
      [
        [32, 96],
        [64, 96],
      ],
    ],
  },
  sand: {
    sheet: GROUND_SHEET,
    tiles: [
      [
        [32, 160],
        [64, 160],
        [96, 160],
      ],
      [
        [32, 192],
        [64, 192],
        [96, 192],
      ],
      [
        [32, 224],
        [64, 224],
        [96, 224],
      ],
    ],
  },
  snow: {
    sheet: FROST_SHEET,
    tiles: [
      [
        [32, 160],
        [64, 160],
        [96, 160],
      ],
      [
        [32, 192],
        [64, 192],
        [96, 192],
      ],
      [
        [32, 224],
        [64, 224],
        [96, 224],
      ],
    ],
  },
  water: { sheet: PLUS_SHEET, tiles: [[[480, 320]]] },
  // From the LPC terrain atlas. `sea` is the open water the `coast`/`snowCoast` terrains paint their land over.
  sea: { sheet: TERRAIN_SHEET, tiles: [[[672, 352]]] },
  cobble: {
    sheet: TERRAIN_SHEET,
    tiles: [
      [
        [224, 384],
        [192, 384],
      ],
    ],
  },
  flagstone: { sheet: TERRAIN_SHEET, tiles: [[[224, 416]]] },
  crackedStone: {
    sheet: TERRAIN_SHEET,
    tiles: [
      [
        [96, 544],
        [128, 544],
        [160, 544],
      ],
    ],
  },
  // Painted ice (cracks and glints), six variants made by tools/map/recolor.ts in the sheet's empty corner.
  ice: {
    sheet: FROST_SHEET,
    tiles: [
      [
        [608, 0],
        [640, 0],
      ],
      [
        [640, 32],
        [608, 32],
      ],
      [
        [608, 64],
        [640, 64],
      ],
    ],
  },
  // Inside the shops (interior.png). `wall` alternates the crown row and the baseboard row.
  planks: {
    sheet: INTERIOR_SHEET,
    tiles: [
      [
        [0, 0],
        [32, 0],
      ],
      [
        [32, 0],
        [0, 0],
      ],
    ],
  },
  wall: { sheet: INTERIOR_SHEET, tiles: [[[64, 0]], [[96, 0]]] },
  mat: { sheet: INTERIOR_SHEET, tiles: [[[128, 0]]] },
  stone: {
    sheet: GROUND_SHEET,
    tiles: [
      [
        [32, 288],
        [64, 288],
      ],
      [
        [32, 320],
        [64, 320],
      ],
    ],
  },
  ...dungeonGrounds(),
} satisfies Record<string, GroundFill>;

export type GroundName = keyof typeof GROUND;
/** The cave and sewer grounds (see `dungeonGrounds`): kept apart from the open-air ones in `SURFACES` (zone.ts). */
export const DUNGEON_GROUNDS: string[] = Object.keys(dungeonGrounds());

/** Edge and outer-corner tiles that blend a patch into grass (the patch's outermost cells become these). */
export interface Ring {
  sheet: string;
  nw: [number, number];
  n: [number, number];
  ne: [number, number];
  w: [number, number];
  e: [number, number];
  sw: [number, number];
  s: [number, number];
  se: [number, number];
}

export const RINGS: Partial<Record<GroundName, Ring>> = {
  sand: {
    sheet: GROUND_SHEET,
    nw: [192, 128],
    n: [224, 128],
    ne: [256, 128],
    w: [192, 160],
    e: [256, 160],
    sw: [192, 192],
    s: [224, 192],
    se: [256, 192],
  },
  // Snow: the sand ring recoloured, so it blends into grass the same way.
  snow: {
    sheet: FROST_SHEET,
    nw: [192, 128],
    n: [224, 128],
    ne: [256, 128],
    w: [192, 160],
    e: [256, 160],
    sw: [192, 192],
    s: [224, 192],
    se: [256, 192],
  },
  // Lakes and ponds: the shore blends into *sand* (water) or *snow* (ice), not grass, so wrap them in a
  // sand/snow patch first.
  water: {
    sheet: PLUS_SHEET,
    nw: [384, 256],
    n: [416, 256],
    ne: [448, 256],
    w: [384, 288],
    e: [448, 288],
    sw: [384, 320],
    s: [416, 320],
    se: [448, 320],
  },
  ice: {
    sheet: FROST_SHEET,
    nw: [384, 256],
    n: [416, 256],
    ne: [448, 256],
    w: [384, 288],
    e: [448, 288],
    sw: [384, 320],
    s: [416, 320],
    se: [448, 320],
  },
  // Cobblestone plaza with a grassy fringe.
  stone: {
    sheet: GROUND_SHEET,
    nw: [192, 256],
    n: [224, 256],
    ne: [256, 256],
    w: [192, 288],
    e: [256, 288],
    sw: [192, 320],
    s: [224, 320],
    se: [256, 320],
  },
};

/**
 * Pre-painted ground decorations (dunes, a giant skull...) copied cell by cell with `zone.stamp`.
 * Cells that aren't fully opaque in the source are skipped, so the shapes stay irregular.
 */
export interface Stamp {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  about: string;
}
export const STAMPS = {
  skull: {
    sheet: GROUND_SHEET,
    x: 256,
    y: 512,
    w: 128,
    h: 160,
    about: 'Giant buried skull on sand (4x5 cells, irregular outline).',
  },
  dune: { sheet: GROUND_SHEET, x: 32, y: 512, w: 96, h: 160, about: 'Shallow sand hollow (3x4 cells).' },
  crater: { sheet: GROUND_SHEET, x: 416, y: 512, w: 96, h: 96, about: 'Wide sand crater (3x3 cells).' },
  pit: { sheet: GROUND_SHEET, x: 416, y: 640, w: 32, h: 32, about: 'Small sand pit (1 cell).' },
} satisfies Record<string, Stamp>;
export type StampName = keyof typeof STAMPS;

/** One source rect of a prefab, drawn at (dx, dy) inside the prefab's w x h box. */
export interface PrefabPart {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

export interface Prefab {
  sheet: string;
  w: number;
  h: number;
  /** Canopies are split into several rects so no neighbouring sprite bleeds in; all parts end on the box bottom. */
  parts: PrefabPart[];
  /**
   * Automatic collision for `zone.prop`: cells covered at least `min` (0..1) by the opaque art in the
   * bottom `band` pixels are blocked. The art above the band is walk-behind. Null = decoration only.
   */
  solid: { band: number; min: number } | null;
  /** Hung on a building's wall: drawn over the wall even though its foot is above the wall's (z lift, see zone.ts). */
  wall?: boolean;
  /** What the object is, copied to MapObject.tag so game systems (leaf fall, rustling...) can find it. */
  tag?: string;
  /** Picked up and carried in play (systems/barrels.ts): it blocks as a body there, so the map blocks no cell for it. */
  movable?: boolean;
  about: string;
}

const part = (x: number, y: number, w: number, h: number, dx = 0, dy = 0): PrefabPart => ({ x, y, w, h, dx, dy });

type Biome = 'green' | 'frost' | 'dry' | 'jungle' | 'dead' | 'swamp' | 'autumn';
/** A tree of the LPC trees pack (see trees.ts): one part, trunk and lower canopy solid, the crown walk-behind. */
const lpcTree = (biome: Biome, i: number, about: string): Prefab => {
  const t = TREE_ATLAS[biome]?.trees[i];
  if (!t) throw new Error(`no ${biome} tree ${i} in the atlas (run npm run tilesets)`);
  return {
    sheet: `trees_${biome}.png`,
    w: t.w,
    h: t.h,
    parts: [part(t.x, t.y, t.w, t.h)],
    solid: { band: t.band, min: 0.5 },
    tag: 'tree',
    about,
  };
};
const lpcBush = (biome: Biome, i: number, about: string): Prefab => {
  const t = TREE_ATLAS[biome]?.bushes[i];
  if (!t) throw new Error(`no ${biome} bush ${i} in the atlas (run npm run tilesets)`);
  return {
    sheet: `trees_${biome}.png`,
    w: t.w,
    h: t.h,
    parts: [part(t.x, t.y, t.w, t.h)],
    solid: { band: t.band, min: 0.5 },
    tag: 'bush',
    about,
  };
};
const rock = (sheet: string, x: number, y: number, w: number, h: number, about: string): Prefab => ({
  sheet,
  w,
  h,
  parts: [part(x, y, w, h)],
  solid: { band: h, min: 0.3 },
  tag: 'rock',
  about,
});
const ROCKS = (sheet: string) => ({
  rock: rock(sheet, 290, 32, 30, 32, 'Boulder, one cell.'),
  rockSmall: rock(sheet, 290, 65, 28, 30, 'Smaller rock, one cell.'),
  rockB: rock(sheet, 320, 64, 32, 32, 'Tall craggy rock, one cell.'),
  rockC: rock(sheet, 352, 64, 32, 32, 'Wide craggy rock, one cell.'),
});
const rocks = ROCKS(OBJECT_SHEET);
const lily = (x: number, y: number, w: number, h: number, about: string): Prefab => ({
  sheet: TERRAIN_SHEET,
  w,
  h,
  parts: [part(x, y, w, h)],
  solid: null,
  tag: 'flower',
  about,
});
const frostRocks = ROCKS(FROST_OBJECTS);

/** Where each shop building sits on town.png (drawn by tools/map/town.ts on the 32px grid: halls 5x7 cells, houses 3x9). */
export const BUILDINGS = {
  smithy: { x: 0, y: 0, w: 160, h: 224 },
  apothecary: { x: 160, y: 0, w: 160, h: 224 },
  armory: { x: 320, y: 0, w: 96, h: 288 },
  ranger: { x: 416, y: 0, w: 96, h: 288 },
  wizard: { x: 512, y: 0, w: 160, h: 224 },
  tavern: { x: 672, y: 0, w: 160, h: 224 },
};
/** Where each piece of the shop interior sits on interior.png (composed by tools/map/interior.ts). */
export const INTERIOR = {
  planksA: { x: 0, y: 0, w: 32, h: 32 },
  planksB: { x: 32, y: 0, w: 32, h: 32 },
  wallTop: { x: 64, y: 0, w: 32, h: 32 },
  wallBase: { x: 96, y: 0, w: 32, h: 32 },
  mat: { x: 128, y: 0, w: 32, h: 32 },
  counter: { x: 0, y: 32, w: 128, h: 48 },
  shelfSmithy: { x: 128, y: 32, w: 96, h: 64 },
  shelfArmory: { x: 224, y: 32, w: 96, h: 64 },
  shelfRanger: { x: 320, y: 32, w: 96, h: 64 },
  shelfApothecary: { x: 416, y: 32, w: 96, h: 64 },
  signSmithy: { x: 0, y: 96, w: 128, h: 64 },
  signArmory: { x: 128, y: 96, w: 128, h: 64 },
  signRanger: { x: 256, y: 96, w: 128, h: 64 },
  signApothecary: { x: 384, y: 96, w: 128, h: 64 },
  shelfWizard: { x: 512, y: 32, w: 96, h: 64 },
  signWizard: { x: 512, y: 96, w: 128, h: 64 },
  shelfTavern: { x: 608, y: 32, w: 96, h: 64 },
  signTavern: { x: 640, y: 96, w: 128, h: 64 },
  lectern: { x: 0, y: 160, w: 32, h: 48 },
  window: { x: 64, y: 160, w: 32, h: 48 },
};
const furniture = (name: keyof typeof INTERIOR, band: number, about: string): Prefab => {
  const { x, y, w, h } = INTERIOR[name];
  return {
    sheet: INTERIOR_SHEET,
    w,
    h,
    parts: [part(x, y, w, h)],
    solid: band > 0 ? { band, min: 0.3 } : null,
    tag: 'furniture',
    about,
  };
};

const building = (name: keyof typeof BUILDINGS, about: string): Prefab => {
  const { x, y, w, h } = BUILDINGS[name];
  // Solid from the ground up: a building is a wall you walk around, not behind.
  return { sheet: TOWN_SHEET, w, h, parts: [part(x, y, w, h)], solid: { band: h, min: 0.3 }, tag: 'building', about };
};

// --- OpenGameArt signs (art/oga_signs/CREDITS-signs.txt, CREDITS.md): signposts and hanging shop signs, cut on the 32 px grid ---
export const SIGNPOST_SHEET = 'signposts.png'; // "[LPC] Signposts, graves, line cloths and scare crow" (Reemax et al.), unmodified
export const HANGING_SHEET = 'hanging_signs.png'; // "[LPC] Hanging signs" (Reemax), unmodified
const signArt = (
  sheet: string,
  cx: number,
  cy: number,
  solid: Prefab['solid'],
  tag: string,
  about: string,
): Prefab => ({
  sheet,
  w: 32,
  h: 32,
  parts: [part(cx * 32, cy * 32, 32, 32)],
  solid,
  tag,
  about,
});
/** A hanging shop sign (1x1 cell, decoration): `wall` signs go on a building's face, one cell up, beside its door. */
const hanging = (cx: number, cy: number, what: string): Prefab => ({
  ...signArt(
    HANGING_SHEET,
    cx,
    cy,
    null,
    'hangingSign',
    `A hanging wooden sign showing ${what}, 1x1 cell, drawn over a wall.`,
  ),
  wall: true,
});
export const SIGN_PREFABS = {
  signpost: signArt(
    SIGNPOST_SHEET,
    0,
    0,
    { band: 12, min: 0.07 },
    'sign',
    'A signpost with an arrow board, 1x1 cell; its post blocks. Place it with `z.sign` (it names the ways), not `z.prop`.',
  ),
  signpostB: signArt(
    SIGNPOST_SHEET,
    1,
    0,
    { band: 12, min: 0.07 },
    'sign',
    'A signpost with a broad board (`z.sign` alternates it with signpost).',
  ),
  noticeBoard: signArt(
    SIGNPOST_SHEET,
    0,
    1,
    { band: 10, min: 0.07 },
    'noticeBoard',
    'A blank notice board on two legs, 1x1 cell; its legs block.',
  ),
  noticeBoardB: signArt(
    SIGNPOST_SHEET,
    1,
    1,
    { band: 10, min: 0.07 },
    'noticeBoard',
    'A notice board with pinned papers, 1x1 cell; its legs block.',
  ),
  hangSword: hanging(0, 0, 'a sword (weapons: smithy, ranger)'),
  hangPot: hanging(1, 0, 'a clay pot (general goods)'),
  hangHelm: hanging(2, 0, 'a helm (armour: the armory)'),
  hangFlask: hanging(3, 0, 'a flask (the apothecary)'),
  hangMug: hanging(0, 1, 'a tankard (a tavern)'),
  hangInn: hanging(1, 1, 'the word INN'),
  hangAmulet: hanging(2, 1, 'an amulet (the wizard, jeweller)'),
  hangTools: hanging(3, 1, 'a hammer and tongs (the smithy)'),
  hangBlank: hanging(0, 2, 'nothing yet'),
} satisfies Record<string, Prefab>;
// --- end OpenGameArt signs -------------------------------------------------------------------------------------------

// === LPC grave markers (graves.png, graves_large.png; art/lpc_grave_markers/) ====================================
// A headstone blocks only its foot (the face is walk-behind); tombs and boulders block their whole body.
export const GRAVE_SHEET = 'graves.png';
export const GRAVE_LARGE_SHEET = 'graves_large.png';
const grave = (sheet: string, x: number, y: number, w: number, h: number, band: number, about: string): Prefab => ({
  sheet,
  w,
  h,
  parts: [part(x, y, w, h)],
  solid: { band, min: 0.15 },
  tag: 'grave',
  about,
});
const GRAVE_PREFABS = {
  tombA: grave(GRAVE_SHEET, 2, 1, 60, 94, 66, 'Stone tomb with a cross and open earth (2 cells wide, 3 tall).'),
  tombB: grave(GRAVE_SHEET, 2, 97, 60, 94, 66, 'Stone tomb with a rounded cross and open earth (2 wide, 3 tall).'),
  slab: grave(GRAVE_LARGE_SHEET, 2, 14, 92, 81, 40, 'Big flat tomb slab (3 cells wide, 2.5 tall).'),
  graveRoundA: grave(GRAVE_SHEET, 64, 0, 31, 32, 12, 'Small round-topped headstone with a cross (1 cell).'),
  graveRoundB: grave(GRAVE_SHEET, 64, 32, 31, 32, 12, 'Small round-topped headstone with an ankh (1 cell).'),
  graveRip: grave(GRAVE_SHEET, 98, 2, 28, 27, 12, 'Dark headstone marked RIP (1 cell).'),
  graveDark: grave(GRAVE_SHEET, 98, 34, 28, 27, 12, 'Dark headstone with a pedestal sign (1 cell).'),
  graveCrossA: grave(GRAVE_SHEET, 132, 0, 24, 32, 12, 'Stone cross, 1 cell.'),
  graveCrossB: grave(GRAVE_SHEET, 132, 32, 24, 32, 12, 'Stone headstone with a mushroom top, 1 cell.'),
  graveTallA: grave(GRAVE_SHEET, 128, 64, 31, 64, 14, 'Tall headstone topped by a cross (1 cell, 2 tall).'),
  graveTallB: grave(GRAVE_SHEET, 128, 128, 31, 64, 14, 'Tall headstone on a plinth (1 cell, 2 tall).'),
  graveSmall: grave(GRAVE_SHEET, 128, 192, 32, 32, 12, 'Low headstone on a plinth (1 cell).'),
  graveWideA: grave(GRAVE_SHEET, 74, 84, 45, 44, 14, 'Broad ornate headstone with a cross (1.5 cells wide).'),
  graveWideB: grave(GRAVE_SHEET, 74, 148, 45, 44, 14, 'Broad ornate headstone with a cross (1.5 cells wide).'),
  crossWood: grave(GRAVE_SHEET, 166, 2, 18, 29, 10, 'Plain wooden cross (1 cell).'),
  crossMound: grave(GRAVE_SHEET, 165, 32, 22, 32, 10, 'Wooden cross on a mound of earth (1 cell).'),
  crossGold: grave(GRAVE_SHEET, 194, 6, 28, 45, 12, 'Tall gilded cross on a mound (1 cell, 1.5 tall).'),
  crossIronA: grave(GRAVE_SHEET, 165, 64, 22, 32, 10, 'Iron-grey cross on a mound (1 cell).'),
  crossIronB: grave(GRAVE_SHEET, 165, 96, 22, 32, 10, 'Iron-grey rope-bound cross on a mound (1 cell).'),
  crossIronTall: grave(GRAVE_SHEET, 194, 70, 28, 45, 12, 'Tall rope-bound cross on a mound (1 cell, 1.5 tall).'),
  graveBoulder: grave(GRAVE_SHEET, 161, 134, 30, 46, 30, 'Dark cracked burial boulder (1 cell, 1.5 tall).'),
  crossBlack: grave(GRAVE_SHEET, 193, 134, 30, 45, 30, 'Black stone cross (1 cell, 1.5 tall).'),
} satisfies Record<string, Prefab>;
/** Cemetery sets for zone specs. */
export const GRAVES = [
  'graveRoundA',
  'graveRoundB',
  'graveRip',
  'graveDark',
  'graveCrossA',
  'graveCrossB',
  'graveSmall',
  'graveWideA',
  'graveWideB',
] as const satisfies (keyof typeof GRAVE_PREFABS)[];
export const GRAVE_CROSSES = [
  'crossWood',
  'crossMound',
  'crossGold',
  'crossIronA',
  'crossIronB',
  'crossIronTall',
] as const satisfies (keyof typeof GRAVE_PREFABS)[];
// === end LPC grave markers ======================================================================================

// --- Ruins (ruins.png, cut from "[LPC] Jungle Ruins" by tools/map/ruins.ts) ---
const ruin = (name: keyof typeof RUINS_ATLAS, band: number, about: string, tag = 'ruin'): Prefab => {
  const { x, y, w, h } = RUINS_ATLAS[name];
  return { sheet: RUINS_SHEET, w, h, parts: [part(x, y, w, h)], solid: { band, min: 0.3 }, tag, about };
};
const RUIN_PREFABS = {
  ruinPyramid: ruin(
    'pyramid',
    480,
    'Stepped pyramid with a grand stair and statues, 17x15 cells. Solid all over: scenery.',
  ),
  ruinTemple: ruin('temple', 320, 'Small temple with a dark arched door and four pillars, 8x10 cells. Solid all over.'),
  ruinHall: ruin('hall', 192, 'Roofed hall with a colonnade and a statue at its door, 10x6 cells. Solid all over.'),
  ruinHut: ruin('hut', 96, 'Crumbling windowed hut, 4x3 cells. Solid all over.'),
  ruinWall: ruin('wallFaces', 96, 'Long wall with carved faces and a slab, 11x3 cells. Solid.'),
  ruinWallBroken: ruin('wallRuin', 96, 'Wall fallen away on its left, with carved faces, 7x3 cells. Solid.'),
  ruinPillar: ruin('pillar', 128, 'Tall carved pillar, 1x4 cells; it blocks all along its length.'),
  ruinPillarBroken: ruin('pillarBroken', 96, 'Pillar snapped off, 1x3 cells; it blocks all along its length.'),
  ruinStatue: ruin('statueBull', 96, 'Seated stone idol with horns, 1x3 cells; it blocks all along its length.'),
  ruinStatueB: ruin(
    'statueFace',
    96,
    'Seated stone idol with a square face, 1x3 cells; it blocks all along its length.',
  ),
  ruinArch: ruin(
    'arch',
    32,
    'Ruined arcade, 4x3 cells: a dark archway on the left blocks, the open one on the right can be walked through.',
  ),
  ruinRubbleA: ruin('rubbleA', 33, 'Fallen blocks, one cell.', 'rock'),
  ruinRubbleB: ruin('rubbleB', 31, 'Fallen blocks, one cell.', 'rock'),
  ruinRubbleC: ruin('rubbleC', 41, 'A tumbled block, one cell.', 'rock'),
  ruinRubbleD: ruin('rubbleD', 39, 'A tall tumbled block, one cell.', 'rock'),
  ruinRubbleE: ruin('rubbleE', 32, 'Fallen blocks, one cell.', 'rock'),
  ruinRubbleF: ruin('rubbleF', 29, 'A toppled block, one cell.', 'rock'),
};
// --- end Ruins ---

// --- Camp pieces: the quest landmarks' stored pixel art (landmarks.png, tools/map/landmarks.ts), placed in maps ---
const campArt = (frame: keyof typeof LANDMARK_ATLAS, solid: Prefab['solid'], tag: string, about: string): Prefab => {
  const f = LANDMARK_ATLAS[frame];
  return { sheet: 'landmarks.png', w: f.w, h: f.h, parts: [part(f.x, f.y, f.w, f.h)], solid, tag, about };
};
const CAMP_PREFABS = {
  campTent: campArt(
    'tent',
    { band: 40, min: 0.3 },
    'tent',
    'A big canvas tent, 6x4 cells; walk in under its flap (the opening blocks nothing).',
  ),
  campHut: campArt('hut', { band: 30, min: 0.3 }, 'hut', 'A small wooden hut, 2x2 cells. Solid.'),
  campCart: campArt('cart', { band: 24, min: 0.3 }, 'cart', 'A hand cart with its shaft up, 3x2 cells. Solid.'),
  campWell: campArt('well', { band: 40, min: 0.3 }, 'well', 'A wooden-framed stone well, 2x3 cells. Solid.'),
  campFire: campArt('fire0', { band: 12, min: 0.4 }, 'fire', 'A campfire (1 cell). Solid.'),
  campShrine: campArt(
    'shrine',
    { band: 14, min: 0.4 },
    'statue',
    'A hooded stone statue on a plinth (1x2 cells). Solid.',
  ),
};
// --- end Camp pieces ---

// --- Caves, sewers and their doorways (MrBeast's tilesets, see dungeonSheets.ts): pieces named by source tile ---
const delveArt = (
  sheet: string,
  tx: number,
  ty: number,
  tw: number,
  th: number,
  solid: Prefab['solid'],
  tag: string,
  about: string,
): Prefab => ({
  sheet,
  w: tw * 32,
  h: th * 32,
  parts: [part(tx * 32, ty * 32, tw * 32, th * 32)],
  solid,
  tag,
  about,
});
/** A piece of the sewer sheet (sewer_lpc.png, tools/map/sewerLpc.ts) by pixel rectangle. */
const sewerArt = (
  x: number,
  y: number,
  w: number,
  h: number,
  solid: Prefab['solid'],
  tag: string,
  about: string,
): Prefab => ({ sheet: SEWER_SHEET, w, h, parts: [part(x, y, w, h)], solid, tag, about });
const DELVE_PREFABS = {
  caveMouth: {
    sheet: ENTRANCE_SHEET,
    w: 128,
    h: 83,
    parts: [part(0, 0, 128, 83)],
    solid: { band: 83, min: 0.3 },
    tag: 'rock',
    about:
      'A cave mouth in a rounded rock mound that frays into the sand, with a soft shadow (4 cells wide, 2.5 tall, solid): put a door 2 cells wide on its bottom row at the dark opening (the middle two cells).',
  },
  caveExit: delveArt(
    CAVE_SHEET,
    3,
    4,
    3,
    2,
    null,
    'cave',
    'The way out of a cave: a rock face with daylight pouring in (3x2). Draw it over the wall rows north of the floor.',
  ),
  caveHole: delveArt(CAVE_SHEET, 3, 1, 3, 2, null, 'cave', 'A dark tunnel mouth in a cave wall (3x2), decoration.'),
  sewerHatch: {
    sheet: ENTRANCE_SHEET,
    w: 32,
    h: 32,
    parts: [part(128, 0, 32, 32)],
    solid: null,
    tag: 'hatch',
    about:
      'A round drain with a stone rim and a soft shadow ring, set in the ground (1 cell): the way down into a sewer.',
  },
  sewerDoor: sewerArt(0, 32, 32, 64, null, 'sewer', 'A dark arched doorway in a sewer wall (1x2).'),
  sewerGate: sewerArt(32, 32, 32, 64, null, 'sewer', 'A barred arched gate in a sewer wall (1x2), decoration.'),
  sewerGrate: sewerArt(
    64,
    32,
    96,
    64,
    null,
    'sewer',
    'A wide barred outflow in a stone wall over a green stain (3x2): draw it over the wall rows, decoration.',
  ),
  sewerTorch: sewerArt(160, 32, 28, 60, null, 'torch', 'A torch on a long stalk (1 cell wide), over a stone wall.'),
  sewerCrate: sewerArt(192, 32, 31, 42, { band: 28, min: 0.3 }, 'furniture', 'A wooden barrel (1 cell), solid.'),
  sewerBox: sewerArt(224, 32, 28, 24, { band: 22, min: 0.3 }, 'furniture', 'A wooden bucket (1 cell), solid.'),
};

export const PREFABS = {
  ...SIGN_PREFABS,
  ...DELVE_PREFABS,
  ...CAMP_PREFABS,
  ...GRAVE_PREFABS,
  ...RUIN_PREFABS,
  smithy: building(
    'smithy',
    'Blacksmith: a 5x7 gabled hall with a red roof over stone. Hang a tools sign beside the door. Shopkeeper stands one row below.',
  ),
  apothecary: building(
    'apothecary',
    'Apothecary: a 5x7 gabled hall with a red roof over brick. Hang a flask sign beside the door.',
  ),
  wizard: building(
    'wizard',
    "Wizard's sanctum: a 5x7 gabled hall with a slate roof over brick. Hang an amulet sign beside the door.",
  ),
  tavern: building('tavern', 'Tavern: a 5x7 gabled hall with a red roof over brick. Hang a mug sign beside the door.'),
  armory: building(
    'armory',
    'Armorer: a 3x9 tall house with a slate roof over stone. Hang a helm sign beside the door.',
  ),
  counter: furniture(
    'counter',
    32,
    'Shop counter, 4x1.5 cells; its front row blocks and the top overlaps the cell behind it.',
  ),
  shelfSmithy: furniture(
    'shelfSmithy',
    32,
    'Shelves of blades and shields, 3x2 cells, solid at its foot (stand it against the wall: row 1 of a room, dy 8).',
  ),
  shelfArmory: furniture(
    'shelfArmory',
    32,
    'Shelves of helms and plate, 3x2 cells, solid at its foot (stand it against the wall: row 1 of a room, dy 8).',
  ),
  shelfRanger: furniture(
    'shelfRanger',
    32,
    'Shelves of bows and quivers, 3x2 cells, solid at its foot (stand it against the wall: row 1 of a room, dy 8).',
  ),
  shelfApothecary: furniture(
    'shelfApothecary',
    32,
    'Shelves of flasks, 3x2 cells, solid at its foot (stand it against the wall: row 1 of a room, dy 8).',
  ),
  shelfWizard: furniture(
    'shelfWizard',
    32,
    'Shelves of tomes and wands, 3x2 cells, solid at its foot (stand it against the wall: row 1 of a room, dy 8).',
  ),
  signSmithy: furniture('signSmithy', 0, 'Wall sign with an anvil, 4x2 cells, decoration.'),
  signArmory: furniture('signArmory', 0, 'Wall sign with a shield, 4x2 cells, decoration.'),
  signRanger: furniture('signRanger', 0, 'Wall sign with a bow, 4x2 cells, decoration.'),
  signApothecary: furniture('signApothecary', 0, 'Wall sign with a flask, 4x2 cells, decoration.'),
  lectern: furniture(
    'lectern',
    32,
    'A reading stand with an open book, 1x1.5 cells, solid. The wizard room lists the combos on it (systems/lectern.ts).',
  ),
  shopWindow: furniture(
    'window',
    0,
    'A window in the back wall, 1x1.5 cells, decoration (set it with its bottom on the wall base row).',
  ),
  signWizard: furniture('signWizard', 0, 'Wall sign with a star, 4x2 cells, decoration.'),
  shelfTavern: furniture(
    'shelfTavern',
    32,
    'Shelves of tankards and kegs, 3x2 cells, solid at its foot (stand it against the wall: row 1 of a room, dy 8).',
  ),
  signTavern: furniture('signTavern', 0, 'Wall sign with a tankard, 4x2 cells, decoration.'),
  ranger: building(
    'ranger',
    "Ranger's lodge: a 3x9 tall house with a red roof over stone. Hang a sword sign beside the door.",
  ),
  treeA: lpcTree('green', 0, 'Leafy tree, variant A. Blocks its trunk and lower canopy; the crown is walk-behind.'),
  treeB: lpcTree('green', 1, 'Leafy tree, variant B. Blocks its trunk and lower canopy; the crown is walk-behind.'),
  treeC: lpcTree('green', 2, 'Leafy tree, variant C. Blocks its trunk and lower canopy; the crown is walk-behind.'),
  treeD: lpcTree('green', 3, 'Leafy tree, variant D. Blocks its trunk and lower canopy; the crown is walk-behind.'),
  treeE: lpcTree('green', 4, 'Leafy tree, variant E. Blocks its trunk and lower canopy; the crown is walk-behind.'),
  treeF: lpcTree('green', 5, 'Leafy tree, variant F. Blocks its trunk and lower canopy; the crown is walk-behind.'),
  bush: lpcBush('green', 0, 'Leafy bush.'),
  bushSmall: lpcBush('green', 1, 'Small leafy bush.'),
  frostTreeA: lpcTree(
    'frost',
    0,
    'Snow-laden tree (frost zone), variant A. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  frostTreeB: lpcTree(
    'frost',
    1,
    'Snow-laden tree (frost zone), variant B. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  frostTreeC: lpcTree(
    'frost',
    2,
    'Snow-laden tree (frost zone), variant C. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  frostTreeD: lpcTree(
    'frost',
    3,
    'Snow-laden tree (frost zone), variant D. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  frostTreeE: lpcTree(
    'frost',
    4,
    'Snow-laden tree (frost zone), variant E. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  frostTreeF: lpcTree(
    'frost',
    5,
    'Snow-laden tree (frost zone), variant F. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  frostBush: lpcBush('frost', 0, 'Snow-laden bush.'),
  frostBushSmall: lpcBush('frost', 1, 'Small snow-laden bush.'),
  dryTreeA: lpcTree(
    'dry',
    0,
    'Autumn-brown tree (desert edge), variant A. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  dryTreeB: lpcTree(
    'dry',
    1,
    'Autumn-brown tree (desert edge), variant B. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  dryTreeC: lpcTree(
    'dry',
    2,
    'Autumn-brown tree (desert edge), variant C. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  dryTreeD: lpcTree(
    'dry',
    3,
    'Autumn-brown tree (desert edge), variant D. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  dryTreeE: lpcTree(
    'dry',
    4,
    'Autumn-brown tree (desert edge), variant E. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  dryTreeF: lpcTree(
    'dry',
    5,
    'Autumn-brown tree (desert edge), variant F. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnTreeA: lpcTree(
    'autumn',
    0,
    'Orange autumn tree, variant A. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnTreeB: lpcTree(
    'autumn',
    1,
    'Orange autumn tree, variant B. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnTreeC: lpcTree(
    'autumn',
    2,
    'Orange autumn tree, variant C. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnTreeD: lpcTree(
    'autumn',
    3,
    'Orange autumn tree, variant D. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnTreeE: lpcTree(
    'autumn',
    4,
    'Orange autumn tree, variant E. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnTreeF: lpcTree(
    'autumn',
    5,
    'Orange autumn tree, variant F. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  autumnBush: lpcBush('autumn', 0, 'Orange autumn bush.'),
  autumnBushSmall: lpcBush('autumn', 1, 'Small orange autumn bush.'),
  dryBush: lpcBush('dry', 0, 'Autumn-brown bush.'),
  dryBushSmall: lpcBush('dry', 1, 'Small autumn-brown bush.'),
  jungleTreeA: lpcTree(
    'jungle',
    0,
    'Deep teal jungle tree, variant A. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  jungleTreeB: lpcTree(
    'jungle',
    1,
    'Deep teal jungle tree, variant B. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  jungleTreeC: lpcTree(
    'jungle',
    2,
    'Deep teal jungle tree, variant C. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  jungleTreeD: lpcTree(
    'jungle',
    3,
    'Deep teal jungle tree, variant D. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  jungleTreeE: lpcTree(
    'jungle',
    4,
    'Deep teal jungle tree, variant E. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  jungleTreeF: lpcTree(
    'jungle',
    5,
    'Deep teal jungle tree, variant F. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  jungleBush: lpcBush('jungle', 0, 'Deep teal jungle bush.'),
  jungleBushSmall: lpcBush('jungle', 1, 'Small deep teal jungle bush.'),
  deadTreeA: lpcTree(
    'dead',
    0,
    'Bare dead tree (undead lands), variant A. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  deadTreeB: lpcTree(
    'dead',
    1,
    'Bare dead tree (undead lands), variant B. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  deadTreeC: lpcTree(
    'dead',
    2,
    'Bare dead tree (undead lands), variant C. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  deadTreeD: lpcTree(
    'dead',
    3,
    'Bare dead tree (undead lands), variant D. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  deadTreeE: lpcTree(
    'dead',
    4,
    'Bare dead tree (undead lands), variant E. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  deadTreeF: lpcTree(
    'dead',
    5,
    'Bare dead tree (undead lands), variant F. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  deadBush: lpcBush('dead', 0, 'Bare dead bush.'),
  deadBushSmall: lpcBush('dead', 1, 'Small bare dead bush.'),
  swampTreeA: lpcTree(
    'swamp',
    0,
    'Murky olive tree (marsh, wetlands), variant A. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  swampTreeB: lpcTree(
    'swamp',
    1,
    'Murky olive tree (marsh, wetlands), variant B. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  swampTreeC: lpcTree(
    'swamp',
    2,
    'Murky olive tree (marsh, wetlands), variant C. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  swampTreeD: lpcTree(
    'swamp',
    3,
    'Murky olive tree (marsh, wetlands), variant D. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  swampTreeE: lpcTree(
    'swamp',
    4,
    'Murky olive tree (marsh, wetlands), variant E. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  swampTreeF: lpcTree(
    'swamp',
    5,
    'Murky olive tree (marsh, wetlands), variant F. Blocks its trunk and lower canopy; the crown is walk-behind.',
  ),
  swampBush: lpcBush('swamp', 0, 'Murky olive bush.'),
  swampBushSmall: lpcBush('swamp', 1, 'Small murky olive bush.'),
  ...rocks,
  frostRock: frostRocks.rock,
  frostRockSmall: frostRocks.rockSmall,
  frostRockB: frostRocks.rockB,
  frostRockC: frostRocks.rockC,
  // From the LPC terrain atlas (lpc_terrain.png).
  sandBoulder: rock(TERRAIN_SHEET, 770, 625, 61, 43, 'Big sandstone boulder (2 cells wide).'),
  sandBoulderB: rock(TERRAIN_SHEET, 834, 628, 58, 41, 'Second sandstone boulder (2 cells wide).'),
  sandSpire: rock(TERRAIN_SHEET, 898, 622, 29, 44, 'Tall sandstone rock (1 cell).'),
  darkBoulder: rock(TERRAIN_SHEET, 770, 689, 61, 43, 'Big dark basalt boulder (2 cells wide).'),
  darkBoulderB: rock(TERRAIN_SHEET, 834, 692, 58, 41, 'Second dark boulder (2 cells wide).'),
  darkSpire: rock(TERRAIN_SHEET, 898, 686, 29, 44, 'Tall dark rock (1 cell).'),
  menhir: {
    sheet: TERRAIN_SHEET,
    w: 24,
    h: 59,
    parts: [part(995, 643, 24, 59)],
    solid: { band: 24, min: 0.3 },
    tag: 'rock',
    about: 'Standing stone, 1 cell, about 2 tall (graves, old rings).',
  },
  // Reeds are bank plants (the atlas draws a water-edge strip under them that is not used): stand them on the land
  // beside the water, never in it.
  reedBed: {
    sheet: TERRAIN_SHEET,
    w: 94,
    h: 103,
    parts: [part(33, 819, 94, 103)],
    solid: { band: 60, min: 0.3 },
    tag: 'reeds',
    about: 'A thicket of tall reeds on the bank (3 cells wide, 3 tall); its foot rows block. Put it beside water.',
  },
  reedStalks: {
    sheet: TERRAIN_SHEET,
    w: 32,
    h: 104,
    parts: [part(0, 817, 32, 104)],
    solid: { band: 60, min: 0.3 },
    tag: 'reeds',
    about: 'A narrow clump of tall reeds on the bank (1 cell wide, 3 tall). Put it beside water.',
  },
  lilyFlower: lily(192, 544, 32, 32, 'Lily pads with a pink flower; lay on water.'),
  lilyFlowerB: lily(224, 545, 31, 31, 'Lily pads with a white flower; lay on water.'),
  lilyPads: lily(256, 544, 32, 24, 'Plain lily pads; lay on water.'),
  lilyRed: lily(288, 544, 32, 30, 'Lily pads with a red flower; lay on water.'),
  barrel: {
    sheet: OBJECT_SHEET,
    w: 28,
    h: 40,
    parts: [part(321, 18, 28, 40)],
    solid: { band: 24, min: 0.3 },
    tag: 'barrel',
    movable: true,
    about: 'Wooden barrel (1 cell wide). Players pick it up and move it; it blocks only where it stands.',
  },
  flowerRed: {
    sheet: OBJECT_SHEET,
    w: 16,
    h: 15,
    parts: [part(352, 40, 16, 15)],
    solid: null,
    tag: 'flower',
    about: 'Red flower, decoration only.',
  },
  flowersPurple: {
    sheet: OBJECT_SHEET,
    w: 18,
    h: 28,
    parts: [part(366, 33, 18, 28)],
    solid: null,
    tag: 'flower',
    about: 'Pair of purple flowers, decoration only.',
  },
} satisfies Record<string, Prefab>;

export type PrefabName = keyof typeof PREFABS;
export const TREES = ['treeA', 'treeB', 'treeC', 'treeD', 'treeE', 'treeF'] as const satisfies PrefabName[];
export const FROST_TREES = [
  'frostTreeA',
  'frostTreeB',
  'frostTreeC',
  'frostTreeD',
  'frostTreeE',
  'frostTreeF',
] as const satisfies PrefabName[];
export const AUTUMN_TREES = [
  'autumnTreeA',
  'autumnTreeB',
  'autumnTreeC',
  'autumnTreeD',
  'autumnTreeE',
  'autumnTreeF',
] as const satisfies PrefabName[];
export const DRY_TREES = [
  'dryTreeA',
  'dryTreeB',
  'dryTreeC',
  'dryTreeD',
  'dryTreeE',
  'dryTreeF',
] as const satisfies PrefabName[];
export const JUNGLE_TREES = [
  'jungleTreeA',
  'jungleTreeB',
  'jungleTreeC',
  'jungleTreeD',
  'jungleTreeE',
  'jungleTreeF',
] as const satisfies PrefabName[];
export const DEAD_TREES = [
  'deadTreeA',
  'deadTreeB',
  'deadTreeC',
  'deadTreeD',
  'deadTreeE',
  'deadTreeF',
] as const satisfies PrefabName[];
export const SWAMP_TREES = [
  'swampTreeA',
  'swampTreeB',
  'swampTreeC',
  'swampTreeD',
  'swampTreeE',
  'swampTreeF',
] as const satisfies PrefabName[];

/**
 * Cliff kit: the plateau blob on Cliff_tileset.png (x 44-213, y 15-223) cut along its 64x64 grass hole
 * into a 3x3 grid whose middle row/column repeat in 32px chunks, so a plateau can be any size >= 4x4 cells.
 * `zone.plateau(rect)` assembles it; rect is the *walkable top* in cells. Measured from the art:
 *   - the hole's top-left corner sits at world ((rect.col+1)*32, (rect.row+1)*32), so
 *   - the rim rocks fall in the 1-cell ring N/W/E of rect and the rock face covers the 2 rows below it,
 *   - the lighter fringe grass inside the rim is walkable (same grass as the ground).
 * Stairs piece (x 320-416, y 128-222) replaces three 32px face columns; its steps span the middle one.
 */
export const CLIFF = {
  /** Source column boundaries: left rim | repeat A | repeat B | right rim. */
  xs: [44, 96, 128, 160, 213],
  /** Source row boundaries: top rim | repeat A | repeat B | fringe + face. */
  ys: [15, 64, 96, 128, 223],
  stairs: { x: 320, y: 128, w: 96, h: 94 },
  /** Cliff sheet per biome. Frost/dry are recolours with identical coordinates (tools/map/recolor.ts). */
  sheets: { grass: CLIFF_SHEET, frost: FROST_CLIFFS, dry: DRY_CLIFFS, rock: ROCK_SHEET },
};
export type CliffKind = keyof typeof CLIFF.sheets;
