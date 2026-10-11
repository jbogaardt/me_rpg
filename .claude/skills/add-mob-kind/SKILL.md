---
name: add-mob-kind
description: Add a new enemy type to me_rpg (a new MobKind with its own stats and paper-doll look) and optionally place it on a map. Use whenever the user asks for a new monster/enemy/mob, wants to retune an existing one, or re-skin the Shade. For placing existing enemies on a map use build-zone.
---

# Add a mob kind

A mob kind is data: a `MobKind` entry in `MOB_KINDS` (`src/systems/combat.ts`) plus a paper-doll look (a set of sprite parts). The AI
(`src/entities/Mob.ts`: idle/wander → chase → telegraphed windup → strike → recover) is shared by every kind, so a
new kind needs no new code unless it needs new behaviour.

## Steps

1. **Look** - a mob is a paper-doll `Outfit` (part ids from `sprites/parts.ts`), not a sheet file. Pick parts that
   already exist (`npm run sprites -- preview body.green head.orc torso.leather weapon.arming_iron --anim walk`
   renders a contact sheet to `sprites/out/preview.png`; Read it). Monster bodies/heads available: orc, goblin, troll,
   wolf, skeleton (any cloth colour), zombie, plus every human skin tone. A mob needs at least a `body` and `head`. If
   you need art that isn't packed yet (another helmet, hair, colour, monster head), use the `add-sprite-part` skill first.
   Weapons must have 128px swing art (arming sword family, dagger); others vanish or clip in the swing.
2. **Kind** in `src/systems/combat.ts`: add a `MobKind` const and register it in `MOB_KINDS` (the key is what maps
   use). Fields: `name`, `look`, `maxHp`, `attack`, `defense`, `xp` (on kill), `speed` (px/s while chasing), `sight`
   (px; starts chasing inside this). The starter hero deals about `5 + 2 = 7` per swing and has 30 HP, so a kind's
   `attack`/`maxHp` should be playable against that (the unit test requires the hero can always hurt a kind:
   `defense < 7`). Existing kinds span level 1 fodder (goblin 14 HP / wolfkin 22 HP) to a troll (96 HP, 15 attack).
3. **Place it**: `z.mob('<key>', col, row)` in `maps/<zone>.ts`, then follow the `build-zone` skill
   (`npm run map -- build`, look at the preview, commit spec and JSON together). Loading needs nothing else: `src/assets.ts`
   preloads every part used by `MOB_KINDS`, so the new look is loaded and composed automatically.
4. **Verify**: `npm run verify` (the `MOB_KINDS` tests check stats are sane and `tools/sprites/parts.test.ts` checks the look only uses real parts in their own slots) and, to see it, the `playtest` skill.

## Tuning notes

- Damage is `power ± 15%` minus defense, min 1 (`rollDamage`). A kind with `defense` ≥ the hero's attack power is
  unkillable at level 1; keep it below.
- The windup (0.45 s), recover (0.7 s), reach and leash are shared constants at the top of `Mob.ts`; changing them
  changes every kind.
