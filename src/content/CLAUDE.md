# src/content: worlds as data

What a world holds (who, where, what story, which goods) is data, never engine code. The schema, readers and
cross-checks are in `schema.ts`; the file headers of `packs.ts`, `world.ts`, `ports.ts`, `populate.ts` and
`campaignChoice.ts` document each format. This file is the design.

## Campaigns

A campaign is a folder `public/content/<campaign>/` of five JSON files: `entities`, `biomes`, `quests`, `items`,
`scenarios`. `quests.json` is the campaign's **story as an epic file** (`story.ts`, `docs/epics.md`): its people, sites, welcome,
epilogue and epics, the story each hero plays and any sagas the DM may tell. `splitStory` turns it into the flat form
`parseQuests` reads.

Campaign 1 is the sandbox (features are tried there first); campaign 2 proves the engine runs other content. Tests install campaign 1 (`tools/content/setup.ts`); `campaigns.test.ts` holds every
campaign to the same rules. Which world a page plays comes from its address (`campaignChoice.ts`).

Invariants that bite:

- **Item codes are an item's place in its campaign's list**, so `items.json` is append-only once players are on it
  (co-op peers agree because they play the same content).
- **The pieces gems make follow the authored items in the codes** (`systems/gems.ts`): an item with a `gem` property (what it
  adds to a weapon and to other gear) makes one piece per gear item, derived at install, never written in `items.json`. An
  item id cannot hold `+`. Packs carry no gems yet, so only campaign 1's chests hold them (`ruby`, `emerald`, `topaz`, `sapphire` loots).
- **Populations are deterministic** (`populate.ts`): a guest builds the same mobs in the same order as the host, and
  snapshots refer to mobs by index. Anything that changes who stands in a zone must keep that order.
- **Who stands in a zone is the content's, never the map's** (scenario node placements, then the biome's `roam`). A placed person
  may stroll about their post: `EntityDef.roam` (npc only, at most 8 cells), capability `roaming`. Givers and keepers never roam.
- **Foe bands** (`systems/bands.ts`, core engine): a roam group or placement may carry `level` (a group also `within` circles, the deep end of a zone): its foes are re-made as a fair fight for that hero level, same look and role, pay following the level. Campaign 1 bands its deepest ground and eastern lands; the band check judges a banded group at its own level.
- **Scenarios are solo only**: online, every zone shows its biome's own node. When the host dictates nodes, it must send
  a `node_id` per zone.
- **Capabilities** (`src/systems/CLAUDE.md`): content asking for what its own switches turn off is refused at load.

## Packs and random campaigns

Packs (`public/content/packs/`) are the same content in mix-and-match pieces: mobs by role and theme, keepers,
regions, **pairings** and **arcs**. The rule that shapes everything: **two regions are only joined where a pairing says
they can be**, and a pairing carries the lore a story may quote. An arc is a story written against roles
(`@r2.boss`), not ids; the assembler picks regions and mobs that fit its slots and writes ordinary campaign files, so the
engine and every check see nothing new. It lays regions on a grid (leaving north arrives in the south, so a loop of doors
comes home), adds a few side regions, bolts a dead end onto every open port, and seals what is left. It scales to
thousands of regions because it only walks pairing partners.

A **haven** (`haven: true`, the `towns` pack's Hearthmere) is a safe harbour: no foes, never a story step. Live and
random worlds set one beside the start (`World.havenEntry`, a `side` entry) wherever a pairing allows and the story can
still be told around it, so most games have a town to rest in and to send errands from. A region's `rooms` (Hearthmere's
four shops) come with it: a biome and node each, linked to the region's map by doors, running the packs' `shops`. A live world
also opens with up to `WANDER_LANDS` side lands beside its start and town (`wanderEntry`, the same story check), so it
has somewhere to roam off the story's road (the `heartlands` pack's Thornwood and Mistmoor are such lands).

**Depth bands** (`depth.ts`, content): a region's danger follows its depth (`World.depthOf`: the start 0, story step *i* is *i*, a side land or dead end one more than its host), about a level per region at first then flattening, capped at `MAX_BAND`. `World.files` writes it into each region with foes: biome `levels` (1-3 at the start), roam `level`, placement `level` (a `boss` at the band's top): a pack kind is tougher deeper, its own `level` still picks the mob. Pure in the log (live regions get theirs as they grow; nothing is sent); havens have none.

A pack never silently overrides another's ids (`checkPacks`, `mergePacks`). To add a region: a `defineZone` map with
`z.port`s (a `keeper` spot for a hub, `z.site`s for gather arcs), an entry in a pack and a pairing (with `way` and `sign`
lore) to each region it may sit beside.

## Ports

A port is a doorway whose far side the content decides, so the same map serves campaign 2 and the packs. A biome binds
each port to another map's port; `Zones.add` turns bound ports into ordinary doors (travel, prefetch and co-op see
nothing new) and **walls up and seals every port nothing binds**, so no open way ever leads nowhere. The map check fails
a port without a seal or bound to a port that is not on the opposite edge.

## Worlds from a log

A world is a seed, the packs and an append-only **log** of fully resolved entries (`begin`, `step`, `side`, `join`, and the DM's `cast`, `npc`, `voice` and `sign`: a person made, put somewhere, given new words; a signpost rewritten, or restored by empty lines).
`World.apply` validates each entry against the packs' rules and refuses a bad one without changing anything; a person (`npc`) whose id **or name** (ignoring case and spacing, the packs' people included) is already in the world is refused (cast or `voice` them instead; every campaign's people have distinct names, `campaigns.test.ts`);
`replay(log)` rebuilds a world with no random numbers, so every co-op player and every later solver agrees. `assemble`
is an automatic Dungeon Master that writes a whole log at once; a **live world** (`?campaign=live`) is written during
play: the DM chooses story cues (a kind of land and crossing, never a map) and the solver picks regions that still let
the arc be told (`Story.ts` grows it; the new ports open in loaded zones with `Zones.rewire`). The host sends the log in chunks (`WorldMsg`); a friend applies the entries after its own.

## Epics

`epics.json` holds the DM's epics: sagas of quests and people, the shape an AI may write (`parseEpic` in
`systems/dmEpics.ts`; a bad epic stops the boot). An epic names no land and no content id (steps are hops from where it
starts), so one runs in any world; those with people need a live world (`npc`/`cast` log entries, `docs/dungeon-master.md`).

## Checks

`npm run map -- check` (`tools/content/check.ts`) fails a biome whose map, tilesets, climate or links disagree with the
maps and doors, a placement or spawn off its own biome's open ground, and quests that cannot be done (too few
sites, a mob that lives nowhere). It also checks every campaign, the packs' catalog and random campaigns of seeds 1-40;
`tools/content/packs.test.ts` assembles 150 seeds and holds each to the game's own checks.

## Level bands (`systems/levels.ts`; core engine, content, capability `levelGates`)

A biome may declare `levels: [lowest, highest]`: banner advice, and a map-check that each foe it places is a fair fight for a typical hero (`heroModel`) at the lowest level (error: 2 hits fell the hero or over 14 blows; warning: no fight at the top). With `levelGates` on, a door turns back a hero more than `slack` (default 1) levels under the lowest (`Zones.turnedAway`, host-side). Campaign 1 gates only its first two underground rooms.
