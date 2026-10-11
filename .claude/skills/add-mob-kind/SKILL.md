---
name: add-mob-kind
description: Add a new enemy type to me_rpg (a new MobKind with its own stats and sprite sheet) and optionally place it on a map. Use whenever the user asks for a new monster/enemy/mob, wants to retune an existing one, or re-skin the Shade. For placing existing enemies on a map use build-zone.
---

# Add a mob kind

A mob kind is data: a `MobKind` entry in `MOB_KINDS` (`src/systems/combat.ts`) plus a character sheet. The AI
(`src/entities/Mob.ts`: idle/wander → chase → telegraphed windup → strike → recover) is shared by every kind, so a
new kind needs no new code unless it needs new behaviour.

## Steps

1. **Sprite sheet** → `public/sprites/<name>.png`. Same layout as every character: 3 columns × 4 rows of 32×36
   frames (columns walk-A, stand, walk-B; rows back, right, front, left). Free placeholder sheets already there:
   `healer_*`, `mage_*`, `ninja_*`, `ranger_*`, `townfolk1_*`, `warrior_*`. Public repo: only commit art you may
   redistribute, and add its credit to `CREDITS.md`.
2. **Kind** in `src/systems/combat.ts`: add a `MobKind` const and register it in `MOB_KINDS` (the key is what maps
   use). Fields: `name`, `sheet` (file name under `public/sprites/`), `maxHp`, `attack`, `defense`, `xp` (on kill),
   `speed` (px/s while chasing), `sight` (px; starts chasing inside this). The starter hero deals about
   `5 + 2 = 7` per swing and has 30 HP, so a kind's `attack`/`maxHp` should be playable against that (the unit
   test requires the hero can always hurt a kind: `defense < 7`).
3. **Place it**: `z.mob('<key>', col, row)` in `maps/<zone>.ts`, then follow the `build-zone` skill
   (`npm run map -- build`, look at the preview, commit spec and JSON together). Loading needs nothing else: the
   `sprites` asset bundle is built from `MOB_KINDS` in `src/assets.ts`, so the new sheet is loaded automatically.
4. **Verify**: `npm run verify` (the `MOB_KINDS` tests check stats are sane) and, to see it, the `playtest` skill.

## Tuning notes

- Damage is `power ± 15%` minus defense, min 1 (`rollDamage`). A kind with `defense` ≥ the hero's attack power is
  unkillable at level 1; keep it below.
- The windup (0.45 s), recover (0.7 s), reach and leash are shared constants at the top of `Mob.ts`; changing them
  changes every kind.
