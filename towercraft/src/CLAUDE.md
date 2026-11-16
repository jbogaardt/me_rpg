# towercraft/src: the page (drawing, input, sound)

Rules are in `sim/` (see `sim/CLAUDE.md`); this directory draws a `Match` and turns input into commands. Everything here is cosmetic: lockstep never sees it.

## Colours (`recolor.ts`; layer: this game's own, cosmetic)

- **Seat colours**: a duel paints each seat in its race's hue (`RACE_HUE`); with more seats, the side's (`SIDE_HUE`). A further seat sharing a hue gets a shade (`shadeOf`), so two of one race still tell apart.
- **Painted pictures**: Wyrmsun's buildings carry their player colour as purple. `recolor` moves only the purple pixels (wood, stone and gold stay) to the seat's hue, keeping shading. `main.ts` paints each picture once per colour (`buildingTex`; the dock and cards use `buildingUrl`).

## Sound (`soundBank.ts`, `soundClass.ts`, `soundEvents.ts`, `soundMix.ts`, `audio.ts`; layer: this game's own, nothing in the protocol)

Each page makes its own sounds from the same match; nothing goes over the wire. Every sound is a recording or layered recordings (no synthesized cues); build recipes and the credit table are in `public/audio/CREDITS.md`.

- **`soundBank.ts`** (Pixi-free): every kind as data (`BANK`: variants, gain, per-tick `max`, repeat `gap`, `prio`, pitch drift, `duck`). Files are `public/audio/sfx/<kind>-<n>.ogg`, mono, normalised per group; a test checks every file exists, is in the bank and is credited, and that `public/audio` stays under 14 MB. A new sound: a `BANK` entry, its files, a credit row, then a cue.
- **`soundClass.ts`** (Pixi-free): what each unit and tower sounds like (`UNIT_WEAPON`, `TOWER_WEAPON`: a test fails for a unit or tower with no entry), deaths by race and creature (`UNIT_DEATH`), where a missile lands (`impactKind`: a wall by its material, flesh, a burst), map to theme (`themeOf`; co-op maps wear a duel's), and `kindsForMatch`: a match loads only the effects its races use.
- **`soundEvents.ts`** turns a tick into cues: each shot by its attacker's weapon plus a landing for a ranged one, deaths, razed buildings (small timber or large stone), a new tower or a unit entering a bunker, castle level, upgrade, fallen castle, alarm, warn, pay-day, clock, win/lose (`SoundWatch`). Unseen cues are silent (`canSee`).
- **`soundMix.ts`** sets **loudness and pan by where the action is** (`mixAt`; the player's own and alerts in full), keeps the `loudest` of a kind and the `budget` of `TICK_BUDGET` most important sounds per tick (big events beat a shower of blows).
- **`audio.ts`**: Web Audio with an sfx bus, an ambience bus under it, a music bus with a low-pass, one master gain (**M** mutes) and a compressor; `volume`/`setVolume` (`sfx`, `music`) persist. The first gesture starts the context, loads only the interface sounds and wakes the title music (`onUnlock`); `startMatchAudio` (`matchAudio.ts`, called from `begin`) loads the races' effects, the theme's ambience and music. Variants never repeat, 28 voices at most, a hidden tab suspends the context.
- **`music.ts`, `playlist.ts`, `ambience.ts`**: the title has an intro and a loop; a match crossfades to its theme's rotation of battle tracks, the end fades them. The ambience bed loops under the sfx volume and ducks (`duck`) under alarms and stingers.
- **`uiSound.ts`**: `click` on every button, `refuse`, `confirm` (a unit trained), `tick`; a gesture makes one sound. **`voice.ts`**: a unit's line on `pick` and `go` (`voiceLines.ts`; mono Ogg `public/audio/voice/<race>-<unit>-<line>.ogg`, ElevenLabs speech; a new unit needs two files).

## Battle effects and art (`fx.ts`, `fxKinds.ts`, `fxArt.ts`, `wreck.ts`, `crisp.ts`, `hurt.ts`; cosmetic)

`art/fx/` is Wyrmsun's (copied by `tools/towercraftArt.ts`; `smoke`, `hit`, `slash` from `tools/towercraftFxArt.py`), cut by `fxArt.ts`. `fxKinds.ts` (Pixi-free) says what each shooter fires (`missileFor`, by sheet or tower art). `BattleFx.collect` (seen ground only) makes pooled, capped sprites: flat missiles turn to their heading, lobbed ones grow over a shadow, each ends in a puff, impact or fireball. `Wreck`: hurt buildings smoulder (smoke, animated fires), a falling one bursts, shows its sheet's second frame (`altOf`), sinks, leaves a scar; a new tower rises (`rising`). Sheets are enlarged 2x and sharpened once (`crisp.ts`) as resolution-2 textures, frames still cut in sheet pixels.

**Close range** (`main.ts`, `grain.ts`): `ZOOM_MAX` is ~1 on a 1x screen (more on dense ones) so the 72 px sheets show at most ~3x; `home` rests under it, castle whole. A faint world-space grain (`TilingSprite`, fades far out) keeps the ground textured close up. Fog is a soft dusk (per-map colour). Ground marks: soft shadow, thin team ring (`softRing`). A new tower is unmasked feet-up (`rising`). Dev `__tc.audio` counts what played: test sound in real time with the camera on the fight (fast-forward trips `gap`).

## Cards

The cards are pictures first: stat rows are an icon (`icons.ts`) and a value. The castle card shows only what it is now; the next level's cost, stats and needs are left to the button, whose label and reason say them. An upgrade button shows its bonus as a heart, a sword, the ground or a wing.

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
