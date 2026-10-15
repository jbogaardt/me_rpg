# The Dungeon Master (co-op host)

Read this before touching the DM bar, director, cards, DM quests, epics, possession, revive or narration. Code:
`src/scenes/overworld/Dm*.ts`, `src/systems/dm*.ts`, `src/hud/Dm*.ts`; each pure file's header says what it does.

## Philosophy

- **There is one way to host, and the host is the DM.** Hosting is running the world, not playing in it. From the first
  friend's connection player 0 has `dm` set (`Arena.setDm`); a guest knows that with nothing on the wire (`DM_SLOT`).
  Solo has no DM (a solo player in a live world gets only the story cards).
- **The DM steers, never spawns.** They shape how hard the world pushes (pressure) and what happens in it (story, sky,
  quests), never what is in it. The old person form and Cast tab are gone; the log's `cast`/`npc` entries remain as the
  door for AI help.
- **Steer by reacting, not by digging.** No admin panel: a bar that is always there, big tools as hot buttons, and cards
  that appear at the right moment with two or three buttons and go away if ignored. **Nothing pops up for the DM**:
  director nudges and player requests wait in an inbox (a count on a button). There are no cooldowns; a DM is never made
  to wait.
- **Pre-canned words** for the director's moves keep the DM's voice consistent; the DM's own words are short, dismissible
  (✕, Esc, or a click on the game) and shown to everyone.

## The DM is not one of the party

`Arena.party()` (the zone's players without the DM) is what the rules ask; `players()` stays everyone, for drawing,
snapshots and the map. So no mob hunts or hurts the DM, kills credit only the party, heals pass them by, they block
nobody and neither trade nor cast. They walk through walls-only collision (`Simulation.updateDm`); their action key only
reads signs and advances dialogs. Their screens differ: a "Dungeon Master" badge instead of bars, no quest arrow or
harvest buttons, and a Party tab (levels, HP, area, **Go**).

## Parts

- **Director** (`dmDirector.ts` says WHEN, `DmPrompts.ts` builds each card and does the pick, `hud/DmCard.ts` draws it):
  watches party health, task progress and quiet time, and suggests easing off, turning up the heat, a twist, which quest,
  pointing the way, a breather, a new land's sky, raising a fallen player, or the story's next road (with a vote).
  Urgent cards wait less than the rest; a dismissed card is a breather.
- **Inbox** (`dmRequests.ts`): director nudges and **players' requests** (canned asks plus their own words, from the 💬
  button) land here, one of a kind at a time, and expire. The DM **answers privately** (a canned reply or typed words,
  `DmMsg.reply`).
- **Hot buttons** (`hud/DmBar.ts`): Smite (a lightning storm; foes die with no XP, gold or credit, the party is never
  hurt), Freeze, Reset zone, Stop time. **Stop time** lets the party walk and take doors but stands foes, crops, weather
  and everything else still. All are ordinary events and mob states, so friends see them through the usual snapshots.
- **DM quests** (`dmTasks.ts` rules, `dmQuests.ts` offers, `DmTasks.ts` on the host): real quests written from the land
  the DM stands in (hunt, gather, reach a place, find a relic), one at a time beside the story chain, paid to the whole
  party. The party gets a **search area, never an arrow**; the DM can point the way. **Online only the DM's quests
  count**: the story chain's givers only pass the time of day. A quest is read to every player like an NPC's
  (`dmBrief.ts`), and a quest can switch capabilities for the whole party while it is taken (`Quest.capabilities`).
- **Epic quests** (`dmEpics.ts`, `DmEpics.ts`): sagas, chains of DM quests across lands, as templates with no content
  id, planned onto whatever world is played by walking its zone links; each carries a gauge (difficulty, length, reach).
  A failed or cancelled step ends the saga.
- **Narration, revive, possession.** `DmNarration.ts` says the welcome and chapter openings in the DM's voice.
  `DmRevive.ts` lets the DM raise or fetch a fallen player (a defeat still wakes them at the start, whole).
  **Possession** (`DmPossession.ts`, host only): click or tap a living foe and it is theirs; their keys and attack drive
  it through the usual damage rules. Their own body rides invisibly on it (`Player.hidden`, `FLAG.hidden`) so the camera,
  zone and friends' view follow, and they can never die. While possessing, pop-ups are hidden and the director waits.

## A bot as the DM

The DM can be a program (`server/`, the DM bot): `?dmbot` puts a handle on the page (`DmBot.ts`) through which an outside
script hosts, opens the inbox, answers cards, takes story roads, replies, speaks, follows the party and starts the game.
Every call is a step the bar already offers, so nothing new is on the wire; without `?dmbot` the handle does not exist.

## Co-op rules

The host owns everything; friends are told. The host sends each friend a `dm` message when it changes and once a second.
A friend's vote and requests ride in every input as **state with counters** (lossy channel, never events). Leaving online
play resets all the DM state (`DmDesk`, `DmPowers`, `DmTasks`, `DmNarration`, `DmRevive`, `DmPossession`, `DmPrompts`).

## Traps

- **Touch** (`core/touch.ts`) cancels every touch's default action outside an allow-list (`keepDefault`), which also
  stops the browser making the click: **a new tappable overlay must be added to it** (`#dm-bar`, `#dm-card`, `#vote`
  are). On a phone the bar moves to the top (the pad owns the bottom), cards sit near the top with 44 px buttons, and the
  e2e checks nothing overlaps `#dpad`/`#buttons`.
- A card redraws its buttons only when they change: a button replaced under a tap swallows the tap.
- Anything the DM does that friends must see goes through the snapshot or the `dm` message, with a protocol bump and
  test (see `src/net/CLAUDE.md`).
