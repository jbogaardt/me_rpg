# Art credits

The pictures in this folder are **Wyrmsun** art (https://andrettin.github.io/, source https://github.com/Andrettin/Wyrmsun) and Me RPG's
LPC terrain. Each file was checked against the credits of the place it was copied from by `tools/towercraftArt.ts`, which refuses
anything not listed as CC0 or CC-BY-SA 3.0. Please support the artists.

## Share-alike art (CC-BY-SA 3.0)

Licensed [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (Wyrmsun lists these as "GPL 2.0 and CC-BY-SA 3.0"; we use the
CC-BY-SA option). Credit is shown on the game's title screen. **The terms follow the art:** a copy of these pictures, or a picture
made from them, must credit the artists and be shared under CC-BY-SA 3.0 (or a compatible licence). The game's code is separate.

- `units/*.png`, the animated unit sheets: **b_o** (Wyrmsun), and badbuckle for the Teuton ritter.
  goblin spearman and thief, dwarven axefighter, thane, Germanic warrior, Teuton ritter.
- `lane.png`, drawn by `tools/towercraftBoard.ts` (`npm run towercraft:board`) with Me RPG's map pipeline from the "Tiled Terrains" LPC
  terrain atlas by adrix89 and the Liberated Pixel Cup artists (full list: `art/lpc_terrain/Attribution.txt`, licence CC-BY-SA 3.0 or
  GPL 3.0). It is an adaptation of that atlas, so it is CC-BY-SA 3.0 too.

## CC0 art (no credit needed, given anyway)

- Towers (`*_tower.png`, 64x128 sheets of which the game uses the first 64x64 frame): **Jinn** (Wyrmsun). Goblin watch and guard
  towers, dwarf ballista and cannon towers, Teuton watch tower and catapult.
- Portraits (46x38, for the buttons and race picker): **Jinn** (the Germanic warrior, Teuton ritter) and **Exidelo** (the goblin
  spearman's and thief's, the dwarvish axefighter's and thane's), from the OpenGameArt pack "Wyrmsun CC0 - over 900 items"
  (https://opengameart.org/content/wyrmsun-cc0-over-900-items, redistributed by Drummyfish).

The unit sheets are 72x72 frames, five directions across, and the animation rows are the ones Wyrmsun's own scripts use
(`scripts/anim.lua`): row 0 stands, 1-4 walk, 5-8 attack, 9-11 die. Towercraft draws the walk and the death.
