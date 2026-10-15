# src/map (map format and streaming)

Keep it up to date in the same change ("above"/"below" in the text mean this file or the root map).

- **`src/map/`** — `types.ts` (`MapData`, `parseMap`) and `MapView.ts`: a render group with a `ground` layer and a y-sorted `layer` holding map objects (cullable via `CullerPlugin`) plus everything the scene adds (characters, effects). **It streams**: the map is cut into `CHUNK` (16) cell chunks (`map/chunks.ts`, Pixi-free, tested) and `update(view)`, called every frame after the camera moves (and by `Zones.show`), builds the chunks round the view (each chunk's ground its own render group, its objects added to `layer`) and frees the ones left two chunks behind, so a big zone costs about what a small one does; only the map data stays. Add entities to `world.layer`, never to the `MapView` itself, and don't rely on a map object's sprite existing.
