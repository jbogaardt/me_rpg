# The Dungeon Master (co-op host)

Read this before touching the DM bar, director, cards, epics, possession, revive or narration. Code:
`src/scenes/overworld/Dm*.ts`, `src/systems/dm*.ts`, `src/hud/Dm*.ts`; each pure file's header says what it does.

## Philosophy

- **There is one way to host, and the host is the DM.** Hosting is running the world, not playing in it. From the first
  friend's connection player 0 has `dm` set (`Arena.setDm`); a guest knows that with nothing on the wire (`DM_SLOT`).
  Solo has no DM (a solo player in a live world gets only the cards), but a solo player is their own host: the epic
  runner (`DmEpics`, `DmTasks`) and the DM's words work in solo too, so an epic is told alone as it is to a party; only a
  friend (a guest) never runs one. A solo player begins one from the card the director offers in a live world; the
  sandbox campaign has no way to begin one by hand yet.
- **A human DM steers, never spawns.** They shape how hard the world pushes (pressure) and what happens in it (story,
  sky, quests), never what is in it. The old person form and Cast tab are gone; the log's `cast`/`npc` entries are the door
  for AI help: the DM bot (below) makes a person and sets them near the party through them.
- **Steer by reacting, not by digging.** No admin panel: a bar that is always there, big tools as hot buttons, and cards
  that appear at the right moment with two or three buttons and go away if ignored. **Nothing pops up for the DM**:
  director nudges and player requests wait in an inbox (a count on a button). There are no cooldowns; a DM is never made
  to wait.
- **Pre-canned words** for the director's moves keep the DM's voice consistent; the DM's own words are short and shown to everyone
  as a caption (`hud/Dialog.ts`): plain text on a clear background that takes no input, never stops play, leaves by
  itself, and is also spoken by the browser's voice (`hud/voice.ts`, mutable).

A friend can also **walk up to the DM and press the action key**: the DM greets them (a short conversation), then the
same request list as the 💬 button opens, so a concern goes to the DM's inbox like any other ask (bot or person).

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
- **Epic quests** (`docs/epics.md`): the DM's only quests, sagas of steps with people, as data: `content/epics.json` and
  the campaign's own `quests.json`; run by `DmEpics` on the host (and in solo). A step is a quest kind or a meeting with a
  person the DM makes; people's words follow the story. No one-shot quests are handed out.
- **Narration, revive, possession.** `DmNarration.ts` says the welcome and chapter openings in the DM's voice.
  `DmRevive.ts` lets the DM raise or fetch a fallen player (a defeat still wakes them at the start, whole).
  **Possession** (`DmPossession.ts`, host only): click or tap a living foe and it is theirs; their keys and attack drive
  it through the usual damage rules. Their own body rides invisibly on it (`Player.hidden`, `FLAG.hidden`) so the camera,
  zone and friends' view follow, and they can never die. While possessing, pop-ups are hidden and the director waits.

## A bot as the DM

The DM can be a program (`server/`, the DM bot): `?dmbot` puts a handle on the page (`DmBot.ts`) through which an outside
script hosts, opens the inbox, answers cards, takes story roads, replies, speaks, follows the party and strolls about them (`walk`: a held direction for a moment, so a stopped bot stops walking; a far party is walked to, a near one ambled around, the DM is never a statue), starts the game and narrates unasked, in a wise old wanderer's voice (new areas, a quest done, a hurt friend, a quiet table), and
brings in a stranger on reaching a new area (`spawn`: an `npc` then a `cast` entry on open ground 3-8 cells from the party,
checked by the world like any entry, so a bad invention is refused).
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
