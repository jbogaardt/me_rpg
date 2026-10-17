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
- **Steer by reacting, not by digging.** No admin panel: an always-there bar with hot buttons, and cards with two or three
  buttons that go away if ignored. **Nothing pops up for the DM**: director nudges and player requests wait in an inbox
  (a count on a button). No cooldowns; a DM is never made to wait.
- **Pre-canned words** for the director's moves keep the DM's voice consistent, each in several wordings
  (`systems/phrases.ts`: none comes back until the others have been said); the DM's own words are short and shown to everyone
  as a caption (`hud/Dialog.ts`): plain text on a clear background that takes no input, never stops play, leaves by
  itself, and is also spoken by the browser's voice or the opt-in natural one (`hud/voice.ts`, mutable). A person speaks only
  through their own dialog, when talked to, never in the DM's voice.

A friend talks to the DM in **free-form words**: the 💬 button (or Enter) opens one line, Enter sends it. No buttons and no
walking up to the DM. It waits in the DM's inbox like any ask, and the DM (a person or the bot) may answer it privately,
or act on it (ease off, point the way, begin a quest). The DM also watches the party's health on their own.

## The DM has a voice

A theatrical old storyteller with a dry wit, fond of the party and not above teasing it: a raised eyebrow, a small wager,
an aside, never a bare "Well done." The canned words (`systems/dmVoice.ts`) hold several wordings of each moment the game spots
(a quest done, failed or called off, the compass, a reply, the welcome, a saga's end), picked by a `Phrasebook`; the DM bot's model is given the same character
(`server/narrate.ts` `PERSONA`). **A new spoken moment is a bank there, several wordings and a test, never one stock line.**

## The DM is the story teller

With a DM at the table, no story belongs to the map. The world's own quest chain (its keeper and other givers, its welcome,
chapters, field notes and title cards) is a solo thing: online the givers are not there (only the trainer, a teacher, stays),
nothing of the chain is told, and the host's welcome is a plain greeting. Anyone who guides a quest is a person the DM
brings in (`Story.bring`, or the people of an epic), and a ready-made story is loaded by the DM as an epic when it is told,
never half-present in the map beside what the DM is doing.

## The DM is not one of the party

`Arena.party()` (the zone's players without the DM) is what the rules ask; `players()` stays everyone, for drawing,
snapshots and the map. So no mob hunts or hurts the DM, kills credit only the party, heals pass them by, they block
nobody and neither trade nor cast. They walk through walls-only collision (`Simulation.updateDm`); their action key only
reads signs and advances dialogs. Their screens differ: a "Dungeon Master" badge instead of bars, no quest arrow or
harvest buttons, and a Party tab (levels, HP, area, **Go**).

## Parts

- **Director** (`dmDirector.ts` says WHEN, `DmPrompts.ts` builds each card and does the pick, `hud/DmCard.ts` draws it):
  watches party health, task progress and quiet time, and suggests easing off, turning up the heat, a twist, which quest
  (after a breather once one ends), the compass (the map stays the party's own; the compass leans toward the place, then
  points at it), a breather, a new land's sky, raising a fallen player, or the story's next road (a vote).
  Urgent cards wait less; a dismissed card is a breather.
- **Inbox** (`dmRequests.ts`): director nudges and **players' requests** (their own free-form words, from the 💬
  button) land here, one of a kind at a time, and expire. The DM **answers privately** (a canned reply or typed words,
  `DmMsg.reply`).
- **Hot buttons** (`hud/DmBar.ts`): Smite (a lightning storm; foes die with no XP, gold or credit, the party is never
  hurt), Freeze, Reset zone, Stop time (the party walks and takes doors; everything else stands still). All are ordinary
  events and mob states, so friends see them through the usual snapshots.
- **Epic quests** (`docs/epics.md`): the DM's only quests, sagas of steps with people, as data: `content/epics.json` and
  the campaign's own `quests.json`; run by `DmEpics` on the host (and in solo). A step is a quest kind or a meeting with a
  person the DM makes; people's words follow the story. No one-shot quests are handed out.
- **Narration, revive, possession.** `DmNarration.ts` says the welcome and chapter openings in the DM's voice.
  `DmRevive.ts` lets the DM raise or fetch a fallen player.
  **Possession** (`DmPossession.ts`, host only): click or tap a living foe and it is theirs; their keys and attack drive
  it through the usual damage rules. Their own body rides invisibly on it (`Player.hidden`, `FLAG.hidden`) so the camera,
  zone and friends' view follow, and they can never die. While possessing, pop-ups are hidden and the director waits.

## A bot as the DM

The DM can be a program (`server/`, the DM bot): `?dmbot` puts a handle on the page (`DmBot.ts`) through which an outside
script hosts, opens the inbox, answers cards, takes story roads, replies, speaks, follows and strolls about the party (the
DM is never a statue), starts the game, narrates unasked (new areas, a quest done, a hurt friend, a quiet table; a hurt
friend's moment is read by Jev and told with `systems/cues.ts` cues, `server/README.md`) and brings in a stranger on reaching a new area
(`spawn`: an `npc` then a `cast` entry on open ground 3-8 cells from the party, checked by the world like any entry).
Every call is a step the bar already offers: nothing new on the wire.

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
