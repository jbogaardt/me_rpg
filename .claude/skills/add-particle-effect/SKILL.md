---
name: add-particle-effect
description: Add, retune or wire up a particle effect in me_rpg (hit sparks, trails, bursts, puffs, magic, level-up). Use whenever the user asks for a new visual effect made of many small moving bits, wants an existing one changed (colour, count, speed, size, lifetime), or wants an effect played on a new game event. Not for text or the slash arc (see entities/effects.ts).
---

# Add a particle effect

Effects are **data**: an entry in `PARTICLE_EFFECTS` (`src/systems/particleEffects.ts`). The engine is shared:

- `src/systems/particles.ts` - Pixi-free simulation. `Emitter` owns a fixed pool (struct-of-arrays, no per-particle
  allocation) and advances it; `sampleCurve` / `sampleColor` evaluate the over-life ramps. Unit-tested.
- `src/entities/ParticleEffect.ts` - draws an effect: one `Emitter` + one `ParticleContainer` (one draw call) per
  emitter, with a pre-allocated `Particle` per pool slot. It implements `Effect`, so it goes through `Effects.add`.
  Textures (`dot`, `glow`, `streak`) are generated white on first use and tinted per particle.
- `src/systems/particleEffects.ts` - the effects. `particleEffects.test.ts` checks every entry (positive life/size,
  curves in range, finishes and empties) automatically; no per-effect test needed.

## Steps

1. **Define it**: add a key to `PARTICLE_EFFECTS` with one or more emitters. An `EmitterDef` is:
   - *what*: `shape` (`dot` pixel, `glow` soft blob, `streak` 4:1 line - set `align: true` to point along travel),
     `blend` (`normal` default; `add` brightens, only reads on dark ground - the overworld is bright, so prefer normal).
   - *when*: `burst` (count at once) and/or `rate` (per second) with optional `duration` (without it, runs until
     `stop()`). Ranges are a number or `[min, max]`.
   - *motion*: `life`, `speed`, `angle` (radians relative to the effect's `dir`; default full circle), `radius` (spawn
     scatter), `gravity` (+ falls, - rises), `drag`, `spin`.
   - *look over life* (`t` = 0 to 1, evenly spaced keyframes): `sizeOverLife`, `alphaOverLife`, `colorOverLife`
     (0xRRGGBB list). `size` is px at the sprite's width.
   - Use the palette in the file header (cyan magic, gold, hurt red, shade purple; team colours are in the user prefs).
2. **Play it**: `this.effects.add(particleEffect('name', x, y, { dir }))` (`src/entities/ParticleEffect.ts`).
   Positions are world px; characters' origin is their feet, so spawn at `y - 14` for chest height. `dir` is radians
   (`Math.atan2(vy, vx)` from a direction vector). A continuous effect (a `rate` with no `duration`) returns the
   `ParticleEffect`: keep it, call `moveTo(x, y)` as the source moves and `stop()` when it ends (see the bolt trail in
   `OverworldScene.cast`). `sort: 'world'` on the def y-sorts it with characters instead of drawing on top.
3. **Verify**: `npm run verify`, then look at it with the `playtest` skill. Particles live a fraction of a second, so
   freeze the frame: `ticker.stop()`, step `scene.update(1/60)` a few times, `app.render()`, screenshot.

## Gotchas

- A new shape needs an entry in `SHAPES` (`ParticleEffect.ts`) and the `Shape` union (`particles.ts`).
- Pool size comes from `burst` + `rate * life`; set `max` to cap it (hard cap `MAX_CAPACITY` = 512). Extra spawns are
  dropped, not queued.
- `ParticleContainer` skips culling and bounds; `ParticleEffect` already calls `container.update()` once so the static
  UV buffer uploads. Don't change a pool's size after creation.
- Every particle in one emitter shares a texture; use two emitters to mix shapes or blend modes.
