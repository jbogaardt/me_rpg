# src/sprites: paper-doll characters

Heroes, NPCs and mobs are stacks of layers composed at runtime. `doll.ts` (Pixi-free) defines the sheet layout and the
`Outfit` (a part id per slot); `outfitLayers` orders layers by `z` so a cape or sword can sit both behind and in front of
the body. Add or change art with the `add-sprite-part` skill.

- **`sprites/parts.ts` (at the repo root, with the build tool in `tools/sprites`) is the source of truth for which art ships** (id `<slot>.<name>` to a generator item, body type, colour).
  `npm run sprites -- build` (needs a clone of the LPC generator, `LPC_DIR`) packs layers into `public/sprites/lpc/`,
  `parts.json` and `credits.csv`. **Never hand-edit those; commit them with the catalog.** `check` runs in `verify`.
- **`Wardrobe` loads parts as plain `<img>` elements, not Pixi textures** (they are only drawn onto a canvas, and a
  browser may drop an unused image's decoded pixels where an `ImageBitmap` would pin megabytes), composes an outfit
  into one texture, and shares sheets between mobs of a kind and equal NPC looks.
- **Sheets are reference-counted** (`sheetCache.ts`): every `wardrobe.sheet()` takes a reference that the `Character`
  holding it gives back. **Only hand a sheet to a `Character`, or release it yourself**, or long co-op games leak
  ten-megabyte sheets.
- Everything an outfit can use is preloaded at boot (`assets.ts`); tests fail on an unknown part, a part in the wrong
  slot, or a missing body or head. Body-shaped garments differ per body type, so a female NPC needs `f_` parts.
- **`arms` slot**: sleeves/arm guards for sleeveless torso armour. A chest item's `look` may set both `torso` and `arms`; it is drawn from the same worn item, so co-op needs no extra data.
- **Limits**: only 128 px weapon swings fit (arming sword family, dagger); oversize swings are not packed. Weapons and
  shields vanish in the cast pose. Custom whole-body sheets (`CUSTOM_PARTS`, e.g. the Mummy) bring their own head.
- **LPC monsters** (`tools/sprites/monsters.ts`, `npm run monsters`): the "[LPC] Monsters" sheets in `art/lpc_monsters/` are repacked into whole-body doll sheets (`<name>_doll.png`, the same route as the Mummy: `CUSTOM_PARTS`, packed by `sprites -- build body.<name>`, no generator clone needed). A table in the tool says which source column plays in which pose and the feet are aligned to the doll's ground line; hurt is a white flash (or the pack's own flash frame). They are small (a slime is half a hero tall), so they are fodder and flyers, not bosses.
