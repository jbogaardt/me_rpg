import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { neighbours, ZONE_LINKS, ZONE_NAMES } from '../../src/systems/places';

const dir = path.join(__dirname, '../../public/maps');
const doorsOf = (zone: string): string[] =>
  (
    JSON.parse(fs.readFileSync(path.join(dir, `${zone}.json`), 'utf8')) as { doors: { to: { zone: string } }[] }
  ).doors.map((d) => d.to.zone);

describe('places against the built maps', () => {
  it('names every zone there is', () => {
    for (const file of fs.readdirSync(dir)) expect(ZONE_NAMES[file.replace('.json', '')], file).toBeTruthy();
  });

  it('links exactly the zones the maps have doors between', () => {
    // The training halls are reached by the trainer's magic, not on foot, so only their way out is a door.
    const walkable = (zone: string) => !zone.startsWith('training_');
    for (const zone of Object.keys(ZONE_NAMES).filter(walkable)) {
      expect(neighbours(zone).sort(), zone).toEqual([...new Set(doorsOf(zone))].filter(walkable).sort());
    }
    expect(ZONE_LINKS.length).toBeGreaterThan(10);
  });
});
