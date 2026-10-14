---
name: add-mob-kind
description: Add a new enemy type to me_rpg (a new MobKind with its own stats and paper-doll look) and optionally place it on a map. Use whenever the user asks for a new monster/enemy/mob, wants to retune an existing one, or re-skin the Shade. For placing existing enemies on a map use build-zone.
---

# Add a mob kind

A mob kind is data: an entity with `"type": "mob"` in `public/content/<campaign>/entities.json` (loaded into `MOB_KINDS`, `src/systems/combat.ts`, at boot) whose `sprite` is a paper-doll look (a set of sprite parts). The AI
(`src/entities/Mob.ts`: idle/wander → chase → telegraphed windup → strike → recover) is shared by every kind, so a
new kind needs no new code unless it needs new behaviour.

## Steps

1. **Look** - a mob is a paper-doll `Outfit` (part ids from `sprites/parts.ts`), not a sheet file. Pick parts that
   already exist (`npm run sprites -- preview body.green head.orc torso.leather weapon.arming_iron --anim walk`
   renders a contact sheet to `sprites/out/preview.png`; Read it). Monster bodies/heads available: orc, goblin, troll,
   wolf, skeleton (any cloth colour), zombie, plus every human skin tone. A mob needs at least a `body` and `head`. If
   you need art that isn't packed yet (another helmet, hair, colour, monster head), use the `add-sprite-part` skill first.
   Weapons must have 128px swing art (arming sword family, dagger); others vanish or clip in the swing.
2. **Kind** in `public/content/<campaign>/entities.json`: add an entry under `entities` (its id is what scenarios and biomes
   name): `type: "mob"`, `name`, `notes` (what it is for and its level band), `sprite` (the look), optional `scale`, and
   `stats`: `hp`, `attack`, `defense`, `xp` (on kill), `gold` (dropped on kill, rolled ±30%; keep it rising with `xp`, a test checks), `speed` (px/s while chasing), `sight`
   (px; starts chasing inside this). `src/content/schema.ts` (`toMobKind`) turns it into the engine's `MobKind`. Optional
   pacing, under `behavior`: `windup` (telegraph, default 0.45 s), `recover` (rest after an
   attack, 0.7 s) and `stagger` (stun when hit, 0.3 s): fast kinds shorten them, big kinds set `stagger` near 0 so
   the hero cannot stun-lock them. Optional `behavior.shot: { range, speed, color: "#rrggbb" }` makes it a ranged attacker (it stops
   `range` px away, telegraphs with the cast pose, then fires a projectile worth its `attack` damage; keep `range <=
   sight`, `speed` below ~190 so it can be dodged, and `windup >= 0.5`; unit tests check these). The starter hero deals about `5 + 2 = 7` per swing and has 30 HP, so a kind's
   `attack`/`maxHp` should be playable against that (the unit test requires the hero can always hurt a kind:
   `defense < 7`). Existing kinds span level 1 fodder (goblin 14 HP / wolfkin 22 HP) to a troll (96 HP, 15 attack).
3. **Place it**: in `public/content/<campaign>/scenarios.json`, add `{ "entity": "<id>", "x": col, "y": row }` to the node of
   the zone (cells of that zone's map; `npm run map -- layout <biome>` or the map preview helps find open ground), or
   add the id to a biome's `generation.roam` kinds in `public/content/<campaign>/biomes.json` to have it wander. Maps hold no
   enemies. `npm run map -- check` fails a placement on blocked ground. Loading needs nothing else: `src/assets.ts`
   preloads every part used by `MOB_KINDS`, so the new look is loaded and composed automatically.
4. **Verify**: `npm run verify` (the `MOB_KINDS` tests check stats are sane and `tools/sprites/parts.test.ts` checks the look only uses real parts in their own slots) and, to see it, the `playtest` skill.

## Tuning notes

- Damage is `power ± 15%` minus defense, min 1 (`rollDamage`). A kind with `defense` ≥ the hero's attack power is
  unkillable at level 1; keep it below.
- Windup, recover and stagger default to 0.45 s / 0.7 s / 0.3 s and are overridable per kind (`mobTimings` in
  `combat.ts`); reach, leash and the shooter's back-off distance are shared constants at the top of `Mob.ts`.
- A stagger shorter than the hero's attack cooldown (0.35 s) lets a mob act between hits; the lower it is, the harder
  the fight. Ranged kinds are hardest when two or more shoot at once, so place them singly among melee mobs.
