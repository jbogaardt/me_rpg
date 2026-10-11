// Named map assets for zone specs. Every coordinate here was checked against the sheets in
// public/tilesets/ (see the map pitfalls in CLAUDE.md); add new entries only after looking at the art.

export const GROUND_SHEET = 'ground_tiles.png';
export const OBJECT_SHEET = 'object-layer.png';

/** Baked-in drop-shadow colour on object-layer.png. Ignored when measuring how much a cell is covered. */
export const SHADOW_RGB = [152, 169, 150] as const;

/** A repeating ground fill: `tiles[row % rows][col % cols]` gives the source [x, y] of each map cell. */
export interface GroundFill {
  sheet: string;
  tiles: [number, number][][];
}

export const GROUND = {
  grass: {
    sheet: GROUND_SHEET,
    tiles: [
      [[32, 64], [64, 64]],
      [[32, 96], [64, 96]],
    ],
  },
  sand: {
    sheet: GROUND_SHEET,
    tiles: [
      [[32, 160], [64, 160], [96, 160]],
      [[32, 192], [64, 192], [96, 192]],
      [[32, 224], [64, 224], [96, 224]],
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
    nw: [192, 128], n: [224, 128], ne: [256, 128],
    w: [192, 160], e: [256, 160],
    sw: [192, 192], s: [224, 192], se: [256, 192],
  },
};

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
  about: string;
}

const part = (x: number, y: number, w: number, h: number, dx = 0, dy = 0): PrefabPart => ({ x, y, w, h, dx, dy });

export const PREFABS = {
  treeA: {
    sheet: OBJECT_SHEET,
    w: 94,
    h: 89,
    parts: [part(96, 103, 64, 89), part(160, 127, 30, 65, 64, 24)],
    solid: { band: 64, min: 0.5 },
    about: 'Round leafy canopy (3x3 cells). Blocks its bottom two rows; top row is walk-behind.',
  },
  treeB: {
    sheet: OBJECT_SHEET,
    w: 94,
    h: 89,
    parts: [part(220, 103, 66, 89, 28, 0), part(192, 125, 28, 67, 0, 22)],
    solid: { band: 64, min: 0.5 },
    about: 'Second canopy variant, same size and collision as treeA. Mix the two to avoid repetition.',
  },
  bush: {
    sheet: OBJECT_SHEET,
    w: 62,
    h: 57,
    parts: [part(160, 71, 62, 57)],
    solid: { band: 40, min: 0.5 },
    about: 'Small round bush (2x2 cells).',
  },
  rock: {
    sheet: OBJECT_SHEET,
    w: 30,
    h: 32,
    parts: [part(290, 32, 30, 32)],
    solid: { band: 32, min: 0.3 },
    about: 'Boulder, one cell.',
  },
  rockSmall: {
    sheet: OBJECT_SHEET,
    w: 28,
    h: 30,
    parts: [part(290, 65, 28, 30)],
    solid: { band: 30, min: 0.3 },
    about: 'Smaller rock, one cell.',
  },
} satisfies Record<string, Prefab>;

export type PrefabName = keyof typeof PREFABS;
export const TREES: PrefabName[] = ['treeA', 'treeB'];
