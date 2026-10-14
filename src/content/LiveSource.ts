// A ContentSource for a live world (content/world.ts): it reads the pack index and every pack it lists, opens a World
// with the seed (and the arc, if one is named) and serves the world's files as they stand. The World itself is kept,
// so the game can grow it as its Dungeon Master chooses the story (scenes/overworld/Story.ts). Pixi-free.
import type { ContentSource } from './ContentManager';
import type { ContentFile } from './schema';
import type { Pack } from './packs';
import type { PackIndex } from './AssembledSource';
import { World } from './world';
import type { Outfit } from '../sprites/doll';

export class LiveSource implements ContentSource {
  readonly world: Promise<World>;

  constructor(seed: number, load: (name: string) => Promise<unknown>, arc?: string) {
    this.world = (async () => {
      const index = (await load('index')) as PackIndex;
      const packs = (await Promise.all(index.packs.map((id) => load(id)))) as Pack[];
      const world = new World(seed, packs);
      world.open(arc);
      return world;
    })();
  }

  async fetch(file: ContentFile): Promise<unknown> {
    return (await this.world).files()[file];
  }
}

/** Every look a live world's people and foes may come to wear: whatever the story adds later is then already loaded. */
export const worldLooks = (world: World): Outfit[] =>
  Object.values(world.cat.entities).flatMap((e) => (e.sprite ? [e.sprite as Outfit] : []));
