// A wayfarers' camp: a canvas tent, a hut, a well, a hand cart, a fire and a quartermaster who sells supplies, set in a
// cleared ring (pieces are the quest landmarks' stored pixel art, `landmarks.png`). A biome spec calls `camp` once; the
// content keeps foes out of it (a roam rule's `avoid`, `public/content/campaign1/biomes.json`).

import type { BiomeApi } from './world';

/** Lay a camp centred on (c, r): `shop` is the quartermaster's shop (items.json), `name` the place the map shows. */
export function camp(z: BiomeApi, c: number, r: number, shop: string, name: string) {
  z.keepClear({ col: c - 12, row: r - 9, w: 26, h: 18 });
  z.prop('campTent', c - 9, r);
  z.prop('campHut', c + 6, r);
  z.prop('campWell', c + 11, r + 3);
  z.prop('campCart', c + 3, r + 6);
  z.prop('campFire', c - 1, r + 5);
  z.prop('campShrine', c + 9, r + 6);
  z.prop('barrel', c + 1, r + 4);
  z.prop('barrel', c + 2, r + 4);
  z.shop(shop, c - 3, r + 7); // the quartermaster, by the fire
  z.keepFree(c - 3, r + 8);
  z.place(name, c, r + 2);
}
