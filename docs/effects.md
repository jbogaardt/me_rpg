# Visual effects: what the world and the hero do on screen

Every effect here is **core engine and visual only**: it never changes a rule, so a co-op guest builds it from its own
copy of the map and what the host already tells it. Where a host event is needed it is a named `fx` (below). Pooled and
capped, like leaves and footprints (`src/entities/CLAUDE.md`).

## Places (what a map gives off)

`systems/hearths.ts` finds sources from map data, never a content id: an object `tag` (`fire`, `torch`), a surface
(`lava`, `caveLava`: bubbles; `caveFloor`, `sewerFloor`: drips) or a bush at night (fireflies). `entities/Hearth.ts` runs
the continuous particle effects (`smoke`, `embers`, `flame`, `lavaBubble`, `drip`, `fireflies`) only for sources near
the screen. A new kind of source is an entry in `HEARTH_EFFECTS`, `HEARTH_MARGIN` and `findHearths`.

## Light

- **Night warmth**: `LightGlow` (additive, above the night shade) draws an orange pool at each fire, torch and lava
  source (`systems/lights.ts`, radii in `LIGHT_RADIUS`), scaled by `glowStrength` of the sky colour. Flames flicker: each source has its own phase (`flickerSeed`, from where it
  stands), the reach wobbles (`flicker`) and the brightness wobbles faster with an occasional gutter (`flameBrightness`,
  `Light.k`); `visibleLights` fills a reused array, so a frame allocates no lights.
- **Underground darkness** (capability `darkness`, zone scope; settings `radius`, `dim`, `memory`): `MapData.dark` is set
  by every `Delve` (cave, sewer, crypt) and `DarknessLayer` cuts pools out of a dark mask for each hero and light, with
  ground already seen faintly visible. Nothing hides from the rules: a mob in the dark still sees you. A campaign, arc or
  biome turns it off with `"darkness": false`. It is the one linear-filtered texture (the soft edge needs it).

## The hero

- **Falling** (`systems/downfall.ts`): out of HP the hero collapses (`Player.down`, seconds since the blow), lies while the
  screen goes dark under a "You fell" card (`hud/ScreenFx.ts`), then `Simulation.defeat` wakes them as it always did.
  They take no hits and no commands meanwhile; a trial's defeat stays instant. Co-op: `FLAG.down` in the snapshot, and the
  guest keeps its own clock for the same fade.
- **Low HP**: a pulsing red edge under a third of HP (`lowHealth`), local only.
- **Victory**: `Character.celebrate` (the cast frames held at the top, a hop, back to the old facing) with the `cheer`
  confetti, on a level, a boss kill and a finished DM task (`Simulation.cheer`). The pose rides the `cheer` fx with `p`.
- **Feel** (`systems/feel.ts`, `FX_SHAKE`): the camera shakes with `blast`, `nova`, `bossFinale` and the hero's own
  `heroHurt`; every page plays the same fx, so a guest shakes with the host.
- Steps kick up `dust` on sand, dirt, clay and ash and `splash` in bog (`Ambient.onStep`, local).

## Foes and finds

- An enemy's `death` (entities.json: `mobPoof` default, `mobDust`, `mobSplat`, `mobWisp`; `MOB_DEATHS`) is the effect
  played where it fell. A named or DM boss also plays `bossFinale` (a big flash and shake).
- A chest opens with `sparkle` and `coinPop`, and `lootBeam` when it held gear.

## Adding one

A one-off burst is an entry in `PARTICLE_EFFECTS` (the `add-particle-effect` skill); if the host plays it for a guest it
also goes at the **end** of `FX_NAMES` (`net/protocol.ts`, so old indices hold; bump `PROTOCOL_VERSION`). Prefer
normal blending for anything that must read on bright ground: additive only shows on dark.
