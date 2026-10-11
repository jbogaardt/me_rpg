// Small building blocks several zone specs share (kept out of maps/, where every file is a zone).

import type { ZoneApi } from './zone';

/** A short wall of rocks with open ends: `len` cells from (col, row), going east (or south when `vertical`). */
export function ridge(
  z: ZoneApi,
  col: number,
  row: number,
  len: number,
  vertical = false,
  kind: 'rockB' | 'rockC' | 'frostRockB' | 'frostRockC' = 'rockB',
) {
  for (let i = 0; i < len; i++) {
    const alt = kind.startsWith('frost') ? (i % 2 ? 'frostRockC' : 'frostRockB') : i % 2 ? 'rockC' : 'rockB';
    z.prop(alt, col + (vertical ? 0 : i), row + (vertical ? i : 0));
  }
}
