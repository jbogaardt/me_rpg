import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { LANDMARK_ATLAS } from '../systems/landmarkAtlas';
import { RUIN_FRAMES, type LandmarkShape } from '../systems/landmarks';

// A landmark the DM's telling names (a wagon, a well, a camp, a church...), drawn at its goal so the party finds what it was
// told of. Scenery only: walkable, nothing to touch (the quest counts reaching the place). Local to each page; the shapes
// are picked by `systems/landmarks.ts`. Drawn with the feet at the origin, like a map object. **All of it is stored pixel
// art, never drawn in code**: the grave is the LPC headstone (`graves`), the ruin a snapped pillar, an idol and rubble
// (`ruins`), and every other shape a piece of `landmarks.png` (built by tools/map/landmarks.ts from two LPC packs, frames
// in `landmarkAtlas.ts`). A new landmark is a piece in that script, a frame here and a word in `landmarks.ts`.
// The headstone's frame is the one `graveRoundA` of tools/map/catalog.ts cuts.

/** The sheets a landmark is cut from. */
export interface LandmarkSheets {
  graves: Texture;
  ruins: Texture;
  landmarks: Texture;
}

/** Seconds a flame of the campfire holds before the next of its three. */
const FLAME_SECONDS = 0.14;

const FLAMES = ['fire0', 'fire1', 'fire2'] as const;

export class Landmark extends Container {
  constructor(
    readonly shape: LandmarkShape,
    x: number,
    y: number,
    sheets: LandmarkSheets,
  ) {
    super();
    this.position.set(x, y);
    this.zIndex = y;
    this.addChild(
      shape === 'grave'
        ? headstone(sheets.graves)
        : shape === 'ruin'
          ? drawRuin(sheets.ruins)
          : piece(shape, sheets.landmarks),
    );
  }
}

/** A piece's frame cut from a sheet, standing on the origin (anchor at the bottom centre). */
function sprite(sheet: Texture, f: { x: number; y: number; w: number; h: number }, at = 0): Sprite {
  const s = new Sprite(new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
  s.anchor.set(0.5, 1);
  s.x = at;
  return s;
}

function headstone(sheet: Texture): Sprite {
  return sprite(sheet, { x: 64, y: 0, w: 31, h: 32 });
}

/** A snapped pillar and a standing idol, with a tumbled block between, cut from the LPC Jungle Ruins art. */
function drawRuin(sheet: Texture): Container {
  const c = new Container();
  c.addChild(
    sprite(sheet, RUIN_FRAMES.pillar, -22),
    sprite(sheet, RUIN_FRAMES.idol, 20),
    sprite(sheet, RUIN_FRAMES.rubble),
  );
  return c;
}

/** The sheet's piece for `shape`; the campfire cycles through its three flames. */
function piece(shape: Exclude<LandmarkShape, 'grave' | 'ruin'>, sheet: Texture): Sprite {
  if (shape !== 'campfire') return sprite(sheet, LANDMARK_ATLAS[ART[shape]]);
  const flames = FLAMES.map((name) => sprite(sheet, LANDMARK_ATLAS[name]).texture);
  const s = sprite(sheet, LANDMARK_ATLAS.fire0);
  s.onRender = () => {
    s.texture = flames[Math.floor(performance.now() / 1000 / FLAME_SECONDS) % flames.length]!;
  };
  return s;
}

/** Which piece of the sheet each shape is drawn from. */
const ART = {
  cart: 'cart',
  well: 'well',
  tent: 'tent',
  shrine: 'shrine',
  tower: 'tower',
  belltower: 'belltower',
  church: 'church',
  hut: 'hut',
  campfire: 'fire0',
} as const satisfies Record<Exclude<LandmarkShape, 'grave' | 'ruin'>, keyof typeof LANDMARK_ATLAS>;
