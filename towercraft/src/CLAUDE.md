# towercraft/src: the page (drawing, input, sound)

Rules are in `sim/` (see `sim/CLAUDE.md`); this directory draws a `Match` and turns input into commands. Everything here is cosmetic: lockstep never sees it.

## Colours (`recolor.ts`; layer: this game's own, cosmetic)

- **Seat colours**: a duel paints each seat in its race's hue (`RACE_HUE`: Goblins green, Dwarves blue, Germanic red); with more seats the side's (`SIDE_HUE`). A further seat that shares a hue gets a shade (`shadeOf`), so two of one race still tell apart.
- **Painted pictures**: Wyrmsun's buildings carry their player colour as purple. `recolor` moves those pixels (only purple ones: wood, stone and gold stay) to the seat's hue, keeping their shading. `main.ts` paints each picture once per colour (`buildingTex`, cached per colour; the dock and cards get a data URL from `buildingUrl`).
- A new race or side colour: a hue in `recolor.ts`. A picture with purple that should not change: give it a different hue, not a special case.

## Sound (`soundEvents.ts`, `soundMix.ts`, `audio.ts`; layer: this game's own, nothing in the protocol)

Each page makes its own sounds from the same match, so nothing goes over the wire and a page with sound off or unavailable plays the same game.

- **`soundEvents.ts`** (Pixi-free) turns a tick into cues: `shots`, `deaths` and `razed` as the rules give them; a new tower, a castle level, a bought upgrade and a fallen castle by comparing with the last tick (`SoundWatch`), so the computers' and a rival's actions sound too. Cues the player cannot see are silent (`canSee`).
- **`soundMix.ts`** (Pixi-free) sets **loudness and pan by where the action is on screen** (`mixAt`: full near the middle of the view, quieter towards and past its edge, silent far off, leaning to the side it comes from). The player's own builds and upgrades are heard in full wherever they look (`OWN`); `loudest` keeps a crowd from becoming a wall of noise.
- **`audio.ts`** plays the Ogg files in `public/audio/sfx/<kind>-<n>.ogg` with Web Audio (credits and licences in `public/audio/CREDITS.md`; only CC0 or CC-BY, listed there). It starts on the first click or key press (browsers require it), loads lazily, caps each kind per tick and 24 voices, varies the pitch a little, and **M** or the speaker button mutes (`localStorage` `towercraft:muted`).
- **`music.ts`** loops one background track through the same output (`audioOutput`), so **M** mutes it too. It starts when a match begins (`begin`) and fades out when it ends (`showEnd`); one track serves every map, and it waits for the first click if the match began before audio was unlocked. Files in `public/audio/music/` (credits in `public/audio/CREDITS.md`). Every page plays its own copy (host and guest alike), since nothing goes over the wire.
- **`voice.ts`** says a unit's line when you select it (`pick`) and when you send it at a foe (`go`): `voiceLines.ts` has both lines of every unit, by race, and the files are `public/audio/voice/<race>-<unit>-<line>.wav`. The WAVs are committed (ElevenLabs text-to-speech, one library voice per race; credits in `public/audio/CREDITS.md`). A missing file is silent, and a line waits 1.2 s after the last. A new unit needs its two lines (`voiceLines.test.ts` checks) and its two WAV files.
- A new sound: add its kind to `SoundKind`, a `SOUNDS` entry and the files, and a cue in `SoundWatch.collect` (with a test). A new track: a file pair in `public/audio/music/` and a credit, then pick it in `music.ts`.

## Cards

The cards are pictures first: stat rows are an icon (`icons.ts`, the words in its tooltip) and a value. The castle card shows only what it is now (level, health, income, reach, units out); the next level's cost, stats, unlocks and needs are left to the button, whose label and reason say them. An upgrade button shows `+15%`, a heart or sword, and the ground or a wing.

## Status strip, minimap and alerts (`statusBar.ts`, `minimap.ts`, `hudModel.ts`; layer: this game's own, cosmetic, nothing in the protocol)

Read-only views of the `Match`; `main.ts` only creates a `Hud` once, calls `hud.reset()` in `begin` and `hud.update()` each frame. The elements (`#status`, `#pay` inside `#top`, `#minimap`, `#alert`) live in `index.html` in a commented block and show only under `body.playing`, so a match that ends or is left hides them with no teardown.

- **Never assume seats**: the strip's sides come from `teamSeats` (yours left, every other seat right), `YOU` may be seat 1 (online guest), and a co-op side sums its castles. `hudModel.ts` is the Pixi-free, tested part (clock, shares, pay progress, `AlertWatch`).
- **The minimap shows what the field shows**: foes, their buildings and castles only through the same `isSeen` / `isCastleSeen` / `sightsFor` the drawing uses (an unseen foe castle is a faint ring at its camp, a static map fact). It redraws about 5 times a second on a 2D canvas, faster while a ping plays; its pointer events stop there (no pan or box on the field), a tap or drag calls `focus`. It folds to a small "Map" button (`localStorage` `towercraft:minimap`).
- **Alerts compare health between updates** (`AlertWatch`): your castle or a building of yours hurt off screen, or an ally's castle fallen; one per kind every `ALERT_EVERY` seconds of match time. The toast pings the minimap and a tap on it moves the camera. Do not feed them from `shots`, so they stay right for the online guest and for rejoined matches.
- Layout trap: the strip sits top centre on a desktop, between `#top` and `#cam` on a landscape phone, and on a second row (with `#pay`, and `#hint` moved down) on a portrait phone; the minimap is bottom-right on a desktop (short enough to stay under the open card) and under `#cam` on phones.
