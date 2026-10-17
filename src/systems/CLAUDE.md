# src/systems: Pixi-free rules

Rules live here, Pixi-free and unit-tested; the Pixi side is in `entities/` and the scene drives them. Every rule that
changes a hero either succeeds completely or changes nothing and says why. Each file's header says what it does; the
DM's systems (`dm*.ts`) are in `docs/dungeon-master.md`. Below: the cross-cutting design.

## Capabilities (what a campaign switches off or tunes)

A capability (`capabilities.ts`, `CAPABILITIES`) is an engine system a story can do without: a campaign sets it in
`scenarios.json` (`false` off, `true` on, or an object of settings), a biome may override it for its own zone
(`scope: 'zone'`), and a random campaign takes it from its arc and regions. Each entry says what switching it off does
(`off`), its scope, what it `requires` and its settings. `checkCapabilities` is the one validator
(used by `parseContent` and `checkPacks`); content asking for what its own switches turn off is refused
(`checkAgainstCapabilities`).

**A system a story could do without must be a capability, in the same change that adds it.** Gate it with
`enabled(id, zone)` at the one choke point where the feature starts and read tuned values with `setting`. Co-op needs nothing on the wire: both players have the same table; the host gates rules. `tools/content/capabilities.test.ts` fails a
capability nothing asks `enabled()` about or that is not listed here. The ids: `guide`, `compass`, `needs`, `combos`,
`skills`, `farming`, `weather`, `dayNight`, `carrying`, `roaming`, `levelGates`, `forge`, `coop`, `trading`.

**The map is core engine, not a capability**: always on (M, the HUD button, any mode or zone; a room opens a note). Its aids,
`guide` (hints, tracker line, `fog`) and `compass` (the arrow), are switched by story and per player (`aids.ts`, local).

## Balance

Each `MobKind` is tuned for a band of hero levels and biomes hand them out by band; `balance.test.ts` guards it. Bows deal about 75% of a same-priced sword's damage per second, a wand's plain bolt about 65%, a tome's about 40%; a combo is a burst for mana, not a better sword. **Retune against that test.**

## Features (design notes)

- **Quests** (`quests.ts`, `guide.ts`): a chain per campaign told by givers (the campaign's `"scope": "hero"` epic, `content/story.ts`); objectives kill, boss (an authored end boss, `docs/epics.md`), gather, bring, meet, visit, and two that use a capability (core engine, refused
  where it is off): `cast` spells (`combos`) and `haul` barrels to a named place (`carrying`, a bit per barrel index like
  a gather's sites); chapters and journal lore make a story. Guidance is local to each player (an arrow for a person or
  door, a search area for something to find). Quest text must use the biomes' `name`s (`guide.test.ts`). Directions carry compass bearings (`bearing.ts`, text only) on the arrow label and in the DM writers' rules. The host owns every `QuestLog`; a guest sends `do` talk and action presses and reads the log from `pack`. Online only the DM's quests count (`docs/dungeon-master.md`).
  A scenario choice's optional `hint` (content, solo) says why it is shut; door/zone gating is not done.
- **The DM's quest kinds** (`dmTasks.ts`, `dmQuests.ts`; core engine, counted by the host, friends told in the `dm` message, append-only kinds): beside hunt, gather, find, visit, cast and haul there are **boss** and **master**. A boss (`dmBoss.ts`) is the land's toughest foe drawn as a named giant (`MobKind.boss`, counted under `BOSS_KEY`), whose health,
  blow and defense come from a typical hero of the party's level and size (`heroModel`: no content id, a fair fight at any level; `balance.test.ts` keeps its odds between 1.15 and 2.5).
  `StoryUi.syncBoss` makes it on every page from the quest alone (the zone's last foe, so snapshot indexes agree); the host's compass follows it;
  it pays richer than a hunt (`DmTasks.finish` has a gear-drop hook). A mastery asks for N casts of one combo
  a wand or tome of the party teaches (`Land.combos`, `combos` capability; `castIn` takes the spell id).
- **Melee aim assist** (`meleeAssist.ts`): `Simulation.attack` turns a swing toward a near foe its facing would miss (not with mouse aim); host-owned.
- **Magic** (`spells.ts`, `skills.ts`, `Casting.ts`): wands and tomes are weapons with combos (direction taps) that cast
  spells for mana; **every wand and tome is unique** (no spell or string on two weapons or inside another or a
  skill's: tests check). Innate skills are earned in training-ground trials. `heroCombos` is the one
  list the reader, HUD and caster use; a guest detects the combo and sends only its index.
- **Survival** (`needs.ts`, `crops.ts`): food and water drain with time (host/solo only; a guest shows what `pack` says). Drinking is steady, from ponds that drain and **only rain refills**, only while no foe is near; a dry pond is walkable. Crops need three
  waterings, are decided by the host and ride the snapshot as a state code.
- **Weather and day** (`weather.ts`, `daynight.ts`): cosmetic atmosphere per biome (lightning aside, not combat or collision). The host rolls each occupied zone's weather and sends it in the snapshot; the clock reads the wall clock.
- **Inventory, economy, chests** (`inventory.ts`, `shops.ts`, `chests.ts`, `trade.ts`): the host owns every hero's gold,
  pack and gear. A guest applies an inventory op at once and sends the oldest unconfirmed one (numbered); the
  host does each once, in order, and confirms with `pack.ack`. Shops specialise and buy back only their own trade at a
  fraction of value; chests hold what shops don't. An item's code is its place in its campaign's list, so
  `items.json` is append-only.
- **Director cues** (`cues.ts`, core engine, co-op): the DM's words may carry inline `<cue:anim|sfx|camera .../>` stage
  directions (closed vocabulary; its header is the design). The host checks the tagged text (`cleanCued`), all that goes
  on the wire; every page cuts the tags out of the caption and plays each when the reading reaches it
  (`Dialog`, `Cues.ts`, `sfx.ts`, `Camera.shake`). Cosmetic, local, no state. A new cue is vocabulary in
  `cues.ts` first (the types force its player), then a line in the bot's `DIRECTOR_RULES`.
- **Gems and the forge** (`gems.ts`, `dmForge.ts`, `dmGear.ts`; core engine, capability `forge`): a gem is an item with
  a `gem` property (what it adds to a weapon, `arms`, and to other gear, `worn`); the Set action on the Inventory tab spends
  one to make "Emerald-encrusted Steel Sword" (base plus gem, dearer, same look), in place. The pieces are
  **derived ahead of time** for every (gear, gem) pair when the items are installed (`FUSED`, ids `base+gem`, after the authored
  items), so an item's code still names it on the wire and in trades: both players derive the same list from the same content. `InvOp` `fuse` is a numbered op, done by the host (`fuseInto`, the one `forge` gate). Gems are sold at the smith
  (`gem` is a shop kind) and may be chest loot; the DM's `forge` quest names a recipe from what a hero carries or a shop
  sells, done when anyone makes that piece.
  DM gear rewards (`giftFor`) weigh every slot per hero, rotate the slot and cap the value.
- **Roaming people** (`roam.ts`; core engine, capability `roaming`, content `EntityDef.roam`): a scenario's person strolls about
  their post within a radius, only where `Collision.canMove` allows; talked to, they stop, face the speaker, then go home. Givers and keepers never roam. The host steps them; a guest draws `SnapMsg.folk`.
- **Props** (`barrels.ts`, `signs.ts`, `pets.ts`, `ice.ts`): barrels are bodies you carry and set down (gated by
  `carrying`; the host decides, `SnapMsg.barrels` shows them; a map object in a neighbour's margin is not this map's
  barrel); signposts read their ways from the loaded map when read (a live DM's `sign` log entry overrides); pets are local
  scenery (each player's wander independently); ice is a velocity rule for players.
