# Art credits

The pictures in this folder are **Wyrmsun** art (https://andrettin.github.io/, source https://github.com/Andrettin/Wyrmsun) and Me RPG's
LPC terrain. Each file was checked against the credits of the place it was copied from by `tools/towercraftArt.ts`, which refuses
anything not listed as CC0 or CC-BY-SA 3.0. Please support the artists.

## Share-alike art (CC-BY-SA 3.0)

Licensed [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (Wyrmsun lists these as "GPL 2.0 and CC-BY-SA 3.0"; we use the
CC-BY-SA option). Credit is shown on the game's title screen. **The terms follow the art:** a copy of these pictures, or a picture
made from them, must credit the artists and be shared under CC-BY-SA 3.0 (or a compatible licence). The game's code is separate.

- `units/*.png`, the animated unit sheets: **b_o** (Wyrmsun), and badbuckle for the Teuton ritter. Goblin spearman, thief and glider,
  dwarven axefighter, thane and gryphon rider, Germanic warrior and archer, Teuton ritter.
- `maps/*.png`, drawn by `tools/towercraftBoard.ts` (`npm run towercraft:board`) with Me RPG's map pipeline from the "Tiled Terrains" LPC
  terrain atlas by adrix89 and the Liberated Pixel Cup artists (full list: `art/lpc_terrain/Attribution.txt`, licence CC-BY-SA 3.0 or
  GPL 3.0). They are adaptations of that atlas, so CC-BY-SA 3.0 too. The same pictures carry Me RPG's scenery: its trees, bushes and
  rocks (LPC and OpenGameArt artists, credited in the root `CREDITS.md`, with the licences given there) and its lake tiles from the same atlas.

## Interface art (CC-BY 3.0)

- `../ui/*`, the menu frames, wood and parchment, buttons and planks: "RPG GUI construction kit v1.0" by Lamoot, licensed [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), as cut for Me RPG (`tools/ui/cut-gui.ts`).

## CC0 art (no credit needed, given anyway)

- Towers: **Jinn** (Wyrmsun). The `*_tower.png` sheets (64x128; the game uses the first 64x64 frame) are the goblin watch, guard and
  catapult towers, dwarf ballista, cannon, guard and sentry towers, and Teuton watch, guard and catapult towers. The support towers
  are 96x192 sheets (first 96x96 frame): the goblin temple and academy, dwarf temple, Teuton church and university. Castles are the
  strongholds (128x256, first 128x128 frame).
- Portraits (46x38, for the buttons and race picker): **Jinn** (the Germanic warrior, Teuton ritter, goblin spearman, gryphon rider)
  and **Exidelo** (the goblin thief and glider, the dwarvish axefighter, thane, the Germanic archer), from the OpenGameArt pack "Wyrmsun CC0 - over 900 items"
  (https://opengameart.org/content/wyrmsun-cc0-over-900-items, redistributed by Drummyfish).

The unit sheets are 72x72 frames, five directions across, and the animation rows are the ones Wyrmsun's own scripts use
(`scripts/anim.lua`): row 0 stands, 1-4 walk, 5-8 attack, 9-11 die. Towercraft draws the walk and the death.
