import { Rectangle, Sprite, Texture } from 'pixi.js';
import type { IconKind } from '../systems/inventory';
import { ITEM_CELL, itemArtCell } from '../systems/itemArt';

// The item sheet as Pixi textures (the Pixi side of systems/itemArt.ts): assets.ts installs the loaded sheet once at boot,
// and the ground items and quest relics ask for a sprite by icon kind. No sheet or no cell for the kind gives undefined, so
// the caller draws its own shape.

let sheet: Texture | undefined;
const frames = new Map<IconKind, Texture>();

export function installItemSheet(texture: Texture) {
  sheet = texture;
  frames.clear();
}

/** A new sprite of the item picture for `kind` (32x32, anchored bottom-centre), if there is one. */
export function itemSprite(kind: IconKind): Sprite | undefined {
  const cell = itemArtCell(kind);
  if (!sheet || !cell) return undefined;
  let frame = frames.get(kind);
  if (!frame) {
    frame = new Texture({
      source: sheet.source,
      frame: new Rectangle(cell.col * ITEM_CELL, cell.row * ITEM_CELL, ITEM_CELL, ITEM_CELL),
    });
    frames.set(kind, frame);
  }
  const sprite = new Sprite(frame);
  sprite.anchor.set(0.5, 1);
  return sprite;
}
