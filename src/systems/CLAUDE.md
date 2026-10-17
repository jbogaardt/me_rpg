# src/systems: Pixi-free rules

Rules live here, Pixi-free and unit-tested; the Pixi side is in `entities/` and the scene drives them. Every rule that
changes a hero either succeeds completely or changes nothing and says why. Each file's header says what it does; the
Dungeon Master's systems (`dm*.ts`) are in `docs/dungeon-master.md`. Below: the cross-cutting design.

## Capabilities (what a campaign switches off or tunes)

Not every story wants every system. A capability (`capabilities.ts`, `CAPABILITIES`) is an engine system a story can do
without: a campaign sets it in `scenarios.json` (`false` off, `true` on, or an object of settings), a biome may override
it for its own zone (`scope: 'zone'`), and a random campaign takes it from its arc and regions. Each entry says what
switching it off does (`off`), its scope, what it `requires` and its settings. `checkCapabilities` is the one validator
(used by `parseContent` and `checkPacks`), and content asking for what its own switches turn off is refused
(`checkAgainstCapabilities`).

**A system a story could do without must be a capability, in the same change that adds it.** Gate it with
`enabled(id, zone)` at the one choke point where the feature starts (prefer the rule's own choke point, like `heroCombos`
for spells, over many UI checks), and read tuned values with `setting`. Co-op needs nothing on the wire: both players
have the same table; the host gates rules, each side its own screens. `tools/content/capabilities.test.ts` fails a
capability nothing asks `enabled()` about or that is not listed here. The ids: `map`, `guide`, `needs`, `combos`,
`skills`, `farming`, `weather`, `dayNight`, `carrying`, `roaming`, `forge`, `coop`, `trading`.

## Balance

Each `MobKind` is tuned for a band of hero levels and biomes hand them out by band; `balance.test.ts` guards it. Bows deal about 75% of a same-priced sword's damage per second, a wand's plain bolt
about 65%, a tome's about 40%; a combo is a burst for mana, not a better sword. Levelling is superlinear, so a tougher
kind is how higher levels stay meaningful. **Retune a weapon or kind against that test.**

## Features (design notes)

- **Quests** (`quests.ts`, `guide.ts`): a chain per campaign told by a cast of givers (the campaign's `"scope": "hero"` epic,
  `content/story.ts`); objectives kill, gather, bring, meet, visit, and two that use a capability (core engine, refused
  where it is off): `cast` spells (`combos`) and `haul` barrels to a named place (`carrying`, a bit per barrel index like
  a gather's sites); chapters and journal lore make it a story. Guidance is local to each player (an arrow for a person or
  door, a search area for something to be found). Quest text must use the biomes' `name`s (`guide.test.ts`). The host owns
  every `QuestLog`; a guest sends `do` talk and action presses and reads the log from `pack`. Online only the DM's
  quests count (`docs/dungeon-master.md`).
- **The DM's quest kinds** (`dmTasks.ts`, `dmQuests.ts`; core engine, all counted by the host, friends told in the `dm` message, append-only kinds): beside hunt, gather, find, visit, cast and haul there are
  **boss** and **master**. A boss (`dmBoss.ts`) is the land's toughest foe drawn as a named giant (`MobKind.boss`, counted under `BOSS_KEY`), whose health,
  blow and defense come from a typical hero of the party's level and size (`heroModel`, so no content id and a fair fight at any level; `balance.test.ts` keeps its odds between 1.15 and 2.5).
  `StoryUi.syncBoss` makes it on every page from the quest alone (the zone's last foe, so snapshot indexes agree) and the host's compass follows it;
  its quest pays richer than a hunt and a gear drop is left as a hook in `DmTasks.finish`. A mastery asks for N casts of one combo
  a wand or tome of the party teaches (`Land.combos`, the `combos` capability; `castIn` takes the spell id) and is told with the arrows that cast it.
- **Magic** (`spells.ts`, `skills.ts`, `Casting.ts`): wands and tomes are weapons with combos (direction taps) that cast
  spells for mana; **every wand and tome is unique** (no spell or string on two weapons, none hidden inside another or a
  skill's: tests check). Innate skills are earned in training-ground trials, two ready at a time. `heroCombos` is the one
  list the reader, HUD and caster use; a guest detects the combo locally and sends only its index.
- **Survival** (`needs.ts`, `crops.ts`): food and water drain with time (host/solo only; a guest displays what `pack`
  tells it). Drinking is steady, from ponds that drain and **only rain refills**; the action key drinks by a pond only
  while no foe is near. Crops need three waterings, are decided by the host and ride the snapshot as a state code.
- **Weather and day** (`weather.ts`, `daynight.ts`): cosmetic atmosphere per biome, never touching combat or collision
  (lightning aside). The host rolls each occupied zone's weather and sends its zone's in the snapshot; the clock reads the
  wall clock, so everyone sees the same hour with nothing on the wire.
- **Inventory, economy, chests** (`inventory.ts`, `shops.ts`, `chests.ts`, `trade.ts`): the host owns every hero's gold,
  pack and gear. A guest applies an inventory op locally at once and sends the oldest unconfirmed one (numbered); the
  host does each once, in order, and confirms with `pack.ack`. Shops specialise and buy back only their own trade at a
  fraction of value; chests hold what shops don't sell (rare gear, purses). An item's code is its place in its
  campaign's list, so `items.json` is append-only.
- **Director cues** (`cues.ts`, core engine, co-op): the DM's words may carry inline `<cue:anim|sfx|camera .../>` stage
  directions (closed vocabulary; its header is the design). The host checks the tagged text (`cleanCued`), which is all
  that goes on the wire; every page cuts the tags out of the caption and plays each when the reading reaches it
  (`Dialog`, `scenes/overworld/Cues.ts`, `hud/sfx.ts`, `Camera.shake`). Cosmetic and local, never state. A new cue is
  vocabulary in `cues.ts` first (its player is forced by the types), then a line in the bot's `DIRECTOR_RULES`.
- **Gems and the forge** (`gems.ts`, `dmForge.ts`, `dmGear.ts`; core engine, capability `forge`): a gem is an item with
  a `gem` property (what it adds to a weapon, `arms`, and to other gear, `worn`); the Set action on the Inventory tab spends
  one to make the piece "Emerald-encrusted Steel Sword" (base plus gem, dearer, same look), in place. The pieces are
  **derived ahead of time** for every (gear, gem) pair when the items are installed (`FUSED`, ids `base+gem`, after the authored
  items in the codes), so an item's code still names it over the wire and in trades and nothing new is sent: both players derive
  the same list from the same content. `InvOp` `fuse` is a numbered op like any other, done by the host (`fuseInto`, the one
  `forge` gate). Gems are sold at the smith (`gem` is a shop kind) and may be chest loot; the DM's `forge` quest names a recipe
  from what a hero carries or a shop sells and is done when anyone makes that piece.
  DM gear rewards (`giftFor`) weigh each hero's slots.
- **Roaming people** (`roam.ts`; core engine, capability `roaming`, content `EntityDef.roam`): a scenario's person strolls about
  their post within a radius, only where `Collision.canMove` allows; talked to, they stop, face the speaker, then go home. Givers and keepers never roam. The host steps them; a guest draws `SnapMsg.folk` (v49).
- **Props** (`barrels.ts`, `signs.ts`, `pets.ts`, `ice.ts`): barrels are bodies you carry and set down (gated by
  `carrying`; the host decides, `SnapMsg.barrels` shows them; a map object in a neighbour's margin is not this map's
  barrel); signposts read their ways from the loaded map when read (`signs.ts`; a live DM's `sign` log entry overrides) and pets are local scenery (nothing else on the wire, so each player's pets wander independently); ice is
  a velocity rule for players only.
