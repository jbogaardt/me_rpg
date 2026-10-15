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
- Pure helpers (`chunks.ts`, `doors.ts`, `explored.ts`, `minimap.ts`, `outline.ts`, `bounds.ts`, `transition.ts`) are
  Pixi-free and unit-tested; keep new map maths there.
