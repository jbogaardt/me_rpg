# Playtests: how we iterate on the DM

A playtest is a real game against the deployed page, with the bot's log read beside the player's words. Every run is
written down here and turned into changes.

## The loop

1. Push; wait for the GitHub Pages deploy (`gh run list --workflow deploy.yml`).
2. Claude starts `DM_BOT_START=1 DM_BOT_HEADED=1 DM_BOT_CLAUDE=1 npm run dm-bot` (key in `TYPESAFE_API_KEY`), gives the
   game code and watches the log while the player plays. The player's page must be the same build (reload).
3. The player says what felt wrong in their own words; Claude reads the log for the cause (`table:` lines,
   `[router NN%]` / `[fallback NN%]`, `telling`, `going to`), fixes, adds a test, pushes, restarts the bot.
4. Add the run below: what was said, what the log showed, what changed.

## Where it is headed

The DM builds worlds, quests and people on the fly and tells them as a story that makes players want to act: a named
stake, who is in trouble, what to do next. Not a helper that acknowledges, not a riddle: plain facts with a reason to
care. Places are never named unless the game gave them.

## Rules the playtests settled

- The DM's words are short, concrete, never a dialog: a caption plus the browser's voice, queued, never cut short.
- A popup (dialog box) appears only when the player starts a conversation; everything else is passive text.
- Talking to the DM is free-form words (💬 or Enter), no buttons. What the DM does to the world (easing, heat, an
  arrow) is felt, not announced. The DM watches the party's health on their own.
- With a DM, the DM is the only storyteller: no map quest givers, chapters or welcome story online; whoever guides a
  quest is brought in by the DM. Every telling of a quest ends with the tracker's own objective.
- A saga speaks for itself (no remarks over it), closes with a glad person, how it ended and the reward, and the next
  saga builds on the last and travels (the world is grown to three lands first).
- Picking things up never pops up: a site's note is passive text, once per kind; a quest's telling is not repeated when
  its search area moves; a director's card is acted on, never answered aloud.
- Hints wait for the DM to notice: a quest is told in words, the map is marked only when the party is lost, an arrow
  only after that. Each stock line has several wordings. The evening has one arc; sagas are its chapters.
- Pacing: a breather to wander after each saga; foes stay down 60 s; online, mobs leave a player with no input for 10 s; heat is not turned up twice in 5 min.
- The DM walks to a party in his zone, and only teleports to one elsewhere or very far.

## Runs

- **Caption, voice, table read**: slow start, cryptic lore, mixed popups. Log: table read worked; teleport repeated.
  Changed: unasked text became captions, the first saga told at once (later reverted to model-written), plain writing rules.
- **Attack key, "clippy", mobs**: the DM-talk-on-action bug (it stayed in reach), canned acks, invented places, an
  overrun hub. Changed: players' words can ask for ease/heat/arrow, narration may not invent places, calmer hubs.
- **Keeper silent, voice cut off, repeats**: online the keeper only idled; each caption cancelled the speech.
  Changed: queued captions that finish, narration must say something new, the model writes the first saga.
- **Neighbour three times, a freeze**: opening, step text and narration all retold one premise. Changed: no narration
  over a saga, silent steering, no talking in a fight. The freeze was not reproduced (suspect: a pausing talk mid-fight).
- **Free-form chat, same disclosure**: the request panel became one text line; `objective` in `systems/dmBrief.ts`.
- **No payoff, no sequel, constant fights**: closing scene with reward, sagas that build and travel, 60 s respawn,
  AFK mercy, no unprompted remarks (`DM_BOT_CHATTER=1` brings them back).
- Open: items as rewards (saga rewards are XP and gold); whether 60 s respawn leaves enough foes for a hunt; the AFK
  rule is online only; the fallen-player card repeats; check that Claude's sagas really use hops 1 to 3.

## What a player can report (the Report tab)

The pause menu's **Report** tab (`hud/Report.ts`, counters in `systems/engagement.ts`, kept by `scenes/overworld/Pacing.ts`) is
how a player tells us how a session went without us watching: time (busy and idle), first kill and first quest, kills and
knockouts (the host counts them; a guest's page says so), quests started, done and lost, the longest stall, breathers, the
zones and time spent in each, three mood faces, an "I am stuck" button and one free line. **Copy report** puts it as plain
text on the clipboard; the same counters go to the console as one `[engage]` line at each quest end, breather and mood, so
the bot's log and the player's words line up. Nothing leaves the device unless the player copies it. They are proxies, not a
verdict: read them with what the player says, and expect knockouts per zone to show a zone pitched too high.

A **breather** (`systems/breather.ts`) is the pause after a quest, said out loud: a 🍺 badge with a clock over the left of the
screen (`hud/BreatherBadge.ts`, with the three mood faces) and one line from the DM (`BREATHER_WORDS`), and the director leaves
the same minute before it offers the next quest. It is local to each page, started by the quest each already sees end (a
saga's middle step is no lull). Lanternrest's tavern, the Resting Lantern, is where a party spends it.
