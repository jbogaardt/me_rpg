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
- Every tick `turn.ts` picks one step: open a game, begin, go to the party, answer the card up, open the inbox, or begin an
  epic quest when nothing is asked of the party. Everything the DM is asked arrives as a card: the director's nudges
  (struggling, too easy, a fallen player, a new land, the story's next road) and the players' requests and own words.
- `narrate.ts` is the DM speaking up unasked: `beatFor` spots a moment (the party reached a new area, a quest ended, a
  friend fell low, the table went quiet) and a `Narrator` words it through the DM's `say`. It never talks over a card, a
  lobby or a line spoken in the last 20 s. The mock narrator uses stock lines; a creative model slots in behind the same
  interface.
- `epics.ts` is what the bot tells when nothing is asked of the party (`quest` step): an epic of several quests and
  people (`src/content/epics.json`; the page runs it, `DmBot.epic`). A `EpicWriter` supplies one: the mock tells the
  content's epics in turn, `DM_BOT_CLAUDE=1` has Claude write a new one for the place in the same JSON. The page checks it as
  strictly as the content's own and refuses a bad one; the bot then tells a stock epic, else waits.
- `arc.ts` is the evening's tale: written once as the first saga is told (a threat, a stake, 3 to 5 chapter lines, the
  last the reckoning), then each saga is told as its next chapter. The arc lives in the bot, not the model's memory (the
  Claude session is renewed and a small model forgets), so every saga prompt and the narrator are handed it afresh:
  that is how Haiku holds a long story. Told out, a new arc grows from its ending. The mock has stock arcs.
  **Ending beat**: when the last chapter's saga is completed (`epicsDone`, the page's count, goes up) the DM speaks an
  epilogue (`arcEpilogue`: the title and the reckoning line); a lost or called-off final saga says nothing. A saga's own
  closing scene and reward are `DmEpics.close`. The end-boss quests (#34) can hook epic completion instead of `epicsDone`.
  The log line "the game code is gone" means the relay forgot the room (its code ran out, or the poll failed for good); the
  cause of a mid-game loss in issue #44 is not traced (no log), friends already in are unaffected.
- After a saga ends the party is left to wander for `BREATHER_MS` (town, shops, talk) before another is offered; a
  written saga has at most one hunt and at least one townsperson to meet, and never mentions the map.
- `conjure.ts` makes people: on arriving somewhere new (at most 6 a game, 2 minutes apart) a `Conjurer` invents a
  stranger (name, a look from the world's people, up to 4 short lines) and the page's `spawn` sets them near the party.
  The mock conjurer has a few stock characters; the page refuses anything the world's checks refuse.
- The page's `sign(lines)` writes on the signpost beside the DM (a live world's `sign` log entry); the bot's loop does not use it yet.
- `claude.ts` is the creative tier through a headless Claude Code session (`DM_BOT_CLAUDE=1`): one standing `claude -p` session (`ClaudeSession`: stream-json in and out, renewed after 40 turns or any failure) on a
  small model, no tools, none of this machine's MCP servers, skills or settings (that was ~27k tokens a call), run from
  an empty folder, so a machine already logged in to Claude Code needs no API key. It
  words replies, narration and new people; each answer is checked like the mocks' (a person's name, look and lines), and
  any failure or timeout (30 s) falls back to the mock. Player words go in as quoted data, never as instructions.
- The DM's voice (`PERSONA` in `narrate.ts`) is a gentle wizard: warm, dry, cryptic, never an alert. The mock lines speak
  in it; a creative model is given it as its system prompt.
- `router.ts` answers a card (`decideCard`). **A player's typed words always go to the creative writer (Haiku) and its reply
  is always sent; Jev never votes "nothing" on them.** The writer is shown the party's task, the running epic, the DM's
  recent replies and the card's options (a pick it makes is checked against them). A reply that repeats a recent one
  (`isRepeat`), says "follow the way", is empty or is a guess (`sure` under 0.5) is asked for once more with the reason,
  then replaced by a plain answer (the saga and task). Jev does the passive work: one choice question over a
  director's card's options (taken at confidence 0.55, `HINTS` and the party's health describe them), and events with no
  player words. **An unsure Jev (or none) never makes a guess a world change:** easy/struggle/lost/done take the card's
  own `stay`, revive takes `leave`, and twist, pressure, epic and suggest take nothing (the card is dismissed); only
  story and sky still ask the writer (`IMPROVISED_WHEN_UNSURE`, move source `safe`). A card with no options skips Jev (nothing to choose). While an epic or quest runs "give them a quest" is
  not offered. The writer's JSON is checked before use, so it can only choose what was offered.
- The router is TypeSafe's Jev (`jev.ts`, the `@typesafe-ai/sdk` client) when `TYPESAFE_API_KEY` is set, and a
  word-matching mock (`mocks.ts`) otherwise; the bot says which at start. `TYPESAFE_DEFAULT_MODEL` pins a model
  (`jev-latest` by default). The creative fallback is still the mock until a model is chosen for it.
- API keys belong in the bot's environment, never in the page or the repo: `TYPESAFE_API_KEY=... npm run dm-bot`.

The bot can do what a person at the DM bar can, and no more: it cannot invent places or monsters. New people for a
live world (the world log's `npc` and `cast` entries, validated and sent to every player) are the next door to open.

## The table read (Jev beyond cards)

A failed read (e.g. "fetch failed") is retried by `RetryingReader` (3 attempts, doubling waits from 500 ms); after the
last the host logs the step that failed and the timers decide until the next read.

`pulse.ts` + `JevReader` (`jev.ts`): every `PULSE_MS` (8 s, in the background) one request asks Jev four independent questions
over the same small, named state (percentages and seconds, no ids): a `score` of how hard pressed the party is (levels
are described situations) and `noul`s for stalled / a word would help / needs a quest. Code owns the policy: the DM
speaks unprompted when `wantsWord` ≥ 0.7 (never twice within 30 s), a quest is offered when `needsQuest` ≥ 0.7 (never
twice within 20 s), and the pressure sets the tone of the narration. Without a key, or when a read is older than 24 s,
the old timers (90 s silence, 45 s quiet) decide. Written with the TypeSafe agent skill's guidance (fan-out, atomic
judgments, state in named fields, thresholds in code); check a change with a few hand-made states against the real API.

## The scene verdict and directed narration (Jev → Haiku → the page)

`scene.ts`: for a moment with an actor (today a friend fallen low, `factsFor`), Jev reads the drama as three `choice`
questions in one request (`JevScene` in `jev.ts`): `dramatic_tension` (`comic_relief`, `mounting_dread`, `furious_clash`,
`hushed_suspense`), `environmental_twist` (`footing_compromised`, `cover_destroyed`, `lighting_changed`, `none`) and
`npc_reaction_state` (`flinching`, `taunting`, `desperate`, `calculating`). The game's own `mechanical` resolution rides
beside them untouched: code decides what happened, Jev how it should read. A failing or off-vocabulary Jev leaves the
rules (`ruleDrama`, also the keyless default). `verdictBrief` writes the whole verdict into Haiku's prompt, with the
improv frame for the outcome (`success` Yes, and; `partial` Yes, but; `setback` No, and), and `DIRECTOR_RULES` is its
system prompt: a tabletop curator who writes `<cue:.../>` tags (`src/systems/cues.ts`) exactly where the action lands,
anchors every line in light, texture or sound, and uses no stock fantasy filler (`hasFiller` checks it; a line that
fails, or has no words, is replaced by the stock line, which the mock directs too). The line goes to the page through
`say` like any other and is checked again there (`cleanCued`).

Try it: `DM_BOT_CLAUDE=1 TYPESAFE_API_KEY=... npm run dm-bot` and let a friend fall below a quarter health (the log
prints `scene: furious_clash, lighting_changed, taunting`); without keys the stock narrator and the rules do the same.
Offline: `npx vitest run server/scene.test.ts src/systems/cues.test.ts` plays a lunge, a dodge and a breaking lantern
from Jev's verdict to the dispatched cues.

## The game's report

The page's host notebook (`src/scenes/overworld/DmReport.ts`) notes what players say to the DM, the director's nudges,
knockouts and quest ends, each with the state of the game then; `DmBot.reports` hands it over. The bot prints each note as a
`[report]` line, appends it to `reports/raw/<date>-<code>.jsonl` (ignored by git) and, when the game ends (everyone left, or
you `quit`), triages it (below) and has Haiku read it as a playtest analyst (`report.ts`, `analystSession` in `claude.ts`) and writes
`reports/<date>-<code>.md`: a prompt file a future Claude session acts on. With no model (not logged in, a failure, 4 minutes
without an answer) or `DM_BOT_REPORT=plain` the same file is written by rules. Players are P1, P2...; links, emails and long
numbers are cut; **read the file before committing it**.

### Two Jev workflows

Both speak the vocabulary in `src/systems/feedback.ts` and use `JevTagger` (`jev.ts`: a `choice` for the kind and a `score` for
how much it matters, over the words and the state they were said in) with `TYPESAFE_API_KEY`, else the keyword rules.
**In the game** (`host.ts` `tagLive`): each utterance is tagged in the background as it arrives, the tag is kept on the entry
(and a `tagOf` line in the raw log), and a short, sure complaint is asked back privately by the DM after a pause (`followUpFor`:
not twice to a player within 3 minutes, at most 3 a game, canned wordings only). The table read is kept as an engagement curve
(`curve.ts`). **After the game** (`triage.ts`): tag what is missing or unsure, add hotspots found in the state, cluster, check each
claim against the numbers, rank; the findings go to `reports/raw/<date>-<code>.findings.json` and, as the small digest, to Haiku.
The log goes to TypeSafe for Jev (already scrubbed of links, emails and long numbers; players are P1, P2...).

