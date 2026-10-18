// Which sprites of the LPC trees pack (art/lpc_trees/, see trees.ts) the game uses. A rect only has to
// enclose the sprite and none of its neighbours' art; trees.ts cuts the sprite out by its shape. The green,
// dry (brown) and jungle (pale) recolours share the pack's layout, the dead sheet has its own trees.

export const TREE_KINDS = ['green', 'frost', 'dry', 'jungle', 'dead', 'swamp', 'autumn'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

export interface Pick {
  rect: readonly [x: number, y: number, w: number, h: number];
}
const pick = (x: number, y: number, w: number, h: number): Pick => ({ rect: [x, y, w, h] });

const LEAFY = {
  trees: [
    pick(128, 104, 95, 117),
    pick(320, 102, 96, 114),
    pick(544, 96, 96, 120),
    pick(418, 352, 119, 151),
    pick(485, 226, 89, 126),
    pick(583, 224, 115, 127),
  ],
  bushes: [pick(225, 366, 95, 80), pick(34, 62, 34, 32)],
};

export const TREE_PICKS: Record<'green' | 'dry' | 'jungle' | 'dead' | 'autumn', { trees: Pick[]; bushes: Pick[] }> = {
  green: LEAFY,
  dry: LEAFY,
  jungle: LEAFY,
  autumn: LEAFY,
  dead: {
    trees: [
      pick(58, 100, 80, 125),
      pick(130, 128, 95, 95),
      pick(232, 122, 90, 90),
      pick(320, 125, 100, 95),
      pick(66, 236, 90, 120),
      pick(425, 352, 100, 152),
    ],
    bushes: [pick(235, 400, 80, 50), pick(0, 66, 34, 36)],
  },
};
