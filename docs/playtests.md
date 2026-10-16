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

### 2026-10-16 (third run): keeper silent, voice cut off, repeating
- Said: told to go to the keeper but the keeper says nothing; the audio is cut short; repeating the same stuff feels
  dumb and should be AI; the voice cuts itself off when it triggers its own voice action.
- Log: narration returned to the same hand-print in the mud three times (the saga's opening was fed to the model each
  time); the first saga was the stock one, not written by the model.
- Cause (keeper): online, `talk(hero, giver, story=false)` gives a quest giver only idle lines (the DM gives the quests),
  while the live arc's welcome sends players to the keeper. Cause (voice): each new caption cancelled the speech and a
  caption's timer cut it off before it finished.
- Changed: online the keeper tells the DM's current quest again; captions queue (a few at most) and wait for the speech
  to end, a line is spoken sentence by sentence; the first saga is written by the model again (stock only as a fallback);
  narration must reveal one new thing each time and is told not to retell the opening.
- Open: the arc's own quests and the DM's sagas still run side by side in a live world; the welcome should hand over to
  the DM's saga.

### Rule from the third run: the DM is the story teller
- Said: with a DM there are no story quests but the ones he manages; an NPC who guides a quest is spawned by the DM; a
  ready-made story loads dynamically and must not fight a map that already has its own.
- Changed: online the map's quest givers are gone (only the trainer stays) and are hidden; the world's chapters, field
  notes, title cards and welcome are not told online; the host's welcome is a plain greeting. People who guide a quest
  come from the DM (`Story.bring`, an epic's people).

### 2026-10-16 (fourth run): the neighbour three times, announcements, a freeze
- Said: the missing-neighbour quote came three times; the DM announcing that mobs eased is unwanted (it should be felt);
  the game froze.
- Log: the saga's opening, its step text and the narration beats all retold the same premise; two Claude-written sagas
  were refused by the page (`people` not an object, an empty `who`) and the stock saga was told; narration invented
  characters (a child, a fisherman).
- Changed: no narration beats while a saga runs or between its steps (it tells itself); a DM's own words on a task are not
  shown a second time as text; easing, heating, closing in and pointing the way are silent; the saga writer is shown an
  example that has people and told how `people` and `who` work; with a foe within 10 cells the action key only swings
  (no talk, so no world pause to read) for anyone but the DM.
- Open: the freeze is not reproduced. Suspect: a pausing conversation opened mid-fight with a DM-brought person (the
  action key talks to anyone adjacent), now blocked. If it happens again note what was on screen and the time.

### 2026-10-16 (fifth run): free-form chat, same disclosure
- Said: talking to the DM should be free-form chat, no buttons, the DM still watching whether I am beaten; drop talking by
  walking up; if the quest says kill 4 goblins the DM must not say something vague like "something is stirring".
- Changed: the request panel is one text line (💬 or Enter opens, Enter sends); the canned asks and the walk-up talk are
  gone; every telling of a quest (the DM's note or the stock brief) now ends with the tracker's own objective
  ("Defeat 4 Goblins in the Mirewood."), via `objective` in `systems/dmBrief.ts`.
- Also fixed: my last change had hidden a saga's step text entirely; it shows again (as captions).

### 2026-10-16 (sixth run): no payoff, no sequel, constant fights
- Said: too many repeats; quests end without a story (no sense of an item, XP, a glad NPC); the next quest does not build
  on the last and everything stays in one zone; foes respawn far too fast; it should be an adventure where I can go AFK
  and not be beaten to death; if I need the DM to reorient me I can ask.
- Log: three "easy work, raise the stakes" cards in three minutes (each adds foes); unprompted remarks over the saga; the
  next saga written from the area alone.
- Changed: a saga now ends with a closing scene (the last person met says they are glad, the DM tells how it ended and
  what each player earned: XP and gold); the next saga is written knowing how the last ended and is asked to travel
  (half its steps in other lands); foes stay down 60 s (was 6); online, a player with no input for 10 s is left alone by
  mobs; heat is not turned up twice within 5 minutes; the bot no longer makes unprompted remarks (set
  `DM_BOT_CHATTER=1` to bring them back) and replies to a player's words know the current task and story.
- Open: items as rewards (a saga's reward is XP and gold; an item needs a pick from the shops/loot); whether a 60 s
  respawn leaves enough foes for a hunt quest; the game's own AFK rule is online only.
- Then: before telling a saga the bot opens the story's next road while the world has fewer than 3 lands, so the saga has
  other lands to send the party to (`MIN_LANDS` in `server/host.ts`). Not yet seen in a real run.
