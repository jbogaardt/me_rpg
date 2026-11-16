# towercraft/src: the page (drawing, input, sound)

Rules are in `sim/` (see `sim/CLAUDE.md`); this directory draws a `Match` and turns input into commands. Everything here is cosmetic: lockstep never sees it.

## Colours (`recolor.ts`; layer: this game's own, cosmetic)

- **Seat colours**: a duel paints each seat in its race's hue (`RACE_HUE`); with more seats, the side's (`SIDE_HUE`). A further seat sharing a hue gets a shade (`shadeOf`), so two of one race still tell apart.
- **Painted pictures**: Wyrmsun's buildings carry their player colour as purple. `recolor` moves only the purple pixels (wood, stone and gold stay) to the seat's hue, keeping shading. `main.ts` paints each picture once per colour (`buildingTex`; the dock and cards use `buildingUrl`).

## Sound (`soundEvents.ts`, `soundMix.ts`, `audio.ts`; layer: this game's own, nothing in the protocol)

Each page makes its own sounds from the same match; nothing goes over the wire.

- **`soundEvents.ts`** (Pixi-free) turns a tick into cues: `shots`, `deaths` and `razed` as the rules give them; a new tower, castle level, bought upgrade or fallen castle by comparing with the last tick (`SoundWatch`), so the computers' and a rival's actions sound too. Unseen cues are silent (`canSee`).
- **`soundMix.ts`** (Pixi-free) sets **loudness and pan by where the action is on screen** (`mixAt`: full mid-view, quieter towards and past the edge, silent far off, panned to its side). The player's own builds and upgrades are heard in full (`OWN`); `loudest` stops a crowd becoming a wall of noise.
- **`audio.ts`** plays the Ogg files in `public/audio/sfx/<kind>-<n>.ogg` with Web Audio (credits and licences in `public/audio/CREDITS.md`; only CC0 or CC-BY). Effects and voices go through an sfx gain, music through a music gain and a low-pass, both into one master gain (**M** or the speaker button mutes it) and a compressor. `volume`/`setVolume` are live and persist per channel. It unlocks on the first gesture (`installAudioLifecycle`, which also pauses while the tab is hidden and resumes an `interrupted` iOS context), loads lazily, caps kinds per tick and voices overall (24), varies pitch, quiets far-zoomed-out action (`zoomGain`) and opens the music's low-pass in a fight (`fightLevel`). No Web Audio, no sound.
- **`synth.ts`** (layer: this game's own) makes cues with Web Audio instead of files, so they need no licence: `RECIPES`. From the match through `SoundWatch.collect`: `alarm` (your castle hit, in full wherever you look, ducks the music), `warn` (a building of yours hit, only heard off screen), `coin` (pay-day with income, very quiet), `clock` / `clockLast` (before `TIME_LIMIT`), `win` / `lose` (once at the end; a draw has none). **`uiSound.ts`**: `click` on every button (one delegated listener), `refuse` (no money, limit, bad ground; `uiRefuse`), `confirm` (a unit trained), `tick` (a unit picked while its voice does not play). A gesture makes one sound: a refusal or confirm replaces the click. Six synthesized cues ring at once at most, but not the alarm or stingers.
- **`music.ts`** loops one background track through the same output (`audioOutput`), so **M** mutes it too. It starts with a match (`begin`) and fades out at the end (`showEnd`); one track serves every map, and it waits for the first click if audio is still locked. Files in `public/audio/music/`.
- **`voice.ts`** says a unit's line when you select it (`pick`) and when you send it at a foe (`go`). `voiceLines.ts` has both lines of every unit by race; files are `public/audio/voice/<race>-<unit>-<line>.wav` (ElevenLabs text-to-speech, one voice per race). A missing file is silent. A new unit needs its two lines (`voiceLines.test.ts` checks) and two WAVs.
- A new sound: a file kind is a `FileKind`, a `SOUNDS` entry and the files; a synthesized one is a `SynthKind` and a `RECIPES` entry (and in `SoundKind` if the match raises it). Either way, add a cue in `SoundWatch.collect` (with a test). A new track: a file pair in `public/audio/music/`, a credit, then pick it in `music.ts`.

## Battle effects and art (`fx.ts`, `fxKinds.ts`, `fxArt.ts`, `wreck.ts`, `crisp.ts`, `hurt.ts`; cosmetic)

`art/fx/` is Wyrmsun's (copied by `tools/towercraftArt.ts`; `smoke`, `hit`, `slash` from `tools/towercraftFxArt.py`), cut by `fxArt.ts`. `fxKinds.ts` (Pixi-free) says what each shooter fires (`missileFor`, by sheet or tower art). `BattleFx.collect` (seen ground only) makes pooled, capped sprites: flat missiles turn to their heading, lobbed ones grow over a shadow, each ends in a puff, impact or fireball. `Wreck`: hurt buildings smoulder (smoke, animated fires), a falling one bursts, shows its sheet's second frame (`altOf`), sinks, leaves a scar; a new tower rises (`rising`). Sheets are enlarged 2x and sharpened once (`crisp.ts`) as resolution-2 textures, frames still cut in sheet pixels.

## Cards

The cards are pictures first: stat rows are an icon (`icons.ts`, words in its tooltip) and a value. The castle card shows only what it is now; the next level's cost, stats and needs are left to the button, whose label and reason say them. An upgrade button shows its bonus as a heart, a sword, the ground or a wing.

## Status strip, minimap and alerts (`statusBar.ts`, `minimap.ts`, `hudModel.ts`; layer: this game's own, cosmetic, nothing in the protocol)

Read-only views of the `Match`; `main.ts` creates a `Hud` once, calls `hud.reset()` in `begin` and `hud.update()` each frame. The elements (`#status`, `#pay`, `#minimap`, `#alert`) show only under `body.playing`, so a match that ends hides them with no teardown.

- **Never assume seats**: the strip's sides come from `teamSeats` (yours left, every other seat right), `YOU` may be seat 1 (online guest), and a co-op side sums its castles. `hudModel.ts` is the Pixi-free, tested part.
- **The minimap shows what the field shows**: foes, their buildings and castles only through the same `isSeen` / `isCastleSeen` / `sightsFor` the drawing uses (an unseen foe castle is a faint ring at its camp). It redraws about 5 times a second, faster while a ping plays; its pointer events stop there (no pan or box), a tap or drag calls `focus`. It folds to a "Map" button.
- **Alerts compare health between updates** (`AlertWatch`): your castle or a building of yours hurt off screen, or an ally's castle fallen; one per kind every `ALERT_EVERY` seconds of match time. The toast pings the minimap; a tap moves the camera. Do not feed them from `shots`, so guests and rejoined matches stay right.
- Layout trap: the strip sits top centre on a desktop, between `#top` and `#cam` on a landscape phone, and on a second row (`#hint` moves down) on a portrait phone. The minimap is bottom-right on a desktop (short, under the open card) and under `#cam` on phones.

## Menus, keys and small screens (`pauseMenu.ts`, `howto.ts`, `hotkeys.ts`; cosmetic)

- **The in-match menu** (menu button or Esc with nothing picked): volumes, sound on/off (the only touch mute), How to play, Leave (`leaveMatch`). **Solo stands still while a panel is open** (`paused` in `main.ts`); **online never pauses** (lockstep), the panel only overlays.
- **Keys** (`hotkeys.ts`; never while typing, never with Ctrl/Meta/Alt): 1-9 the Nth dock building, H or Space home, F whole map, +/- zoom. Esc closes an open panel first.
- **Small screens** are CSS under the "UX agent" mark in `index.html` (later rules win): a scrolling dock with prices under the pictures, a short card sheet or narrow left panel, maps in one scrolling row. A wide row in an overlay must scroll, not widen it.
- **Look** (the "UI art agent" block, last in `index.html`: it wins by order, so do not give `#status` a `top` there, the phone rules set it): title backdrop `ui/bg/*.webp` (Wyrmsun paintings, CC0), glass chips, gold `.plank.on`/`#card-act`, race banners, end ribbon (`showEnd`). Fonts are self-hosted in `ui/fonts/` (the page once named them without loading). A painting needs a licence line in Wyrmsun's `graphics/credits.txt`.
