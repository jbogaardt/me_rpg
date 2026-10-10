export const TILE = 32;

// '#' wall, '.' grass, '~' water, 'N' npc spawn (grass), '@' player spawn (grass)
export const MAP = [
  '####################',
  '#..................#',
  '#..@...............#',
  '#......~~~.........#',
  '#......~~~....N....#',
  '#..................#',
  '#..................#',
  '#.......#####......#',
  '#..................#',
  '####################',
];

export const BLOCKED = new Set(['#', '~']);

export function tileAt(col: number, row: number): string {
  return MAP[row]?.[col] ?? '#';
}

export function findTile(ch: string): { col: number; row: number } {
  for (let row = 0; row < MAP.length; row++) {
    const col = MAP[row].indexOf(ch);
    if (col >= 0) return { col, row };
  }
  throw new Error(`Tile ${ch} not found in map`);
}
