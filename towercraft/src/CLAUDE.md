# towercraft/src: the page (drawing, input, sound)

Rules are in `sim/` (see `sim/CLAUDE.md`); this directory draws a `Match` and turns input into commands. Everything here is cosmetic: lockstep never sees it.

## Sound (`soundEvents.ts`, `soundMix.ts`, `audio.ts`; layer: this game's own, nothing in the protocol)

Each page makes its own sounds from the same match, so nothing goes over the wire and a page with sound off or unavailable plays the same game.

- **`soundEvents.ts`** (Pixi-free) turns a tick into cues: `shots`, `deaths` and `razed` as the rules give them; a new tower, a castle level, a bought upgrade and a fallen castle by comparing with the last tick (`SoundWatch`), so the computers' and a rival's actions sound too. Cues the player cannot see are silent (`canSee`).
- **`soundMix.ts`** (Pixi-free) sets **loudness and pan by where the action is on screen** (`mixAt`: full near the middle of the view, quieter towards and past its edge, silent far off, leaning to the side it comes from). The player's own builds and upgrades are heard in full wherever they look (`OWN`); `loudest` keeps a crowd from becoming a wall of noise.
- **`audio.ts`** plays the Ogg files in `public/audio/sfx/<kind>-<n>.ogg` with Web Audio (credits and licences in `public/audio/CREDITS.md`; only CC0 or CC-BY, listed there). It starts on the first click or key press (browsers require it), loads lazily, caps each kind per tick and 24 voices, varies the pitch a little, and **M** or the speaker button mutes (`localStorage` `towercraft:muted`).
- **`music.ts`** loops one background track through the same output (`audioOutput`), so **M** mutes it too. It starts when a match begins (`begin`) and fades out when it ends (`showEnd`); one track serves every map, and it waits for the first click if the match began before audio was unlocked. Files in `public/audio/music/` (credits in `public/audio/CREDITS.md`). Every page plays its own copy (host and guest alike), since nothing goes over the wire.
- A new sound: add its kind to `SoundKind`, a `SOUNDS` entry and the files, and a cue in `SoundWatch.collect` (with a test). A new track: a file pair in `public/audio/music/` and a credit, then pick it in `music.ts`.
