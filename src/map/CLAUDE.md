# src/map: map format and streaming

`types.ts` holds `MapData` and `parseMap` (the packed on-disk format is written by `tools/map`; see
`tools/map/CLAUDE.md`). `MapView` draws a map as a render group with a `ground` layer and a y-sorted `layer` holding
map objects plus everything the scene adds.

- **It streams**: the map is cut into chunks and `update(view)`, called every frame after the camera moves, builds the
  chunks round the view and frees those left behind, so a big zone costs about what a small one does and only the data
  stays. **Add entities to `world.layer`, never to the `MapView` itself, and don't rely on a map object's sprite
  existing.** A neighbour's margin (surface `beyond`) is not drawn here; the neighbour's own view is.
- `MapView.setObjectAlpha` fades a map object by index (lily pads on a drained pond, a port's seal, the drawn copy of a
  barrel an entity replaced); the fade is kept while its chunk is freed and rebuilt.
- `MapData.gates` (`GateSpawn`): ways a quest opens, wired at load by `content/gates.ts`; every seal and reveal object is in the map, faded by `setObjectAlpha`.
- Pure helpers (`chunks.ts`, `doors.ts`, `explored.ts`, `minimap.ts`, `outline.ts`, `bounds.ts`, `transition.ts`) are
  Pixi-free and unit-tested; keep new map maths there.
- **Backdrop and parallax** (core engine, cosmetic, capability `parallax`, zone scope, setting `depth`): a map names a `backdrop`
  (`MapData.backdrop`, a key of `BACKDROPS` in `backdrop.ts`; every `Delve` does) and cells it leaves with no ground (a
  delve's roof) show it. `BackdropLayer` is `MapView`'s first child: two tiling sprites laid over the view and slid by a
  share of the camera (`factors`: far 0.4, near 0.67 at the default depth; off = 1, scrolling with the floor, so plain dark),
  in whole pixels. `ForegroundLayer` (last child of `MapView`, under the darkness) lays stalactite shadows and drifting dust over
  the world, slid FASTER than the camera (`front`, 1.3) so the floor lies between the layers; hidden when `depth` is 0. Four quads in all,
  nothing allocated per frame. **Co-op**: none, built from the map and the camera.
