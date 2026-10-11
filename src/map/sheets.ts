import { Assets, type Texture } from 'pixi.js';
import { parseMap, type MapData } from './types';

export const tilesetUrl = (name: string) => `${import.meta.env.BASE_URL}tilesets/${name}`;
export const MAP_URL = `${import.meta.env.BASE_URL}maps/overworld.json`;

export async function loadSheets(names: string[]): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>();
  await Promise.all(
    names.map(async (name) => {
      textures.set(name, await Assets.load<Texture>(tilesetUrl(name))); // nearest-neighbour via TextureStyle default (main.ts)
    }),
  );
  return textures;
}

export async function fetchMap(url = MAP_URL): Promise<MapData> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return parseMap(await res.json());
}
