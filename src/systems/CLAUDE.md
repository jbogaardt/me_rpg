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
`skills`, `farming`, `weather`, `dayNight`, `carrying`, `coop`, `trading`.

## Balance

Each `MobKind` is tuned for a band of hero levels and biomes hand them out by band; `balance.test.ts` guards it (a fresh
hero cannot take the deep kinds). Bows deal about 75% of a same-priced sword's damage per second, a wand's plain bolt
about 65%, a tome's about 40%; a combo is a burst for mana, not a better sword. Levelling is superlinear, so a tougher
kind is how higher levels stay meaningful. **Retune a weapon or kind against that test.**

## Features (design notes)

- **Quests** (`quests.ts`, `guide.ts`): a chain per campaign told by a cast of givers; objectives kill, gather, bring,
  meet, visit; chapters and journal lore make it a story. Guidance is local to each player (an arrow for a person or
  door, a search area for something to be found). Quest text must use the biomes' `name`s (`guide.test.ts`). The host owns
  every `QuestLog`; a guest sends `do` talk and action presses and reads the log from `pack`. Online only the DM's
  quests count (`docs/dungeon-master.md`).
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
- **Props** (`barrels.ts`, `signs.ts`, `pets.ts`, `ice.ts`): barrels are bodies you carry and set down (gated by
  `carrying`; the host decides, `SnapMsg.barrels` shows them; a map object in a neighbour's margin is not this map's
  barrel); signposts and pets are local scenery (nothing on the wire, so each player's pets wander independently); ice is
  a velocity rule for players only.
