// Named map assets for zone specs. Every coordinate here was checked against the sheets in
// public/tilesets/ (see the map pitfalls in CLAUDE.md); add new entries only after looking at the art.

export const GROUND_SHEET = 'ground_tiles.png';
export const OBJECT_SHEET = 'object-layer.png';
// Derived by tools/map/recolor.ts (`npm run tilesets`): same layout as the originals, recoloured.
export const PLUS_SHEET = 'ground_plus.png'; // ground_tiles + a plain water tile matching the lake ring
export const FROST_SHEET = 'frost_ground.png'; // sand -> snow, water -> ice
export const FROST_OBJECTS = 'frost_objects.png'; // snow-dusted trees/bushes, blue-grey rocks
export const DRY_OBJECTS = 'dry_objects.png'; // withered ochre trees/bushes
export const JUNGLE_OBJECTS = 'jungle_objects.png'; // deep green jungle trees/bushes
export const DEAD_OBJECTS = 'dead_objects.png'; // ashen grey trees/bushes of the undead lands
export const SWAMP_OBJECTS = 'swamp_objects.png'; // murky olive marsh trees/bushes
export const TOWN_SHEET = 'town.png'; // the shop buildings, cut from the CC0 Town RPG Pack by tools/map/town.ts
export const INTERIOR_SHEET = 'interior.png'; // shop interiors: floor, wall, counter, shelves, signs (tools/map/interior.ts)
export const TERRAIN_SHEET = 'lpc_terrain.png'; // the LPC terrain atlas (art/lpc_terrain/): autotiled terrains, see terrain.ts
export const CLIFF_SHEET = 'Cliff_tileset.png'; // Avalon cliffs: a plateau blob, stairs, notches
export const FROST_CLIFFS = 'frost_cliffs.png'; // cliffs with snow tops and blue-grey rock (recolor.ts)
export const DRY_CLIFFS = 'dry_cliffs.png'; // cliffs with sandy tops and ochre rock (recolor.ts)

/** Baked-in drop-shadow colour on object-layer.png. Ignored when measuring how much a cell is covered. */
export const SHADOW_RGB = [152, 169, 150] as const;
/** Shadow colours of the recoloured sheets (tools/map/recolor.ts), tuned to read on snow and on sand. */
export const SHADOW_FROST = [150, 162, 178] as const;
export const SHADOW_DRY = [183, 163, 125] as const;
export const SHADOW_JUNGLE = [96, 128, 92] as const;
export const SHADOW_DEAD = [104, 98, 110] as const;
export const SHADOW_SWAMP = [112, 118, 84] as const;
export const SHADOWS = [SHADOW_RGB, SHADOW_FROST, SHADOW_DRY, SHADOW_JUNGLE, SHADOW_DEAD, SHADOW_SWAMP] as const;

/** A repeating ground fill: `tiles[row % rows][col % cols]` gives the source [x, y] of each map cell. */
export interface GroundFill {
  sheet: string;
  tiles: [number, number][][];
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
} satisfies Record<string, GroundFill>;

export type GroundName = keyof typeof GROUND;

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
  /** What the object is, copied to MapObject.tag so game systems (leaf fall, rustling...) can find it. */
  tag?: string;
  about: string;
}

const part = (x: number, y: number, w: number, h: number, dx = 0, dy = 0): PrefabPart => ({ x, y, w, h, dx, dy });

const treeParts = {
  A: [part(96, 103, 64, 89), part(160, 127, 30, 65, 64, 24)],
  B: [part(220, 103, 66, 89, 28, 0), part(192, 125, 28, 67, 0, 22)],
};
const tree = (sheet: string, which: 'A' | 'B', about: string): Prefab => ({
  sheet,
  w: 94,
  h: 89,
  parts: treeParts[which],
  solid: { band: 64, min: 0.5 },
  tag: 'tree',
  about,
});
const bush = (sheet: string, about: string): Prefab => ({
  sheet,
  w: 62,
  h: 57,
  parts: [part(160, 71, 62, 57)],
  solid: { band: 40, min: 0.5 },
  tag: 'bush',
  about,
});
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

/** Where each shop building sits on town.png (2x the pack's art; both sizes are whole cells so the footprint is clean). */
export const BUILDINGS = {
  smithy: { x: 0, y: 0, w: 192, h: 224 },
  apothecary: { x: 192, y: 0, w: 192, h: 224 },
  armory: { x: 384, y: 0, w: 96, h: 288 },
  ranger: { x: 480, y: 0, w: 96, h: 288 },
  wizard: { x: 576, y: 0, w: 192, h: 224 },
};
/** Where each piece of the shop interior sits on interior.png (2x the 16px drawing in tools/map/interior.ts). */
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
  lectern: { x: 0, y: 160, w: 32, h: 48 },
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

export const PREFABS = {
  smithy: building(
    'smithy',
    'Blacksmith: a 6x7 hall with terracotta roof and an anvil over the door. Shopkeeper stands one row below.',
  ),
  apothecary: building('apothecary', 'Apothecary: a 6x7 hall with a green roof and a flask over the door.'),
  wizard: building('wizard', "Wizard's sanctum: a 6x7 hall with a violet roof and a star over the door."),
  armory: building('armory', 'Armorer: a 3x9 tall house with a slate roof and a shield over the door.'),
  counter: furniture(
    'counter',
    32,
    'Shop counter, 4x1.5 cells; its front row blocks and the top overlaps the cell behind it.',
  ),
  shelfSmithy: furniture('shelfSmithy', 64, 'Shelves of blades and shields, 3x2 cells, solid (against a wall).'),
  shelfArmory: furniture('shelfArmory', 64, 'Shelves of helms and plate, 3x2 cells, solid.'),
  shelfRanger: furniture('shelfRanger', 64, 'Shelves of bows and quivers, 3x2 cells, solid.'),
  shelfApothecary: furniture('shelfApothecary', 64, 'Shelves of flasks, 3x2 cells, solid.'),
  shelfWizard: furniture('shelfWizard', 64, 'Shelves of tomes and wands, 3x2 cells, solid.'),
  signSmithy: furniture('signSmithy', 0, 'Wall sign with an anvil, 4x2 cells, decoration.'),
  signArmory: furniture('signArmory', 0, 'Wall sign with a shield, 4x2 cells, decoration.'),
  signRanger: furniture('signRanger', 0, 'Wall sign with a bow, 4x2 cells, decoration.'),
  signApothecary: furniture('signApothecary', 0, 'Wall sign with a flask, 4x2 cells, decoration.'),
  lectern: furniture(
    'lectern',
    32,
    'A reading stand with an open book, 1x1.5 cells, solid. The wizard room lists the combos on it (systems/lectern.ts).',
  ),
  signWizard: furniture('signWizard', 0, 'Wall sign with a star, 4x2 cells, decoration.'),
  ranger: building('ranger', "Ranger's lodge: a 3x9 tall house with a golden roof and a bow over the door."),
  treeA: tree(OBJECT_SHEET, 'A', 'Round leafy canopy (3x3 cells). Blocks its bottom two rows; top row is walk-behind.'),
  treeB: tree(
    OBJECT_SHEET,
    'B',
    'Second canopy variant, same size and collision as treeA. Mix the two to avoid repetition.',
  ),
  frostTreeA: tree(FROST_OBJECTS, 'A', 'treeA wearing snow (frost zone).'),
  frostTreeB: tree(FROST_OBJECTS, 'B', 'treeB wearing snow (frost zone).'),
  dryTreeA: tree(DRY_OBJECTS, 'A', 'treeA withered to ochre (desert edge).'),
  dryTreeB: tree(DRY_OBJECTS, 'B', 'treeB withered to ochre (desert edge).'),
  jungleTreeA: tree(JUNGLE_OBJECTS, 'A', 'treeA in deep jungle green.'),
  jungleTreeB: tree(JUNGLE_OBJECTS, 'B', 'treeB in deep jungle green.'),
  deadTreeA: tree(DEAD_OBJECTS, 'A', 'treeA drained to ashen grey (undead lands).'),
  deadTreeB: tree(DEAD_OBJECTS, 'B', 'treeB drained to ashen grey (undead lands).'),
  swampTreeA: tree(SWAMP_OBJECTS, 'A', 'treeA in murky olive (marsh, wetlands).'),
  swampTreeB: tree(SWAMP_OBJECTS, 'B', 'treeB in murky olive (marsh, wetlands).'),
  bush: bush(OBJECT_SHEET, 'Small round bush (2x2 cells).'),
  jungleBush: bush(JUNGLE_OBJECTS, 'Deep green bush (2x2).'),
  deadBush: bush(DEAD_OBJECTS, 'Ashen grey bush (2x2).'),
  swampBush: bush(SWAMP_OBJECTS, 'Olive marsh bush (2x2).'),
  frostBush: bush(FROST_OBJECTS, 'Snow-dusted bush (2x2).'),
  dryBush: bush(DRY_OBJECTS, 'Withered scrub (2x2).'),
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
    about: 'Wooden barrel (1 cell wide).',
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
export const TREES: PrefabName[] = ['treeA', 'treeB'];
export const FROST_TREES: PrefabName[] = ['frostTreeA', 'frostTreeB'];
export const DRY_TREES: PrefabName[] = ['dryTreeA', 'dryTreeB'];
export const JUNGLE_TREES: PrefabName[] = ['jungleTreeA', 'jungleTreeB'];
export const DEAD_TREES: PrefabName[] = ['deadTreeA', 'deadTreeB'];
export const SWAMP_TREES: PrefabName[] = ['swampTreeA', 'swampTreeB'];

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
  sheets: { grass: CLIFF_SHEET, frost: FROST_CLIFFS, dry: DRY_CLIFFS },
};
export type CliffKind = keyof typeof CLIFF.sheets;
