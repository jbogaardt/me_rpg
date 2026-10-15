# server: the autonomous Dungeon Master

A bot that hosts a game of the deployed page as its Dungeon Master, so friends can play with no person hosting. It is
not part of the game: it drives the page from outside through one handle, and the game plays exactly as before without
it.

## How it works

- `host.ts` opens the page in a headless Chromium (Playwright) with `?dmbot` in the address, opens a game and prints its
  code. All WebRTC stays in the browser, as with a person hosting; a lapsed code is replaced while nobody is at the table.
- `?dmbot` makes the page put `window.dmBot` up (`src/scenes/overworld/DmBot.ts`) and hand every friend's request to the
  DM (a canned ask or their own words) to `window.onPlayerAction(slot, text, state)`, which the script exposes.
- `router.ts` decides (`evaluateAction`): a fast router answers one choice question (which of the live story's next
  roads, or none); at confidence 0.80 or more its road is taken. Otherwise a creative fallback writes the reply and may
  pick a road, and its JSON is checked before use. The script then calls `dmBot.choose(cue)` and `dmBot.reply(slot, text)`.
- The AI services are mocked (`mocks.ts`) until the real APIs are chosen: put a real `ChoiceRouter` and
  `CreativeFallback` in their place in `host.ts`. API keys belong in the bot's environment, never in the page or the repo.

The bot can only choose among roads the page offers and speak; it cannot invent places or monsters. Those go through the
same validated content steps as everything else (the "AI help for the DM" item in the roadmap).

## Running it

```
npm run dm-bot                                         # the live site, a new live world (?campaign=live)
npm run dm-bot -- 'http://localhost:4173/?campaign=live&seed=7'
```

`PW_CHROMIUM` points at a local Chromium (in cloud sessions `/opt/pw-browsers/chromium-*/chrome-linux/chrome`);
`DM_BOT_HEADED=1` shows the window. Friends must play the same build as the bot's page (the co-op handshake turns a
different version away), so run it against the site they use. Against a local build, start the relay and build with it:
`npm run relay`, then `VITE_RELAY_URL=http://localhost:8787 npm run build && npm run preview`.
