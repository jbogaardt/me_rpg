# src/entities: things drawn in the world

- **A `Character`'s origin is its feet**, so collision and y-sorting (`zIndex = y`) use it directly. It renders from a
  composed doll sheet (`src/sprites/CLAUDE.md`); one-shot poses (`play`) take over until done.
- **`Mob` is an AI state machine driven through the `MobWorld` interface** the scene passes in (`strike`, `shoot`, `ray`),
  so it never reaches into the rules. Its design rules keep fights fair and learnable-but-not-gameable (`Mob.ts` constants
  explain each): a hero cannot juggle a mob (poise after a stagger, a committed windup cannot be interrupted); a melee
  blow cannot be dodged by stepping back and forth (it starts from a reach longer than the sword's, windup length varies,
  aim locks once committed, and the blow is a real lunge); a mob that loses the hero mends so chipping and healing
  doesn't work; a kind with a `ray` (the Mummy) is a caster with a melee fallback whose beam any hit interrupts.
  **Aggro needs line of sight** (`MobWorld.sees`, `Collision.hasLineOfSight`): walls do not pull rooms; a mob also hears a
  hero at `HEARING` of its sight, and a chaser keeps `MEMORY` seconds after losing sight, and gives up the moment the hero is past its sight range. Host-only, so no co-op change.
  **Giants** (`MobKind.scale`) draw bigger and the rules follow: collision box, reach, hit circle, bars.
- **Hit-pause** (`systems/hitPause.ts`): a surviving mob freezes and flashes 100-150ms on a blow, then staggers; host/solo
  only, a guest sees it stop because the snapshots stop moving it (nothing on the wire). A player's i-frames
  (`INVULN_TIME`) and blink come from the same module.
- **Windup cue is data** (`MobKind.telegraph`, `telegraphOf` in `systems/combat.ts`): flash colour and a ground lane for specials. The guest draws it from the existing `windup` state and timer (no protocol field).
- **On a co-op guest a `Mob` is only a view of the host's state** (`setRemote`): it plays windup and hurt poses and draws
  a beam from the `channel` state itself, but never decides anything. The host alone damages.
- **Ambient life** (`ambient.ts`: footprints, falling leaves) is passive, driven by body movement and map metadata
  (`surface`, object `tag`, canopy sheet name), with no hooks into collision. Keep any new effect pooled and capped.
- **Places and light** (`Hearth.ts`, `LightGlow.ts`, `DarknessLayer.ts`; `docs/effects.md`): smoke, bubbles, drips and the
  underground's fog of war come from map data and run near the screen. Visual only, so no co-op change.
- Effects (`effects.ts`, `ParticleEffect.ts`) are transient visuals owned by an `Effects` list; add a particle effect
  with the `add-particle-effect` skill. Dynamic in-world text is `BitmapText` with the `FloatText` font.
