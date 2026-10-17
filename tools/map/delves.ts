// Where the caves and sewers join the open-air world. Shared by both ends of each doorway: the overworld spec (which draws
// the way in) and the underground room (whose door leads back out), so neither imports the other.

import layout from '../../maps/world';
import { worldOf } from './world';

const W = worldOf(layout);

/** The cave mouth in the Sunscar Desert: its bottom-left cell (2x2, `caveMouth`). The dark opening, and the door, are its right cell. */
export const CAVE_MOUTH = { col: 66, row: 14 } as const;
/** Where a player appears in the desert when they climb out of the cave: the sand just below the opening. */
export const caveExit = () => ({ zone: 'desert', ...W.toLocal('desert', CAVE_MOUTH.col + 1, CAVE_MOUTH.row + 1) });
/** Where a player appears inside the cave (just below the way out). */
export const CAVE_ARRIVAL = { col: 14, row: 5 } as const;

/** The sewer hatch in Lanternrest's market (world cell of the drain). */
export const SEWER_HATCH = { col: 172, row: 209 } as const;
/** Where a player appears in the town when they climb out of the sewer: the cell below the hatch. */
export const sewerExit = () => ({ zone: 'town', ...W.toLocal('town', SEWER_HATCH.col, SEWER_HATCH.row + 1) });
/** Where a player appears in the sewer (just below its doorway). */
export const SEWER_ARRIVAL = { col: 24, row: 4 } as const;
