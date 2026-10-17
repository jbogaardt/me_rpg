// The shop emblems (8x6 pixels each) painted over the doors of the shop buildings (town.ts) and on the signs inside
// them (interior.ts).

type RGB = [number, number, number];

// 8x6 pixels, '#' ink, 'o' the background, 'x' accent. ---------------------------------------
export const EMBLEMS: Record<string, string[]> = {
  smithy: ['########', '.######.', '..####..', '...##...', '..####..', '.######.'],
  armory: ['.######.', '.#oooo#.', '.#oxxo#.', '.#oxxo#.', '..#oo#..', '...##...'],
  apothecary: ['...##...', '...##...', '..####..', '.#xxxx#.', '.#xxxx#.', '..####..'],
  ranger: ['.##.....', '#..#..#.', '#..#.##.', '#######>', '#..#.##.', '.##...#.'],
  wizard: ['...##...', '..#xx#..', '#xxxxxx#', '.#xxxx#.', '.#x##x#.', '..#..#..'],
  tavern: ['.####...', '#xxxx##.', '#xxxx#.#', '#xxxx#.#', '#xxxx##.', '.####...'],
};
export const INK: RGB = [58, 40, 34];
export const LIGHT: RGB = [236, 214, 150];
export const ACCENT: Record<string, RGB> = {
  smithy: INK,
  armory: [196, 64, 52],
  apothecary: [64, 170, 92],
  ranger: INK,
  wizard: [120, 70, 190],
  tavern: [214, 150, 52],
};
