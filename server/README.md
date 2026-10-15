# server: the autonomous Dungeon Master

A bot that runs a game as its Dungeon Master, start to finish, so a group can play with nobody hosting. Run it on any
machine with Node: it prints a two-word game code, the players join with it from their own devices, and the bot runs the
world from then on. It is not part of the game: it drives the deployed page from outside through one handle, and the
game plays exactly as before without it.

## Running it

```
npm ci                                                  # once (Playwright comes with the dev dependencies)
npx playwright install chromium                         # once, unless PW_CHROMIUM points at a Chromium already there
npm run dm-bot                                          # the live site, a new live world (?campaign=live)
DM_BOT_START=3 npm run dm-bot                           # begin by itself once 3 players are in
DM_BOT_CLAUDE=1 npm run dm-bot                            # reply, narrate and invent people with headless Claude Code (your login, no key)
npm run dm-bot -- 'https://jbogaardt.github.io/me_rpg/?campaign=live&seed=42'   # a world of your choosing
```

It prints `GAME CODE: brave-otters`; each player opens the site, Menu > Online > Join, and types it (a player's page on
another world moves to the bot's by itself). Type `start` once everyone is in (or set `DM_BOT_START`): the code closes
and the DM's welcome is told. Other commands: `say <words>` (speak as the DM), `status`, `quit`. When everyone has left,
or a code lapses with nobody in, the bot opens a new game and prints its code.

`PW_CHROMIUM` points at a local Chromium (in cloud sessions `/opt/pw-browsers/chromium-*/chrome-linux/chrome`);
`DM_BOT_HEADED=1` shows the window. Players must play the same build as the bot's page (the co-op handshake turns a
different version away), so point it at the site they use. Against a local build: `npm run relay`, then
`VITE_RELAY_URL=http://localhost:8787 npm run build && npm run preview`, and give the bot `http://localhost:4173/...`.

## How it works

- `host.ts` opens the page in a headless Chromium (Playwright) with `?dmbot` in the address and hosts the game. All
  WebRTC stays in the browser, as with a person hosting.
- `?dmbot` puts `window.dmBot` on the page (`src/scenes/overworld/DmBot.ts`): the table's state and the DM bar's own
  controls (open the inbox, put up a card, pick an option, take a story road, reply, speak, go to a player, start).
- Every tick `turn.ts` picks one step: open a game, begin, go to the party, answer the card up, open the inbox, or offer
  a quest when nothing is asked of the party. Everything the DM is asked arrives as a card: the director's nudges
  (struggling, too easy, a fallen player, a new land, the story's next road) and the players' requests and own words.
- `narrate.ts` is the DM speaking up unasked: `beatFor` spots a moment (the party reached a new area, a quest ended, a
  friend fell low, the table went quiet) and a `Narrator` words it through the DM's `say`. It never talks over a card, a
  lobby or a line spoken in the last 20 s. The mock narrator uses stock lines; a creative model slots in behind the same
  interface.
- `tales.ts` is what the bot tells instead of a plain quest (`quest` step, live worlds): a tale of several quests and
  people (`src/content/tales.json`; the page runs it, `DmBot.tale`). A `TaleWriter` supplies one: the mock tells the
  content's tales in turn, `DM_BOT_CLAUDE=1` has Claude write a new one for the place in the same JSON. The page checks it as
  strictly as the content's own and refuses a bad one; the bot then tells a stock tale, then a plain quest.
- `conjure.ts` makes people: on arriving somewhere new (at most 6 a game, 2 minutes apart) a `Conjurer` invents a
  stranger (name, a look from the world's people, up to 4 short lines) and the page's `spawn` sets them near the party.
  The mock conjurer has a few stock characters; the page refuses anything the world's checks refuse.
- `claude.ts` is the creative tier through a headless Claude Code session (`DM_BOT_CLAUDE=1`): `claude -p` on a small model,
  no tools, nothing saved, run from an empty folder, so a machine already logged in to Claude Code needs no API key. It
  words replies, narration and new people; each answer is checked like the mocks' (a person's name, look and lines), and
  any failure or timeout (30 s) falls back to the mock. Player words go in as quoted data, never as instructions.
- The DM's voice (`PERSONA` in `narrate.ts`) is a gentle wizard: warm, dry, cryptic, never an alert. The mock lines speak
  in it; a creative model is given it as its system prompt.
- `router.ts` answers a card (`decideCard`): a fast router answers one choice question over the card's options (plus
  the story's roads for a player's words, and "nothing"); at confidence 0.80 or more its pick is taken. Otherwise a
  creative fallback picks and writes the reply; its JSON is checked before use, so it can only choose what was offered.
- The router is TypeSafe's Jev (`jev.ts`, the `@typesafe-ai/sdk` client) when `TYPESAFE_API_KEY` is set, and a
  word-matching mock (`mocks.ts`) otherwise; the bot says which at start. `TYPESAFE_DEFAULT_MODEL` pins a model
  (`jev-latest` by default). The creative fallback is still the mock until a model is chosen for it.
- API keys belong in the bot's environment, never in the page or the repo: `TYPESAFE_API_KEY=... npm run dm-bot`.

The bot can do what a person at the DM bar can, and no more: it cannot invent places or monsters. New people for a
live world (the world log's `npc` and `cast` entries, validated and sent to every player) are the next door to open.
