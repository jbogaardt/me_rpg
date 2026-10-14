import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMap, type MapData } from '../../src/map/types';
import { checkCampaigns, checkContent } from './check';
import { loadContentFromDisk } from './disk';

const MAPS = path.resolve(import.meta.dirname, '../../public/maps');
const maps = new Map<string, MapData>(
  fs
    .readdirSync(MAPS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), parseMap(JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8')))]),
);

describe('the content against the built maps', () => {
  it('passes, for every campaign', () => {
    expect(checkCampaigns(maps).errors).toEqual([]);
  });

  it('catches a placement on a wall, a missing map and stale tilesets', () => {
    const content = loadContentFromDisk();
    const green = maps.get('greenwood')!;
    const wall = green.collision[0];
    const node = content.getScenario('greenwood');
    node.entities.push({ entity: 'goblin', x: wall % green.width, y: Math.floor(wall / green.width) });
    content.getBiomeInfo('town').tilesets = ['nothing.png'];
    content.getBiomeInfo('desert').map = 'sahara';
    content.getBiomeInfo('beach').links.push('marsh');
    const errors = checkContent(content, maps).errors.join('\n');
    expect(errors).toMatch(
      /nodes\.greenwood\.entities\[\d+\] \(goblin at .*\) is (on a blocked cell|in the neighbouring biome)/,
    );
    expect(errors).toMatch(/biomes\.town\.tilesets differ/);
    expect(errors).toMatch(/biomes\.desert\.map: no map "sahara"/);
    expect(errors).toMatch(/biomes\.beach\.links: linked to \[.*marsh.*\], but its doors lead to/);
  });
});
