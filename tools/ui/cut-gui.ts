// Cuts the UI pieces in src/ui/ out of Lamoot's "RPG GUI construction kit v1.0" (CC-BY 3.0, see
// CREDITS.md) at art/rpg_gui_v1/RPG_GUI_v1.png. Re-run with `npx tsx tools/ui/cut-gui.ts` after changing a cut.
//
// Coordinates come from measuring the sheet (each piece has a ~2px soft shadow on every side, included).
// The kit's frames are loose corners and rails with gaps between them, so `frame` stitches them into a
// closed frame usable as a CSS border-image.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from '../map/image';

const sheet = readPng(path.join(ROOT, 'art/rpg_gui_v1/RPG_GUI_v1.png'));
const OUT = path.join(ROOT, 'src/ui');

function crop(x: number, y: number, w: number, h: number): Image {
  const out: Image = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let r = 0; r < h; r++)
    sheet.data.copy(out.data, r * w * 4, ((y + r) * sheet.width + x) * 4, ((y + r) * sheet.width + x + w) * 4);
  return out;
}

const px = (img: Image, x: number, y: number) => (y * img.width + x) * 4;

interface FrameCut {
  x: number; // outer bounds of the whole frame on the sheet, shadow included
  y: number;
  w: number;
  h: number;
  band: number; // rail thickness incl. shadow
  hGaps: [number, number][]; // sheet x ranges between corners and the top/bottom rails
  vGaps: [number, number][]; // sheet y ranges between corners and the side rails
  railX: number; // a sheet column in the middle of the top/bottom rails
  railY: number; // a sheet row in the middle of the side rails
  ornament: [number, number, number, number]; // the loose "+" piece inside, removed
}

function frame(c: FrameCut): Image {
  const img = crop(c.x, c.y, c.w, c.h);
  const [ox, oy, ow, oh] = c.ornament;
  for (let y = oy - 2; y < oy + oh + 2; y++)
    for (let x = ox - 2; x < ox + ow + 2; x++)
      img.data.fill(0, px(img, x - c.x, y - c.y), px(img, x - c.x, y - c.y) + 4);
  // Bridge the gaps by repeating a slice of the rail.
  for (const top of [0, c.h - c.band]) {
    for (const [x0, x1] of c.hGaps) {
      for (let x = x0; x < x1; x++) {
        for (let y = top; y < top + c.band; y++)
          img.data.copy(img.data, px(img, x - c.x, y), px(img, c.railX - c.x, y), px(img, c.railX - c.x, y) + 4);
      }
    }
  }
  for (const left of [0, c.w - c.band]) {
    for (const [y0, y1] of c.vGaps) {
      for (let y = y0; y < y1; y++) {
        for (let x = left; x < left + c.band; x++)
          img.data.copy(img.data, px(img, x, y - c.y), px(img, x, c.railY - c.y), px(img, x, c.railY - c.y) + 4);
      }
    }
  }
  // Drop the 2px outer shadow so a panel's background can run right under the rails (CSS adds its own shadow).
  const out: Image = { width: c.w - 4, height: c.h - 4, data: Buffer.alloc((c.w - 4) * (c.h - 4) * 4) };
  for (let y = 0; y < out.height; y++)
    img.data.copy(out.data, y * out.width * 4, px(img, 2, y + 2), px(img, 2 + out.width, y + 2));
  return out;
}

const pieces: Record<string, Image> = {
  // Thick gold frame for panels (menu, dialog): rails are 15px thick, so CSS border-image-slice 15.
  'frame.png': frame({
    x: 856,
    y: 189,
    w: 146,
    h: 129,
    band: 17,
    hGaps: [
      [880, 893],
      [966, 978],
    ],
    vGaps: [
      [213, 227],
      [282, 294],
    ],
    railX: 930,
    railY: 255,
    ornament: [914, 237, 31, 31],
  }),
  // Thin gold frame (HUD, menu pages): rails are 10px thick, border-image-slice 10.
  'frame-thin.png': frame({
    x: 865,
    y: 398,
    w: 136,
    h: 119,
    band: 12,
    hGaps: [
      [884, 899],
      [973, 982],
    ],
    vGaps: [
      [417, 428],
      [487, 498],
    ],
    railX: 936,
    railY: 457,
    ornament: [923, 444, 26, 26],
  }),
  'plank.png': crop(11, 124, 289, 60), // wooden plank with gold trim and arrow caps (tabs)
  'plank-dim.png': crop(11, 358, 289, 60), // faded variant (inactive tab)
  'button.png': crop(115, 448, 86, 86), // big square wooden button (A/B)
  'button-small.png': crop(36, 485, 50, 50), // small square button (menu, close)
  'arrow-left.png': crop(376, 255, 40, 42), // D-pad arrows
  'arrow-up.png': crop(458, 255, 42, 40),
  'arrow-right.png': crop(538, 254, 40, 42),
  'arrow-down.png': crop(614, 256, 42, 40),
};

for (const [name, img] of Object.entries(pieces)) {
  writePng(path.join(OUT, name), img);
  console.log(`src/ui/${name} ${img.width}x${img.height}`);
}
