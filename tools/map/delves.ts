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

/** The Sunscar Hollow's deeper tunnel (`caveHole` in its far chamber): the door sits on the hole's middle cell, and a player coming back up stands just below it. */
export const HOLLOW_HOLE = { col: 47, row: 32 } as const;
export const hollowReturn = () => ({ zone: 'cave_sunscar', col: HOLLOW_HOLE.col, row: HOLLOW_HOLE.row + 1 });
/** Where a player appears in the Sunscar Depths (under the way back up). */
export const DEPTHS_ARRIVAL = { col: 52, row: 6 } as const;

/** The arched door in the north-east room of the Lanternrest sewers, to the Undercroft below. A player coming back stands just under it. */
export const UNDERCROFT_DOOR = { col: 40, row: 3 } as const;
export const undercroftReturn = () => ({
  zone: 'sewer_lanternrest',
  col: UNDERCROFT_DOOR.col,
  row: UNDERCROFT_DOOR.row + 1,
});
/** Where a player appears in the Undercroft (under its doorway). */
export const UNDERCROFT_ARRIVAL = { col: 26, row: 4 } as const;

/** The tomb at the back of the Barrow Lands' graveyard (`tombB`, 2x3: its bottom-left cell); the door is that cell. */
export const CRYPT_TOMB = { col: 141, row: 83 } as const;
/** Where a player appears in the open air when they climb out of the Barrow Deep: the ash just below the tomb. */
export const cryptExit = () => ({ zone: 'undead', ...W.toLocal('undead', CRYPT_TOMB.col, CRYPT_TOMB.row + 1) });
/** Where a player appears in the Barrow Deep (under the way out). */
export const CRYPT_ARRIVAL = { col: 12, row: 5 } as const;
