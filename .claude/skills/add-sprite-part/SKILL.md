---
name: add-sprite-part
description: Add or change character art in me_rpg - a new hair style, armor, helmet, weapon, shield, skin/hair/cloth colour, monster body/head, or NPC/hero look - using the Universal LPC Spritesheet Character Generator's layers. Use whenever the user wants a character, NPC, monster or equipment to look different, or asks for new gear art.
---

# Add a character part

Characters are stacks of layers composed at runtime (CLAUDE.md, "Characters (paper-doll)"). Art comes from the
Universal LPC Spritesheet Character Generator; `sprites/parts.ts` lists which of it ships. A part id is
`<slot>.<name>` (slots: `body head eyes hair beard torso legs feet hands cape headwear weapon shield`).

## Setup (once per session)

`npm run sprites -- build` needs a clone of the generator (~520 MB, read-only):

```bash
git clone --depth 1 https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator \
  ../Universal-LPC-Spritesheet-Character-Generator     # or set LPC_DIR=<path>
```

In cloud sessions the clone is served by the git proxy; use `GIT_LFS_SKIP_SMUDGE=1`. Without a clone you can still
run `npm run sprites -- check`, which is all `verify`/`build` need.

## Steps

1. **Find the item** in the clone: `sheet_definitions/<group>/.../<item>.json` (e.g. `weapons/sword/weapon_sword_arming`,
   `torso/armour/torso_armour_plate`, `head/heads/fantasy/heads_orc_male`, `hair/long/hair_long`). Read the JSON:
   - `layer_N.<bodytype>` = art folder per body type (`male`, `female`, `teen`, ...) and `zPos` (draw order).
   - `recolors.material` (`body`, `hair`, `cloth`, `metal`, `wood`) means pick any colour from
     `palette_definitions/<material>/<material>_ulpc.json`. `variants` means pre-coloured files: pick one of them.
   - `recolors.color_1`/`color_2` (human heads: skin, eyes) take `color` and `color2`.
2. **Add it** to `sprites/parts.ts`: `add('<slot>.<name>', '<item path under sheet_definitions>', '<colour>', { body: 'female' })`.
   Body-shaped garments (tunic, pants, boots, armor, robes) have separate art per body type; use `body: 'female'` and
   an `f_` name for them. Hair, hats, capes, weapons and shields are shared. A skin colour on a head must match its body
   (`body.bronze` + `head.human_bronze`).
3. **Build**: `LPC_DIR=<clone> npm run sprites -- build` (all errors are listed at the end; messages name valid colours
   and variants). It rewrites `public/sprites/lpc/*.png`, `parts.json` and `credits.csv`; commit them with the catalog.
4. **Look at it**: `npm run sprites -- preview body.light head.human_light hair.messy_dark_brown <new part> --anim walk`
   (also `--anim slash|idle|cast|hurt`, `--scale 3`, `--out file.png`), then Read `sprites/out/preview.png`. Check the
   swing (`--anim slash`) for weapons: if the blade is missing there, the weapon uses an unsupported oversize swing.
5. **Use it**: a hero item (`src/systems/items.ts`, `look: { torso: '...' }`), an NPC (`NPC_LOOKS` in
   `src/systems/looks.ts`) or a mob (`look` on a `MobKind`, see `add-mob-kind`). `npm run verify` fails on an unknown
   part, a part in the wrong slot, or a character without body and head.

## Limits (see CLAUDE.md for the full list)

- Weapons need 128px swing art (`slash_128`): the arming sword family and the dagger work; longsword, mace, axe, scythe,
  rapier, saber, glowsword and polearms use 192px "oversize" swings and are not packed yet. Bows/spears/staves have
  no slash row and only show held (staff) or not at all.
- Items with no idle art reuse the first walk frame; weapons/shields have no cast art and vanish during it.
- Each part is ~50 KB and all used parts load at boot (~4 MB now): add what the game uses, not the whole library.
- **Credits**: `credits.csv` is regenerated from what is in the catalog; never ship art that is not in it. The art is
  CC-BY-SA/GPL/OGA-BY, so the packed sheets must stay under those terms (CREDITS.md).
