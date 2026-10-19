// Draws Towercraft's lane (towercraft/public/art/lane.png) with Me RPG's own map pipeline: grass ground and a dirt road
// painted on cell corners, so every bend, edge and inner corner gets the real LPC autotile blend (tools/map/terrain.ts).
// Both players' lanes are the same road (towercraft/src/sim/board.ts), so one picture serves both.
// Run `npm run towercraft:board` after changing the road.

import path from 'node:path';
import { COLS, ROWS, WAYPOINTS } from '../towercraft/src/sim/board';
import { ROOT, renderMap, writePng } from './map/image';
import { Zone, type Rect } from './map/zone';

export function laneZone(): Zone {
  const z = new Zone(COLS, ROWS);
  z.fill('grass');
  const runs: Rect[] = [];
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [c0, r0] = WAYPOINTS[i];
    const [c1, r1] = WAYPOINTS[i + 1];
    runs.push({ col: Math.min(c0, c1), row: Math.min(r0, r1), w: Math.abs(c1 - c0) + 1, h: Math.abs(r1 - r0) + 1 });
  }
  z.paint('dirt', runs);
  z.spawn(WAYPOINTS[0][0], WAYPOINTS[0][1]); // a map needs one; it is not drawn
  return z;
}

if (process.argv[1] === import.meta.filename) {
  const out = path.join(ROOT, 'towercraft/public/art/lane.png');
  writePng(out, renderMap(laneZone().toMapData()));
  console.log(`wrote ${path.relative(ROOT, out)}`);
}
