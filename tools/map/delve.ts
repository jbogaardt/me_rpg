// Caves and sewers: rooms carved out of solid rock. A zone spec makes a `Delve` (a grid of rock), carves chambers,
// tunnels and pools into it, and `paint` turns the grid into ground and collision. Nothing is drawn by hand: a rock cell
// shows what its distance to the open ground south of it says (the view is from the south, so only that side of a wall
// is seen): the wall face against the floor, a second face row above it, a rim, then the plain dark roof. The same
// grid paints a cave or a sewer; a theme names the grounds (GROUND in catalog.ts, art by MrBeast, art/oga_dungeon/).

import type { BackdropName } from '../../src/map/backdrop';
import type { GroundName } from './catalog';
import { DRY_MIX, fadeTile, FX_SHEET, hash, maskOf, pickWeighted, rimTile, WET_MIX, type DecalMix } from './delveStyle';
import type { TerrainName } from './terrain';
import type { ZoneApi } from './zone';

export type Cell = '#' | '.' | '~' | '^';

interface Theme {
  floor: GroundName;
  /** Now and then in place of the floor (pebbles, cracks): a share of `DETAIL` of the cells. */
  detail?: GroundName;
  water: GroundName;
  lava?: GroundName;
  roof: GroundName;
  /** Rock rows seen above the floor, nearest first: the wall face and what tops it, then `roof`. */
  wall: GroundName[];
  /** The wall face against water or lava instead of floor, when the art differs. */
  wallWater?: GroundName;
  /** Several drawn tiles of the floor (sheet, x, y) picked by a hash of the cell, so no grid shows; weights per tile. */
  floorTiles?: { sheet: string; tiles: readonly (readonly [number, number])[]; weights: readonly number[] };
  /** The mix of cracks, puddles, moss and pebbles over the floor. */
  decals: DecalMix;
  /** The floor in a wall's contact shadow: used for the floor row just south of rock. */
  shade?: GroundName;
  /** Now and then in place of the roof, so a thick mass of rock has grain. */
  roofAlt?: GroundName;
  /** The far backdrop (`src/map/backdrop.ts`) shown where the roof was: rock mass seen as dark depth, not a flat tile. */
  backdrop: BackdropName;
  /** Autotiled terrains laid over pools and lava (soft banks and shorelines instead of square cell edges). */
  waterTerrain?: TerrainName;
  lavaTerrain?: TerrainName;
}

export const DELVE_THEMES = {
  cave: {
    floor: 'caveFloor',
    detail: 'caveRubble',
    water: 'caveWater',
    lava: 'caveLava',
    roof: 'caveRoof',
    wall: ['caveFaceL', 'caveFaceU', 'caveEdge'],
    wallWater: 'caveFaceLWater',
    decals: DRY_MIX,
    backdrop: 'cave',
    waterTerrain: 'murk',
    lavaTerrain: 'lava',
  },
  rock: {
    floor: 'rockFloor',
    water: 'caveWater',
    lava: 'caveLava',
    roof: 'rockRoof',
    wall: ['rockFaceL', 'rockFaceU', 'rockFaceM', 'rockEdge'],
    shade: 'rockFloorShade',
    roofAlt: 'rockRoofB',
    decals: DRY_MIX,
    backdrop: 'rock',
    waterTerrain: 'murk',
    lavaTerrain: 'lava',
  },
  sewer: {
    floor: 'sewerFloor',
    water: 'sewerWater',
    roof: 'sewerRoof',
    wall: ['sewerFaceL', 'sewerFaceU', 'sewerCap', 'sewerCapTop'],
    decals: WET_MIX,
    backdrop: 'sewer',
  },
} satisfies Record<string, Theme>;
export type DelveTheme = keyof typeof DELVE_THEMES;

/** One cell in this many shows the theme's detail ground. */
const DETAIL = 9;

/** A rectangular grid of cells, all rock (`#`) until carved. Coordinates are cells; anything off the grid is ignored. */
export class Delve {
  readonly cells: Cell[][];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = Array.from({ length: height }, () => new Array<Cell>(width).fill('#'));
  }

  private set(col: number, row: number, cell: Cell) {
    if (col >= 1 && row >= 0 && col < this.width - 1 && row < this.height - 1) this.cells[row][col] = cell;
  }

  /** A rectangle, floor by default. */
  rect(col: number, row: number, w: number, h: number, cell: Cell = '.') {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) this.set(c, r, cell);
    return this;
  }

  /** An ellipse centred on (cx, cy) with radii rx and ry (a chamber, a pool); `wobble` roughens its rim a little. */
  ellipse(cx: number, cy: number, rx: number, ry: number, cell: Cell = '.', wobble = 0) {
    for (let r = Math.floor(cy - ry - 1); r <= cy + ry + 1; r++) {
      for (let c = Math.floor(cx - rx - 1); c <= cx + rx + 1; c++) {
        const n = wobble * (hash(c, r) - 0.5);
        if (((c - cx) / rx) ** 2 + ((r - cy) / ry) ** 2 <= 1 + n) this.set(c, r, cell);
      }
    }
    return this;
  }

  /** A tunnel `width` wide through the points, each leg straight, going along columns first then rows. */
  tunnel(points: [number, number][], width = 3, cell: Cell = '.') {
    const lo = -Math.floor((width - 1) / 2);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      this.rect(Math.min(a[0], b[0]) + lo, a[1] + lo, Math.abs(b[0] - a[0]) + width, width, cell);
      this.rect(b[0] + lo, Math.min(a[1], b[1]) + lo, width, Math.abs(b[1] - a[1]) + width, cell);
    }
    return this;
  }

  at(col: number, row: number): Cell {
    return this.cells[row]?.[col] ?? '#';
  }
  /** Walkable ground. */
  open(col: number, row: number) {
    return this.at(col, row) === '.';
  }
  /** The `n`th open cell, scanning rows from the top: handy for a spec to find ground by order, never by guess. */
  firstOpen(col: number, row: number, w: number, h: number): [number, number] {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (this.open(c, r)) return [c, r];
    throw new Error(`no open ground in ${w}x${h} at (${col},${row})`);
  }

  /** The rows as text: `#` rock, `.` floor, `~` water, `^` lava (for a test or a look at the layout). */
  text() {
    return this.cells.map((row) => row.join(''));
  }

  /** 1 or 2 where a roof cell is the first or second row of the cliff face hanging under a floor's south edge, else 0. */
  private hang(col: number, row: number, roof: boolean[]): number {
    const is = (c: number, r: number) => roof[r * this.width + c] === true && this.at(c, r) === '#';
    if (!is(col, row)) return 0;
    if (this.open(col, row - 1)) return 1;
    return is(col, row - 1) && this.open(col, row - 2) ? 2 : 0;
  }

  /**
   * Where open floor meets the dark roof (nothing drawn there, the backdrop shows) on its south, east or west side: a lit
   * lip on the floor's rim (`rimTile`, east/west with a thin dark side face) and, under a south edge, `hang`'s two rows
   * of face fading to dark (`fadeTile`). Overlays only, so collision and the rest of the ground are untouched.
   */
  private edges(z: ZoneApi, roof: boolean[]) {
    const dark = (c: number, r: number) => roof[r * this.width + c] === true && this.at(c, r) === '#';
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (this.at(col, row) === '.') {
          const rim = maskOf(false, dark(col + 1, row), dark(col, row + 1), dark(col - 1, row));
          if (rim) z.overlay(col, row, FX_SHEET, ...rimTile(rim));
        }
        const hang = this.hang(col, row, roof);
        if (hang) z.overlay(col, row, FX_SHEET, ...fadeTile(hang - 1));
      }
    }
  }

  /** Paint the grid onto `z`: ground for every cell and collision for rock, water and lava. */
  paint(z: ZoneApi, themeName: DelveTheme) {
    const theme: Theme = DELVE_THEMES[themeName];
    if (z.width !== this.width || z.height !== this.height) {
      throw new Error(`the grid is ${this.width}x${this.height}, the zone ${z.width}x${z.height}`);
    }
    z.indoor();
    z.dark();
    z.fill(theme.floor);
    const grounds: GroundName[] = [];
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = this.at(col, row);
        let ground: GroundName;
        if (cell === '.') {
          ground = theme.detail && hash(col, row, 7) < 1 / DETAIL ? theme.detail : theme.floor;
          if (theme.shade && this.at(col, row - 1) === '#') ground = theme.shade;
        } else if (cell === '~') ground = theme.water;
        else if (cell === '^') ground = theme.lava ?? theme.water;
        else {
          let depth = 1;
          while (this.at(col, row + depth) === '#' && row + depth < this.height) depth++;
          const below = this.at(col, row + depth);
          const open = row + depth < this.height;
          ground = !open || depth > theme.wall.length ? theme.roof : theme.wall[depth - 1];
          if (ground === theme.roof && theme.roofAlt && hash(col, row, 3) < 0.35) ground = theme.roofAlt;
          if (open && depth === 1 && below !== '.' && theme.wallWater) ground = theme.wallWater;
        }
        grounds.push(ground);
        z.fill(ground, { col, row, w: 1, h: 1 });
        const ft = theme.floorTiles;
        if (cell === '.' && ground === theme.floor && ft) {
          const [x, y] = ft.tiles[pickWeighted(ft.weights, hash(col, row, 3))];
          z.tileAt(col, row, ground, ft.sheet, x, y);
        }
      }
    }
    // Rock under a floor's south edge keeps two rows of cliff face (fading to dark, `edges`) instead of the bare backdrop.
    const roof = grounds.map((g) => g === theme.roof || g === theme.roofAlt);
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const h = this.hang(col, row, roof);
        if (!h) continue;
        grounds[row * this.width + col] = theme.wall[h === 1 ? 1 : 0];
        z.fill(theme.wall[h === 1 ? 1 : 0], { col, row, w: 1, h: 1 });
      }
    }
    // Pools and lava get a soft bank and a shoreline from the autotiled terrains, drawn over the ground fills above.
    for (const [cell, terrain] of [
      ['~', theme.waterTerrain],
      ['^', theme.lavaTerrain],
    ] as const) {
      if (!terrain) continue;
      const rects = [];
      for (let row = 0; row < this.height; row++) {
        for (let col = 0; col < this.width; col++) {
          if (this.at(col, row) !== cell) continue;
          let w = 1;
          while (col + w < this.width && this.at(col + w, row) === cell) w++;
          rects.push({ col, row, w, h: 1 });
          col += w - 1;
        }
      }
      if (rects.length) z.paint(terrain, rects);
    }
    this.edges(z, roof);
    // The roof is not drawn: the backdrop shows through where the rock mass was (collision stays), and slides with depth.
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const g = grounds[row * this.width + col];
        if (g === theme.roof || g === theme.roofAlt) z.clearGround({ col, row, w: 1, h: 1 });
      }
    }
    z.backdrop(theme.backdrop);
    for (const [cell, reason] of [
      ['#', 'rock wall'],
      ['~', 'water'],
      ['^', 'lava'],
    ] as const) {
      for (let row = 0; row < this.height; row++) {
        for (let col = 0; col < this.width; col++) {
          if (this.at(col, row) !== cell) continue;
          let w = 1;
          while (col + w < this.width && this.at(col + w, row) === cell) w++;
          z.block({ col, row, w, h: 1 }, reason);
          col += w - 1;
        }
      }
    }
  }
}
