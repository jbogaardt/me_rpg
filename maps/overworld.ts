import { defineZone } from '../tools/map/zone';

// The starting field: a meadow walled in by forest, with a sand clearing, two bush clumps and a few
// rocks. Build with `npm run map -- build`; preview in maps/out/overworld.png.
export default defineZone({
  name: 'overworld',
  width: 40,
  height: 28,
  build(z) {
    z.fill('grass');

    // Border forest. Rects run past the map edge so the canopy has no gaps at the world's edge.
    z.forest({ col: -3, row: -3, w: 46, h: 6 }); // north: blocks rows 0-2
    z.forest({ col: -3, row: 26, w: 46, h: 5 }); // south: rows 26-27 (row 25 is walk-behind fringe)
    z.forest({ col: -3, row: -3, w: 5, h: 34 }); // west: cols 0-1
    z.forest({ col: 38, row: -3, w: 5, h: 34 }); // east: cols 38-39

    z.patch('sand', { col: 21, row: 13, w: 5, h: 5 });

    // Bush clumps north of the clearing and in the south-west.
    z.prop('treeA', 19, 9, { dx: 1 });
    z.prop('treeB', 20, 9, { dx: 1 });
    z.prop('treeB', 11, 17, { dx: 1 });

    for (const [col, row] of [[18, 6], [26, 10], [10, 12], [8, 20], [30, 20]]) z.prop('rock', col, row);

    z.spawn(6, 6);
    z.npc(14, 9);
    z.mob('shade', 24, 15);
  },
});
