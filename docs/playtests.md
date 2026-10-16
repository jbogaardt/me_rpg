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
