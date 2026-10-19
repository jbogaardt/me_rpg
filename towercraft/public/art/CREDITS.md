# Art credits

The pictures in this folder are **Wyrmsun** art (https://andrettin.github.io/, source https://github.com/Andrettin/Wyrmsun) and Me RPG's
LPC terrain. Each file was checked against the credits of the place it was copied from by `tools/towercraftArt.ts`, which refuses
anything not listed as CC0 or CC-BY-SA 3.0. Please support the artists.

## Share-alike art (CC-BY-SA 3.0)

Licensed [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (Wyrmsun lists these as "GPL 2.0 and CC-BY-SA 3.0"; we use the
CC-BY-SA option). Credit is shown on the game's title screen. **The terms follow the art:** a copy of these pictures, or a picture
made from them, must credit the artists and be shared under CC-BY-SA 3.0 (or a compatible licence). The game's code is separate.

- `units/*.png`, the animated unit sheets: **b_o** (Wyrmsun), and badbuckle for the Teuton ritter. Goblin spearman, archer, swordsman, thief
  and glider, the neutral bat, dread bat, white bird (falcon) and gray-feathered gryphon, dwarven axefighter, thunderer, runesmith, thane,
  yale rider and the three gryphon riders, Germanic warrior and archer, Teuton ritter, saxon swordsman and catapult. **Jinn** drew the
  gunpowder infantry (goblin boomer), the thunderer, the runesmith and the Austrian musketeer (powder sapper); these too are offered by
  Wyrmsun as "GPL 2.0 and CC-BY-SA 3.0" and we take CC-BY-SA 3.0.
- `germanic_town_hall.png` (the Germanic siege workshop): **Jinn** and **b_o**, "GPL 2.0 and CC-BY-SA 3.0", so it follows the share-alike
  terms (the other buildings below are CC0).
- `maps/*.png`, drawn by `tools/towercraftBoard.ts` (`npm run towercraft:board`) with Me RPG's map pipeline from the "Tiled Terrains" LPC
  terrain atlas by adrix89 and the Liberated Pixel Cup artists (full list: `art/lpc_terrain/Attribution.txt`, licence CC-BY-SA 3.0 or
  GPL 3.0). They are adaptations of that atlas, so CC-BY-SA 3.0 too. The same pictures carry Me RPG's scenery: its trees, bushes and
  rocks (LPC and OpenGameArt artists, credited in the root `CREDITS.md`, with the licences given there) and its lake tiles from the same atlas.

## Interface art (CC-BY 3.0)

- `../ui/*`, the menu frames, wood and parchment, buttons and planks: "RPG GUI construction kit v1.0" by Lamoot, licensed [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), as cut for Me RPG (`tools/ui/cut-gui.ts`).

## CC0 art (no credit needed, given anyway)

- Buildings (the producers, mills, quarries, smithies and bunkers too): **Jinn** and **Exidelo** (Wyrmsun), CC0, except the workshop above.
  Among them the lumber mills, masons' shops, farms, markets, smithies, town halls, stables, mess halls, fortresses, citadel, academies, hunting
  lodge, pens, ranch and the Teuton fort; each race reuses some pictures for several buildings (a small badge in the game tells them apart).
- Towers: **Jinn** (Wyrmsun). The `*_tower.png` sheets (64x128; the game uses the first 64x64 frame) are the goblin watch, guard and
  catapult towers, dwarf ballista, cannon, guard and sentry towers, and Teuton watch, guard and catapult towers. The support towers
  are 96x192 sheets (first 96x96 frame): the goblin temple and academy, dwarf temple, Teuton church and university. Castles are the
  strongholds (128x256, first 128x128 frame).
- Portraits (46x38, for the buttons and race picker): **Jinn** (the Germanic warrior, Teuton ritter, goblin spearman, gryphon rider)
  and **Exidelo** (the goblin thief and glider, the dwarvish axefighter, thane, the Germanic archer), from the OpenGameArt pack "Wyrmsun CC0 - over 900 items"
  (https://opengameart.org/content/wyrmsun-cc0-over-900-items, redistributed by Drummyfish).

The unit sheets are mostly 72x72 frames (gryphons and the glider 100x100, bats and birds 32x32, the dread bat 64x64), five directions across, and
the animation rows are the ones Wyrmsun's own scripts use (`scripts/anim.lua`): for the walkers row 0 stands, 1-4 walk, 5-8 attack, 9-11 die; for
the bats rows 0-5 beat the wings, 6-8 dive, 9-11 fall; the catapult has four rows (roll, throw). `SHEETS` in `src/main.ts` says which rows are drawn.
Unit portraits without a file of their own (`UnitDef.art` omitted) are cut from the front-facing standing frame of the unit's own sheet, so they carry
the sheet's licence.
