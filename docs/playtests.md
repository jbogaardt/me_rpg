# Playtests: how we iterate on the DM

A playtest is a real game against the deployed page, with the bot's log read alongside the player's words. It is how the
DM gets better, so every run is written down here and turned into changes.

## The loop

1. Push; wait for the GitHub Pages deploy (`gh run list --workflow deploy.yml`).
2. Claude starts `DM_BOT_START=1 DM_BOT_HEADED=1 DM_BOT_CLAUDE=1 npm run dm-bot` (the key is in `TYPESAFE_API_KEY`),
   gives the game code, and watches the log while the player plays. A player's page must be the same build (reload).
3. The player says what felt wrong in their own words; Claude reads the log for the cause (table lines, `[router NN%]` /
   `[fallback NN%]`, narration, `going to`), fixes, adds a test, pushes, and restarts the bot for the next run.
4. Add the run below: what was said, what the log showed, what changed.

## Rules the playtests settled

- The DM's words are short, plain and concrete (no riddles); they are a caption and a spoken voice, never a dialog.
- A popup (dialog box) appears only when the player starts a conversation. Everything else is passive text.
- The DM can be talked to in person like an NPC.
- The first saga is told at once from the stock; the model writes later ones.
- The DM walks to a party in his zone and only teleports to one in another zone or very far.

## Where it is headed

The DM builds worlds, quests and people on the fly and tells them as a story that makes players want to act: a named
stake, who is in trouble, what to do next. Not a helper that acknowledges ("So be it"), and not a riddle either: plain
facts, with a reason to care. Invented places are never named unless the game gave them (no made-up bridges).

## Runs

### 2026-10-16: caption, voice, table read
- Said: slow to know what is going on at the start; cannot talk to the DM like an NPC; lore too cryptic; text popups
  appear when not talking to anyone and differ from the DM's text, which is cumbersome.
- Log: table read worked (word 94% after a minute of silence, narration concrete); `going to Player 3` repeated every 10 s
  because he teleported when nobody was within 14 cells; the first epic waited on the model.
- Changed: unasked text (defeat, DM quest brief, chapter note, trial result) became captions (`Dialog.note`); walking up
  to the DM opens the request list after a greeting; the first saga is the stock one, told at once; the writing rules
  ask for plain, concrete language; he walks to a party in his zone up to 40 cells away.
- Open: pressure read 0% right after a fall (the fallen player had respawned at full health: probably right); check the
  start-up delay again (the lobby settle of 10 s remains).

### 2026-10-16 (second run): attack key, "clippy", too many mobs
- Said: the DM's overlay text is tied to the attack button and repeats while fighting; everything is still cryptic; the DM
  feels like a dumb helper ("so be it, follow the way"); wants a backstory that compels; the first zone is overrun with
  mobs (a fight every 2 seconds).
- Log: replies were canned acknowledgements ("So be it: point the way."); narration invented places (an old bridge, the
  village of Harrow, a lighthouse); "too many mobs" got a made-up route instead of easing off, because a player's words
  could not map to Ease off / Point the way; "Player 3 has fallen" came up four times in three minutes.
- Cause of the attack-key bug: walking up to the DM opened a conversation on every press, and he stays within reach. Now
  never when a foe is within 10 cells.
- Changed: a player's words can ask for Ease off, Turn up the danger or Point the way, with plain answers; the DM's bar
  texts are plain; narration is given the saga's story and may not name places it was not given; the saga stock was
  rewritten as stories with stakes; the two hub regions have fewer wandering foes and a wider calm around the spawn.
- Open: the fallen-player card repeats (offer a smarter default, e.g. raise them where they fell when the fight is over);
  Claude-written sagas should be checked for the same stakes.
