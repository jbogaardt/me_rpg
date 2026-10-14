// A ContentSource that builds a random campaign: it reads the pack index and every pack it lists, assembles them with
// a seed (packs.ts) and serves the resulting files. Pixi-free; how a pack file is fetched is the caller's.
import type { ContentSource } from './ContentManager';
import type { ContentFile } from './schema';
import type { Assembly, Pack } from './packs';
import { assemble } from './world';

/** public/content/packs/index.json: the packs a random campaign is made from. */
export interface PackIndex {
  version: number;
  packs: string[];
}

export class AssembledSource implements ContentSource {
  /** What the seed made (the arc, keeper, regions, foes) once the packs are in. */
  readonly assembly: Promise<Assembly>;

  constructor(seed: number, load: (name: string) => Promise<unknown>) {
    this.assembly = (async () => {
      const index = (await load('index')) as PackIndex;
      const packs = (await Promise.all(index.packs.map((id) => load(id)))) as Pack[];
      return assemble(seed, packs);
    })();
  }

  async fetch(file: ContentFile): Promise<unknown> {
    return (await this.assembly).files[file];
  }
}
