# The Dungeon Master (co-op host)

Read this before touching the DM bar, director, cards, epics, possession, revive or narration. Code:
`src/scenes/overworld/Dm*.ts`, `src/systems/dm*.ts`, `src/hud/Dm*.ts`; each pure file's header says what it does.

## Philosophy

- **There is one way to host, and the host is the DM.** Hosting is running the world, not playing in it. From the first
  friend's connection player 0 has `dm` set (`Arena.setDm`); a guest knows that with nothing on the wire (`DM_SLOT`).
  Solo has no DM (a solo player in a live world gets only the cards), but a solo player is their own host: the epic
  runner (`DmEpics`, `DmTasks`) and the DM's words work in solo too; a friend (a guest) never runs one. A solo player
  begins one from the director's card in a live world; the sandbox has no way to begin one by hand yet.
- **A human DM steers, never spawns.** They shape how hard the world pushes (pressure) and what happens in it (story,
  sky, quests), never what is in it. The log's `cast`/`npc` entries are the door
  for AI help: the DM bot (below) makes a person and sets them near the party through them.
- **Steer by reacting, not by digging.** No admin panel: an always-there bar with hot buttons, and cards with two or three
  buttons that go away if ignored. **Nothing pops up for the DM**: director nudges and player requests wait in an inbox
  (a count on a button). No cooldowns; a DM is never made to wait.
- **Pre-canned words** for the director's moves keep the DM's voice consistent, each in several wordings
  (`systems/phrases.ts`: none comes back until the others have been said); the DM's own words are short and shown to everyone
  as a caption (`hud/Dialog.ts`) that takes no input, never stops play, leaves by itself, and is also spoken by the
  natural voice (default; browser's as fallback, `hud/voice.ts`, mutable). A person speaks only through their own dialog.

A friend talks to the DM in **free-form words**: the 💬 button (or Enter) opens one line, Enter sends it. It waits in the
DM's inbox like any ask, and the DM (a person or the bot) may answer it privately, or act on it (ease off, point the way,
begin a quest). The DM also watches the party's health on their own.

## The DM has a voice

A theatrical old storyteller with a dry wit, fond of the party and not above teasing it, never a bare "Well done."
`systems/dmVoice.ts` holds several wordings of each moment the game spots, picked by a `Phrasebook`; the bot's model gets
the same character (`server/narrate.ts` `PERSONA`). **A new spoken moment is a bank there, with a test, never one stock line.**

## The DM is the story teller

With a DM at the table, no story belongs to the map. The world's own quest chain (givers, welcome, chapters, title
cards) is a solo thing: online only the trainer stays and the host's welcome is a plain greeting. Anyone who guides a
quest is a person the DM brings in (`Story.bring`, or the people of an epic); a ready-made story is loaded as an epic.

## The DM is not one of the party

`Arena.party()` (players without the DM) is what the rules ask; `players()` is everyone, for drawing,
snapshots and the map. So no mob hunts the DM, kills credit only the party, heals pass them by, they block nobody and
neither trade nor cast. They walk through walls-only collision (`Simulation.updateDm`); their action key only
reads signs and advances dialogs. Their screens differ: a DM badge instead of bars, no quest arrow or
harvest buttons, and a Party tab (levels, HP, area, **Go**).

## Parts

- **Director** (`dmDirector.ts` says WHEN, `DmPrompts.ts` builds each card and does the pick, `hud/DmCard.ts` draws it):
  watches party health, task progress and quiet time, and suggests easing off, turning up the heat, a twist, which quest
  (after a breather once one ends), the compass (the map stays the party's own; the compass leans toward the place, then
  points at it), a breather, a new land's sky, raising a fallen player, or the story's next road (a vote).
  Urgent cards wait less; dismissing one is a breather.
- **Inbox** (`dmRequests.ts`): director nudges and **players' requests** (their own free-form words, from the 💬
  button) land here, one of a kind at a time, and expire. The DM **answers privately** (a canned reply or typed words,
  `DmMsg.reply`).
- **Hot buttons** (`hud/DmBar.ts`): Smite (a lightning storm; foes die with no XP, gold or credit, the party is never
  hurt), Freeze, Reset zone, Stop time (the party walks and takes doors; all else stands still): ordinary events and mob states.
- **Epic quests** (`docs/epics.md`): the DM's only quests, sagas of steps with people, as data: `content/epics.json` and
  the campaign's own `quests.json`; run by `DmEpics` on the host (and in solo). A step is a quest kind or a meeting with a
  person the DM makes; people's words follow the story. No one-shot quests are handed out. Beside hunts, gathers, finds and
  visits a step may be a **boss** (the land's toughest foe as a named giant for the party's level and size, `dmBoss.ts`;
  friends build the same one from the quest), a **mastery** (cast one named combo N times) or a **forge** (set a gem in a
  piece: `dmForge.ts`). Gear rewards are chosen per hero and rotate by slot (`dmGear.ts`): a saga's finale and a forge quest pay one.
- **Narration, revive, possession.** `DmNarration.ts` says the welcome and chapter openings in the DM's voice.
  `DmRevive.ts` raises or fetches a fallen player. **Possession** (`DmPossession.ts`, host only): click or tap a living foe and it is theirs; their keys and attack drive
  it through the usual damage rules. Their body rides invisibly on it (`Player.hidden`) so the camera and
  friends' view follow, and they cannot die. While possessing, pop-ups are hidden and the director waits.
- **Signposts** read the layout (`systems/signs.ts`): each way names the zone really reached that way, a place of the map
  stays, a way with nothing beyond it is dropped (all gone: a dry line). In a **live** world the DM may rewrite one: stand
  beside it, type (pages split by `|`) and tap Write on sign (Restore sign gives it back): a `sign` log entry, sent to
  friends with the log. Other campaigns have no log: the buttons are off there, the layout text applies.

## A bot as the DM

The DM can be a program (`server/`, the DM bot): `?dmbot` puts a handle on the page (`DmBot.ts`) through which an outside
script hosts, opens the inbox, answers cards, takes story roads, replies, speaks, follows and strolls about the party (the
DM is never a statue), starts the game, narrates unasked (new areas, a quest done, a hurt friend, a quiet table; a hurt
friend's moment is read by Jev and told with `systems/cues.ts` cues, `server/README.md`) and brings in a stranger on reaching a new area
(`spawn`: an `npc` then a `cast` entry on open ground 3-8 cells from the party, checked by the world like any entry).
Every call is a step the bar already offers.

## Co-op rules

The host owns everything; friends are told. The host sends each friend a `dm` message when it changes and once a second.
A friend's vote and requests ride in every input as **state with counters** (never events). Leaving online
play resets all the DM state (`DmDesk`, `DmPowers`, `DmTasks`, `DmNarration`, `DmRevive`, `DmPossession`, `DmPrompts`).

## Traps

- **Touch** (`core/touch.ts`) cancels every touch's default action outside an allow-list (`keepDefault`), which also
  stops the browser making the click: **a new tappable overlay must be added to it** (`#dm-bar`, `#dm-card`, `#vote`
  are). On a phone the bar moves to the top (the pad owns the bottom), cards sit near the top with 44 px buttons, and the
  e2e checks nothing overlaps `#dpad`/`#buttons`.
- A card redraws its buttons only when they change: a button replaced under a tap swallows the tap.
- Anything the DM does that friends must see goes through the snapshot or the `dm` message, with a protocol bump and
  test (see `src/net/CLAUDE.md`).
