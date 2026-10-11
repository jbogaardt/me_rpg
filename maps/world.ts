import type { WorldLayout } from '../tools/map/world';

// The open-air world, after the hand-drawn map: one character per 7x7 cells, 34 x 23 squares = 238 x 161 cells.
// Each letter is a biome, its own zone built by maps/<name>.ts in these world cells (see tools/map/world.ts). Biomes
// own their squares exactly, so neighbouring borders always meet; every border is walled on both sides except at
// the gaps below, which get a door on each side. `npm run map -- check` proves it (checkSeams).
//
//   col: 0         1         2         3
//        0123456789012345678901234567890123
export default {
  square: 7,
  rows: [
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWW', // 0
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWW', // 1
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWW', // 2
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWW', // 3
    'DDDDDDDDDDDDBBBBBBBBBJJJJJJWWWWWWW', // 4
    'DDDDDDDDDDDDBBBBBBUUUUJJJJJJWWWWWW', // 5
    'DDDDDDDDDDFUUUUUUUUUUUJJJJJJWWWWWW', // 6
    'DDDDDDDFFFFUUUUUUUUUUUJJJJJJMMMMWW', // 7
    'DDDDDDFFFFFUUUUUUUUUUUJJJJJJMMMMWW', // 8
    'DDDDDDFFFFFUUUUUUUUUUUJJJJJJMMMMWW', // 9
    'DDDDDFFFFFFUUUUUUUUUUUJJJJJJSSSSSS', // 10
    'DDDFFFFFFFFFFFFFFFFFFEEEEEEESSSSSS', // 11
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSS', // 12
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSS', // 13
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSS', // 14
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSS', // 15
    'FFFFFFFFFFFFFFFFFFFFFEEEESSSSSSSSS', // 16
    'FFFFFFFFFFFFFFFTTTTTTEEEESSSSSSSSS', // 17
    'FFFFFFFFFFFFFFTTTTTTTEEESSSSSSSSSS', // 18
    'FFFFFFFFFFFTTTTTTTTTTEEESSSSSSSSSS', // 19
    'FFFFFFFFFFFTTTTTTTTTTEESSSSSSSSSSS', // 20
    'FFFFFFFFFFTTTTTTTTTTTSSSSSSSSSSSSS', // 21
    'FFFFFFFFFFTTTTTTTTTTTSSSSSSSSSSSSS', // 22
  ],
  key: {
    D: 'desert',
    B: 'beach',
    J: 'jungle',
    W: 'wetlands',
    U: 'undead',
    M: 'marsh',
    F: 'greenwood',
    E: 'eastwood',
    S: 'frostlands',
    T: 'town',
  },
  // Each gap: a square and the side of it that opens into the neighbouring biome (a 3-cell corridor, centred unless
  // `offset` moves it along that side). Keep a gap at least WALL cells from a corner of the border, or its corridor
  // runs into the wall of the turn (`npm run map -- layout <biome>` shows the walls, `=` the gaps).
  gaps: [
    { at: [17, 17], side: 'n' }, // town -> greenwood (north road)
    { at: [11, 19], side: 'w', offset: 4 }, // town -> greenwood (west gate)
    { at: [20, 21], side: 'e', offset: 4 }, // town -> frostlands
    { at: [1, 11], side: 's' }, // desert -> greenwood
    { at: [15, 10], side: 's' }, // undead lands -> greenwood
    { at: [20, 13], side: 'e' }, // greenwood -> eastwood
    { at: [27, 13], side: 'e' }, // eastwood -> frostlands
    { at: [24, 10], side: 's' }, // jungle -> eastwood
    { at: [13, 2], side: 'e' }, // desert -> beach
    { at: [19, 4], side: 's' }, // beach -> undead lands
    { at: [19, 2], side: 'e' }, // beach -> jungle
    { at: [21, 8], side: 'e' }, // undead lands -> jungle
    { at: [23, 2], side: 'e' }, // jungle -> wetlands
    { at: [27, 8], side: 'e' }, // jungle -> marsh
    { at: [30, 6], side: 's' }, // wetlands -> marsh
    { at: [30, 9], side: 's' }, // marsh -> frostlands
  ],
} satisfies WorldLayout;
