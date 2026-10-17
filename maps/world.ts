import type { WorldLayout } from '../tools/map/world';

// The open-air world, after the hand-drawn map: one character per 10x10 cells, 62 x 23 squares = 620 x 230 cells.
// The borders wander off the squares (`wobble`, see tools/map/world.ts) so they look carved, not stepped.
// Each letter is a biome, its own zone built by maps/<name>.ts in these world cells (see tools/map/world.ts). Biomes
// own their squares exactly, so neighbouring borders always meet; every border is walled on both sides except at
// the gaps below, which get a door on each side. `npm run map -- check` proves it (checkSeams).
//
//   col: 0         1         2         3
//        0123456789012345678901234567890123
export default {
  square: 10,
  rows: [
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 0
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 1
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 2
    'DDDDDDDDDDDDDDBBBBBBJJJJWWWWWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 3
    'DDDDDDDDDDDDBBBBBBBBBJJJJJJWWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 4
    'DDDDDDDDDDDDBBBBBBUUUUJJJJJJWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 5
    'DDDDDDDDDDFUUUUUUUUUUUJJJJJJWWWWWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 6
    'DDDDDDDFFFFUUUUUUUUUUUJJJJJJMMMMWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 7
    'DDDDDDFFFFFUUUUUUUUUUUJJJJJJMMMMWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 8
    'DDDDDDFFFFFUUUUUUUUUUUJJJJJJMMMMWWVVVVVVVVVVVVVVXXXXXXXXXXXXXX', // 9
    'DDDDDFFFFFFUUUUUUUUUUUJJJJJJSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 10
    'DDDFFFFFFFFFFFFFFFFFFEEEEEEESSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 11
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 12
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 13
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 14
    'FFFFFFFFFFFFFFFFFFFFFEEEEEEESSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 15
    'FFFFFFFFFFFFFFFFFFFFFEEEESSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 16
    'FFFFFFFFFFFFFFFTTTTTTEEEESSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 17
    'FFFFFFFFFFFFFFTTTTTTTEEESSSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 18
    'FFFFFFFFFFFTTTTTTTTTTEEESSSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 19
    'FFFFFFFFFFFTTTTTTTTTTEESSSSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 20
    'FFFFFFFFFFTTTTTTTTTTTSSSSSSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 21
    'FFFFFFFFFFTTTTTTTTTTTSSSSSSSSSSSSSRRRRRRRRRRRRRRYYYYYYYYYYYYYY', // 22
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
    V: 'emberwaste',
    R: 'rimeheart',
    X: 'glasswastes',
    Y: 'drownedmoor',
  },
  // Each gap: a square and the side of it that opens into the neighbouring biome (a 3-cell corridor, centred unless
  // `offset` moves it along that side). Keep a gap at least WALL cells from a corner of the border, or its corridor
  // runs into the wall of the turn (`npm run map -- layout <biome>` shows the walls, `=` the gaps).
  gaps: [
    { at: [17, 17], side: 'n' }, // town -> greenwood (north road)
    { at: [11, 19], side: 'w', offset: 6 }, // town -> greenwood (west gate)
    { at: [20, 21], side: 'e', offset: 5 }, // town -> frostlands
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
    { at: [33, 3], side: 'e' }, // wetlands -> the Emberwaste
    { at: [33, 15], side: 'e' }, // frostlands -> Rimeheart
    { at: [40, 9], side: 's' }, // the Emberwaste -> Rimeheart
    { at: [47, 3], side: 'e' }, // the Emberwaste -> the Glasswastes
    { at: [47, 15], side: 'e' }, // Rimeheart -> the Drowned Moor
    { at: [54, 9], side: 's' }, // the Glasswastes -> the Drowned Moor
  ],
} satisfies WorldLayout;
