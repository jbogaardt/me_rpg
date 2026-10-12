// Builds public/tilesets/interior.png: the floor, walls, counter, shelves and signs inside the shops. There is no
// interior art in the packs the game uses, so this is drawn here in the same palette as the shop buildings (town.ts)
// and at the same scale: every piece is painted on a 16px grid and doubled to the 32px map grid.
// Run with `npm run tilesets`; the output is committed. Where each piece sits is `INTERIOR` in catalog.ts.

import path from 'node:path';
import { writePng, ROOT, type Image } from './image';
import { INTERIOR } from './catalog';
import { ACCENT, EMBLEMS, INK, LIGHT } from './emblems';

type RGB = [number, number, number];
const OUT = path.join(ROOT, 'public/tilesets/interior.png');

// Palette: the browns and creams of the building art.
const PLANK: RGB = [166, 124, 86];
const PLANK_LIGHT: RGB = [186, 144, 102];
const PLANK_DARK: RGB = [118, 84, 58];
const PLASTER: RGB = [226, 208, 160];
const PLASTER_DARK: RGB = [206, 184, 134];
const BEAM: RGB = [126, 92, 62];
const BEAM_DARK: RGB = [88, 62, 44];
const MAT: RGB = [96, 70, 54];
const MAT_LIGHT: RGB = [128, 96, 70];

/** A drawing area at the pack's 16px scale; `toSheet` doubles it onto the output sheet. */
class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }
  set(x: number, y: number, [r, g, b]: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Draw `rows` (one string per row) with `colors` by character; '.' and unknown characters stay transparent. */
  sprite(x: number, y: number, rows: string[], colors: Record<string, RGB>) {
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        const c = colors[ch];
        if (c) this.set(x + i, y + j, c);
      }),
    );
  }
}

/** Fixed pseudo-noise in 0..1 (no PRNG state, so the sheet is the same every run). */
const noise = (x: number, y: number, seed = 0) => ((((x * 7919) ^ (y * 104729) ^ (seed * 31337)) >>> 3) % 97) / 97;
const shade = ([r, g, b]: RGB, d: number): RGB => [r + d, g + d, b + d];

/** A 16x16 wooden floor: 4px planks, each with its own joints, so the tile repeats without visible seams. */
function planks(seed: number): Canvas {
  const c = new Canvas(16, 16);
  for (let y = 0; y < 16; y++) {
    const row = Math.floor(y / 4);
    const joint = (row * 5 + seed * 3) % 16;
    for (let x = 0; x < 16; x++) {
      const base = y % 4 === 3 ? PLANK_DARK : noise(x, y, seed) > 0.8 ? PLANK_LIGHT : PLANK;
      c.set(x, y, x === joint ? PLANK_DARK : shade(base, Math.round((noise(x, y + 40, seed) - 0.5) * 8)));
    }
  }
  return c;
}

/** Plaster wall: `upper` has the crown beam along the top, the lower one the baseboard along the bottom. */
function wall(upper: boolean): Canvas {
  const c = new Canvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      c.set(x, y, noise(x, y, 3) > 0.82 ? PLASTER_DARK : shade(PLASTER, Math.round((noise(x, y + 9, 3) - 0.5) * 6)));
    }
  }
  if (upper) {
    c.rect(0, 0, 16, 3, BEAM);
    c.rect(0, 3, 16, 1, BEAM_DARK);
  } else {
    c.rect(0, 12, 16, 4, BEAM);
    c.rect(0, 12, 16, 1, BEAM_DARK);
  }
  return c;
}

/** A woven doormat. */
function mat(): Canvas {
  const c = new Canvas(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) c.set(x, y, (x + y) % 4 < 2 ? MAT : MAT_LIGHT);
  return c;
}

/** The counter: a wooden top you see from above (back edge) over a panelled front, `cells` wide. */
function counter(cells: number): Canvas {
  const w = cells * 16;
  const c = new Canvas(w, 24);
  c.rect(0, 0, w, 8, PLANK_LIGHT); // the top
  c.rect(0, 0, w, 1, BEAM_DARK);
  c.rect(0, 7, w, 1, PLANK_DARK);
  c.rect(0, 8, w, 16, PLANK); // the front
  for (let x = 0; x < w; x += 16) {
    c.rect(x + 2, 11, 12, 10, PLANK_DARK); // a panel
    c.rect(x + 3, 12, 10, 8, PLANK);
  }
  c.rect(0, 22, w, 2, BEAM_DARK);
  return c;
}

const COLORS = {
  i: INK,
  w: [150, 112, 80] as RGB,
  s: [200, 204, 214] as RGB, // steel
  g: [226, 184, 70] as RGB, // gold
  r: [196, 64, 52] as RGB,
  b: [74, 130, 200] as RGB,
  l: [64, 170, 92] as RGB,
  p: [140, 90, 200] as RGB, // violet
  e: [236, 236, 226] as RGB, // glass shine
};
type Shelf = 'smithy' | 'armory' | 'ranger' | 'apothecary' | 'wizard';
/** Each shelf holds a row of one kind of ware, 6x8 pixels each, three to a shelf. */
const WARES: Record<Shelf, string[][]> = {
  smithy: [
    ['...s....', '...s....', '...s....', '...s....', '..gsg...', '...w....', '...w....', '........'],
    ['.ssss...', 'sggggs..', 'sgiiigs.', 'sgiiigs.', '.sggs...', '..ss....', '........', '........'],
  ],
  armory: [
    ['..ssss..', '.sssssi.', '.ss..ssi', '.s....si', '........', '........', '........', '........'],
    ['.ssssss.', 'ssggggss', 'sssssss.', '.sssss..', '..sss...', '........', '........', '........'],
  ],
  ranger: [
    ['.ww.....', 'w..w....', 'w..w.s..', 'w..wss..', 'w..w.s..', 'w..w....', '.ww.....', '........'],
    ['.bbb....', 'bbbbb...', 'bwwwb...', '.www....', '.www....', '........', '........', '........'],
  ],
  wizard: [
    ['........', '.pppppp.', '.pgggwp.', '.pppppp.', '.pwwwwp.', '.pppppp.', '........', '........'],
    ['......g.', '.....ggg', '....w.g.', '...w....', '..w.....', '.w......', '........', '........'],
  ],
  apothecary: [
    ['..ee....', '..ii....', '.irri...', 'irrrri..', 'irrrri..', '.iiii...', '........', '........'],
    ['..ee....', '..ii....', '.ilii...', 'illlli..', 'illlli..', '.iiii...', '........', '........'],
  ],
};

/** A shelf unit 3 cells wide and 2 tall (48x32 px at 16px scale): frame, two shelves of wares. */
function shelf(kind: Shelf): Canvas {
  const c = new Canvas(48, 32);
  c.rect(0, 0, 48, 32, BEAM_DARK);
  c.rect(2, 2, 44, 28, shade(BEAM, -12));
  for (const y of [14, 28]) {
    c.rect(2, y, 44, 2, PLANK_LIGHT); // the board
    c.rect(2, y + 2, 44, 1, BEAM_DARK);
  }
  const wares = WARES[kind];
  for (let row = 0; row < 2; row++) {
    for (let n = 0; n < 4; n++) {
      const ware = wares[(n + row) % wares.length];
      if (ware)
        c.sprite(
          4 + n * 11,
          row * 14 + 4 - 2 + 0,
          ware.map((r) => r.slice(0, 8)),
          COLORS,
        );
    }
  }
  return c;
}

/** The sign over the counter: a wooden board with the shop's emblem in it, 4 cells wide and 2 tall. */
function sign(kind: string): Canvas {
  const c = new Canvas(64, 32);
  c.rect(0, 0, 64, 32, BEAM_DARK);
  c.rect(2, 2, 60, 28, BEAM);
  c.rect(4, 4, 56, 24, LIGHT);
  const rows = EMBLEMS[kind];
  const accent = ACCENT[kind] ?? INK;
  if (rows) {
    const scale = 3;
    const ox = 32 - (8 * scale) / 2;
    const oy = 16 - (rows.length * scale) / 2;
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        const color = ch === '#' ? INK : ch === 'x' || ch === '>' ? accent : null;
        if (color) c.rect(ox + i * scale, oy + j * scale, scale, scale, color);
      }),
    );
  }
  return c;
}

// --- Lay the pieces out on the sheet (positions in INTERIOR, catalog.ts) and double them. ---------------------------
const pieces: Record<keyof typeof INTERIOR, Canvas> = {
  planksA: planks(1),
  planksB: planks(2),
  wallTop: wall(true),
  wallBase: wall(false),
  mat: mat(),
  counter: counter(4),
  shelfSmithy: shelf('smithy'),
  shelfArmory: shelf('armory'),
  shelfRanger: shelf('ranger'),
  shelfApothecary: shelf('apothecary'),
  shelfWizard: shelf('wizard'),
  signSmithy: sign('smithy'),
  signArmory: sign('armory'),
  signRanger: sign('ranger'),
  signApothecary: sign('apothecary'),
  signWizard: sign('wizard'),
};

const width = Math.max(...Object.values(INTERIOR).map((p) => p.x + p.w));
const height = Math.max(...Object.values(INTERIOR).map((p) => p.y + p.h));
const sheet: Image = { width, height, data: Buffer.alloc(width * height * 4) };
for (const [name, at] of Object.entries(INTERIOR)) {
  const src = pieces[name as keyof typeof INTERIOR];
  if (src.w * 2 !== at.w || src.h * 2 !== at.h) {
    throw new Error(`${name} is ${src.w * 2}x${src.h * 2} when doubled but INTERIOR says ${at.w}x${at.h}`);
  }
  for (let y = 0; y < at.h; y++) {
    for (let x = 0; x < at.w; x++) {
      const i = (Math.floor(y / 2) * src.w + Math.floor(x / 2)) * 4;
      if (src.data[i + 3] === 0) continue;
      Buffer.from(src.data.buffer, i, 4).copy(sheet.data, ((at.y + y) * width + at.x + x) * 4);
    }
  }
}
writePng(OUT, sheet);
console.log(`wrote interior.png (${width}x${height})`);
