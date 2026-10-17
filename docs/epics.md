# Epics: one quest layer for a story, a saga, a party and a hero

Read this before touching `content/epics.json`, `content/story.ts`, `systems/dmEpics.ts`, `systems/dmPeople.ts`,
`DmEpics.ts`, `DmTasks.ts`, or a campaign's `quests.json`. How the Dungeon Master fits is in `docs/dungeon-master.md`.

## One format

A campaign's story and the DM's sagas are written in one file shape (`content/story.ts`): `people`, `sites`, `welcome`,
`epilogue` and `epics`. An epic with `"scope": "hero"` is the campaign's own story, played by each hero through the
quest log: chapters of steps, told by the people with offer, remind and done words, objectives bound to the campaign's
own zones, mobs and items. An epic with `"scope": "party"` (the default) is a saga the Dungeon Master tells the whole
party. Both are `epics` of one file, so a story is written in one place whether it is played alone, online or both.
`splitStory` turns the file into the flat form `parseQuests` has always read, so no check or engine reader changed; a
flat file (random and live worlds' generators still write one) passes through. `tools/content/story.test.ts` holds the
epic form to the old flat file, and `tools/content/migrateStory.ts` moved the sandbox campaigns over.

## One set of rules

Every quest, whoever holds it, is a `Quest` (`quests.ts`) counted by the same rules: `progressIn`, `killIn`, `visitIn`,
`siteOpenIn`, `siteIn` read and move a `QuestLog` for a `Quest`. A hero's quest is the story's quest in their own log (the
campaign's people hand it out and take it back: `talk`); the party's quest is a DM step made into a `Quest` (`questOf`, from
what the land holds) in the party's one log (`TaskBook`, `partyLog`): the **holder** and the **trigger** differ, the rules do
not, so a fix to what counts as a kill, a site or a visit is made once. A relic is a gather of the one `relic` site.
The wires are unchanged: a hero's log rides `pack` as `[stage, taken, progress]`; the party's quest rides `dm` as a `TaskView`.

## DM epics (`scope: party`)

An epic is a saga of steps as **data**, with no land and no content id: a step is a `hop` from where the saga starts, a
person has a name and a look word. It is planned onto whatever world is played by walking its zone links, so one epic runs
in any biome that has the lands; each carries a gauge (difficulty, length, reach). The built-in sagas are
`content/epics.json`; a campaign's `quests.json` may hold more, and an AI may write one (`DmBot.epic`): `parseEpic` checks
all of them as strictly as a world entry (an unknown person, a person met twice or never, too long a line).

A step is either **resolved** from whatever land it falls in (`kind` hunt, gather, find or visit, and a `hop`) or **named
outright** (`objective`, in the campaign quests' own words: `{"t": "kill", "kind": "goblin", "count": 4, "zone":
"greenwood"}`; never a bring or a meet), which binds it to that campaign's content and is checked against it, so a campaign
writes a saga about its own world (`greenwood_reckoning` in campaign 1) and a pack-style one runs anywhere. A resolved step is a
quest kind (hunt, gather, find, visit, cast spells where the party has magic, haul barrels to a named place; a land
without one tells another kind: `dmTasks.ts` rules, `dmQuests.ts` writes each from the land,
`DmTasks.ts` runs it) or `meet`. For `meet` the DM makes the step's person (an `npc` then a `cast` entry of the live world,
on open ground in the step's land, wearing the look a word names), the party is sent to find them (a `visit` quest at
their feet), and on reaching them the DM only says they are there: **the person speaks through their own dialog when talked
to** (`DmEpics.meet` puts the step's lines on them, `talked` hears the action press that talks to them, solo, host or a
friend's, and the saga goes on a few seconds later), never in the DM's voice, and may give something to carry (`gives`, named in the telling for a later step to ask for). The party is told in
**words only, nothing on the map** (the map is the party's own): when the DM notices they are lost (the director's card, or
a player asking) the DM offers a **compass** that leans toward the place to search, and only a second time points straight at it (`HINT_AREA`, `HINT_ARROW`, protocol v44). A failed or cancelled step ends the saga. A step is read to
every player like an NPC's (`dmBrief.ts`), and a quest can switch capabilities for the whole party while it is taken
(`Quest.capabilities`). Epics with people need a live world (people are log entries, which friends already receive).

**People's words follow the epic**: a person has `lines` (before the party is sent to them), `after` (once met) and
`finished` (once the whole epic is done), like a campaign giver's offer, remind and done lines; each change is a `voice`
entry of the world log (the person's new lines, replacing the old: protocol v42), applied to the person where they stand
on every page.

## Who runs it

The host, and a solo player (their own host): `DmEpics`, `DmTasks` and the DM's words work wherever the page is not a
friend, so an epic is told alone as it is to a party. A friend only draws it (the `dm` message and the world log). A solo
player in a live world is offered an epic by the director's card; the sandbox campaign has no way to begin one by hand
yet. Online only the DM's quests count: the story chain's givers only pass the time of day.

## Not yet

A `gives` token in the pack (it is the DM's word; a finished saga does hand each hero real gear, `upgradeFor`: a step up of
the way they fight, sized to the party's level), a person who turns on the party, branching, the packs' arcs (a third quest
format that assembles live worlds), people placed by the maps (a campaign's givers) and by the log (the DM's) as one
mechanism, and one *trigger* for both holders (a giver's talk, or the runner) with one telling for what a step says.
