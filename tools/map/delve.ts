// Caves and sewers: rooms carved out of solid rock. A zone spec makes a `Delve` (a grid of rock), carves chambers,
// tunnels and pools into it, and `paint` turns the grid into ground and collision. Nothing is drawn by hand: a rock cell
// shows what its distance to the open ground south of it says (the view is from the south, so only that side of a wall
// is seen): the wall face against the floor, a second face row above it, a rim, then the plain dark roof. The same
// grid paints a cave or a sewer; a theme names the grounds (GROUND in catalog.ts, art by MrBeast, art/oga_dungeon/).

import { SEWER_FLOORS, type GroundName } from './catalog';
import {
  decalTile,
  DRY_MIX,
  foamTile,
  FX_SHEET,
  hash,
  maskOf,
  pickDecal,
  pickWeighted,
  rimTile,
  roofTile,
  ROOF_VARIANTS,
  shadowTile,
  WET_MIX,
  type DecalMix,
} from './delveStyle';
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
  },
  rock: {
    floor: 'rockFloor',
    water: 'caveWater',
    lava: 'caveLava',
    roof: 'rockRoof',
    wall: ['rockFaceL', 'rockFaceU', 'rockEdge'],
    decals: DRY_MIX,
  },
  sewer: {
    floor: 'sewerFloor',
    water: 'sewerWater',
    roof: 'sewerRoof',
    wall: ['sewerFaceL', 'sewerFaceU', 'sewerCap', 'sewerCapTop'],
    floorTiles: SEWER_FLOORS,
    decals: WET_MIX,
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

  /**
   * The shading and detail over the painted ground (overlay tiles from `delve_fx.png`, `delveStyle.ts`): a soft contact
   * shadow where floor and water meet a wall, foam where water meets floor, cracks, puddles, moss and pebbles on the floor,
   * and a rock texture with a light rim on the roof. The same for every cave, crypt and sewer.
   */
  private dress(z: ZoneApi, theme: Theme, grounds: GroundName[]) {
    const rock = (c: number, r: number) => this.at(c, r) === '#';
    const dry = (c: number, r: number) => this.at(c, r) === '.';
    const fx = (col: number, row: number, [x, y]: readonly [number, number]) => z.overlay(col, row, FX_SHEET, x, y);
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = this.at(col, row);
        if (cell === '.' || cell === '~') {
          // Walls to the north and sides darken the ground at their foot (the south side is the wall's own face, drawn on it).
          const shade = maskOf(rock(col, row - 1), rock(col + 1, row), false, rock(col - 1, row));
          if (shade) fx(col, row, shadowTile(shade));
        }
        if (cell === '~') {
          const foam = maskOf(dry(col, row - 1), dry(col + 1, row), dry(col, row + 1), dry(col - 1, row));
          if (foam) fx(col, row, foamTile(foam));
        } else if (cell === '.' && grounds[row * this.width + col] === theme.floor) {
          const d = pickDecal(theme.decals, hash(col, row, 11), hash(col, row, 12));
          if (d) fx(col, row, decalTile(d.kind, d.variant));
        } else if (cell === '#' && grounds[row * this.width + col] === theme.roof) {
          fx(col, row, roofTile(Math.floor(hash(col, row, 13) * ROOF_VARIANTS)));
          const rim = maskOf(!rock(col, row - 1), !rock(col + 1, row), false, !rock(col - 1, row));
          if (rim) fx(col, row, rimTile(rim));
        }
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
        if (cell === '.') ground = theme.detail && hash(col, row, 7) < 1 / DETAIL ? theme.detail : theme.floor;
        else if (cell === '~') ground = theme.water;
        else if (cell === '^') ground = theme.lava ?? theme.water;
        else {
          let depth = 1;
          while (this.at(col, row + depth) === '#' && row + depth < this.height) depth++;
          const below = this.at(col, row + depth);
          const open = row + depth < this.height;
          ground = !open || depth > theme.wall.length ? theme.roof : theme.wall[depth - 1];
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
    this.dress(z, theme, grounds);
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
