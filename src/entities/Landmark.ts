import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { RUIN_FRAMES, type LandmarkShape } from '../systems/landmarks';

// A landmark the DM's telling names (a wagon, a well, a camp...), drawn small at its goal so the party finds what it was
// told of. Scenery only: walkable, nothing to touch (the quest counts reaching the place). Local to each page; the shapes
// are picked by `systems/landmarks.ts`. Drawn with the feet at the origin, a cell or two wide, like a map object. The
// grave is the real headstone art (the LPC grave markers sheet, passed in as `graves`); the rest are small Graphics.
// The headstone's frame is the one `graveRoundA` of tools/map/catalog.ts cuts.

export class Landmark extends Container {
  constructor(
    readonly shape: LandmarkShape,
    x: number,
    y: number,
    graves?: Texture,
    /** The ruins sheet (public/tilesets/ruins.png): a `ruin` is drawn from its art, or as a sketch without it. */
    ruins?: Texture,
  ) {
    super();
    this.position.set(x, y);
    this.zIndex = y;
    this.addChild(
      shape === 'grave' && graves ? headstone(graves) : shape === 'ruin' && ruins ? drawRuin(ruins) : draw(shape),
    );
  }
}

function headstone(sheet: Texture): Sprite {
  const s = new Sprite(new Texture({ source: sheet.source, frame: new Rectangle(64, 0, 31, 32) }));
  s.anchor.set(0.5, 1);
  return s;
}

/** A snapped pillar and a standing idol, with a tumbled block between, cut from the LPC Jungle Ruins art. */
function drawRuin(sheet: Texture): Container {
  const c = new Container();
  const piece = (f: { x: number; y: number; w: number; h: number }, at: number) => {
    const s = new Sprite(new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    s.anchor.set(0.5, 1); // feet at the origin, like every landmark
    s.x = at;
    c.addChild(s);
  };
  piece(RUIN_FRAMES.pillar, -22);
  piece(RUIN_FRAMES.idol, 20);
  piece(RUIN_FRAMES.rubble, 0);
  return c;
}

function draw(shape: LandmarkShape): Graphics {
  const g = new Graphics();
  const wood = 0x7a5230;
  const dark = 0x3b2a1a;
  switch (shape) {
    case 'cart': // a wagon with a canvas load and a wheel, one wheel broken off
      g.rect(-22, -22, 44, 14).fill(wood).stroke({ color: dark, width: 1 });
      g.ellipse(0, -26, 18, 9).fill(0xd8cbab).stroke({ color: dark, width: 1 });
      g.circle(-14, -6, 8).stroke({ color: dark, width: 3 }).circle(-14, -6, 2).fill(dark);
      g.poly([10, -2, 20, -10, 22, -6, 14, 2]).fill(wood); // the broken wheel, leaning
      g.rect(22, -12, 12, 3).fill(wood); // the shaft
      break;
    case 'well':
      g.ellipse(0, -2, 15, 7).fill(0x8d8f93).stroke({ color: dark, width: 1 });
      g.ellipse(0, -7, 11, 4).fill(0x1d2a38);
      g.rect(-13, -26, 3, 22).fill(wood).rect(10, -26, 3, 22).fill(wood);
      g.poly([-16, -26, 0, -36, 16, -26]).fill(0x9a4a2a).stroke({ color: dark, width: 1 });
      break;
    case 'campfire':
      for (const a of [0, 1, 2, 3, 4, 5]) g.circle(Math.cos(a) * 13, -3 + Math.sin(a) * 5, 3).fill(0x77797d);
      g.rect(-10, -6, 20, 4).fill(dark).rect(-3, -9, 6, 5).fill(wood);
      g.poly([-7, -6, 0, -26, 7, -6]).fill(0xe8682f).poly([-3, -6, 0, -17, 3, -6]).fill(0xffd25a);
      break;
    case 'tent':
      g.poly([-22, 0, 0, -30, 22, 0]).fill(0xb89a62).stroke({ color: dark, width: 1 });
      g.poly([-6, 0, 0, -16, 6, 0]).fill(dark);
      break;
    case 'shrine':
      g.rect(-12, -4, 24, 4).fill(0x8d8f93).rect(-8, -8, 16, 4).fill(0xa5a7ab);
      g.rect(-5, -30, 10, 22).fill(0xb9bbbf).stroke({ color: dark, width: 1 });
      g.circle(0, -34, 5).fill(0xb9bbbf).circle(0, -34, 2).fill(0xe7c15a);
      break;
    case 'grave':
      g.ellipse(0, -2, 14, 5).fill(0x4d3a26);
      g.roundRect(-7, -26, 14, 22, 6).fill(0x9a9da1).stroke({ color: dark, width: 1 });
      g.rect(-1, -22, 2, 10).fill(0x6d7074).rect(-4, -19, 8, 2).fill(0x6d7074);
      break;
    case 'ruin':
      g.rect(-22, -16, 10, 16).fill(0x8d8f93).rect(-10, -6, 12, 6).fill(0x7c7e82);
      g.poly([6, 0, 6, -30, 12, -26, 14, -32, 18, -28, 18, 0]).fill(0x9a9da1).stroke({ color: dark, width: 1 });
      g.rect(-24, 0, 48, 2).fill(0x5f6b4e);
      break;
    case 'tower':
      g.rect(-10, -38, 20, 38).fill(0x8d8f93).stroke({ color: dark, width: 1 });
      for (const x of [-10, -4, 2, 8]) g.rect(x, -43, 4, 5).fill(0x8d8f93);
      g.roundRect(-3, -14, 6, 14, 3).fill(dark).rect(-2, -30, 4, 6).fill(0x1d2a38);
      break;
    case 'hut':
      g.rect(-16, -16, 32, 16).fill(0xa98a5a).stroke({ color: dark, width: 1 });
      g.poly([-20, -14, 0, -32, 20, -14]).fill(0x8a5a2b).stroke({ color: dark, width: 1 });
      g.rect(-4, -12, 8, 12).fill(dark);
      break;
  }
  return g;
}
