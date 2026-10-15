# src: boot and assets

`main.ts` boots: the Pixi `Application`, the content (`ContentManager.load`, then `install()`), assets and the start
zone behind the loading overlay, the shared DOM UI, then a `SceneManager` with an `OverworldScene`.

**All loading goes through `assets.ts`** and the Pixi `Assets` manifest: sprite parts (as images, via the `Wardrobe`)
and per zone `loadZone(name)`, whose tilesets are loaded once and reference-counted so `unloadZone` frees exactly what no
other loaded zone needs. Don't call `Assets.load` ad hoc elsewhere. **Every fetched URL under `public/` carries
`?v=<content hash>`** (`virtual:asset-versions`), so a deploy never pairs new code with a cached old map or sheet; a new
folder of fetched files goes in `VERSIONED_DIRS`. `__BUILD_ID__` is only the co-op version handshake.
