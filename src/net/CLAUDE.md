# src/net: co-op

Up to a Dungeon Master (the host) and three friends. Read `docs/dungeon-master.md` for what the host being the DM
means. `protocol.ts` is the contract (messages, validation, version history); `session.ts` is the state shared by the menu
and the game loop; headers of `feed.ts`, `PeerLink.ts`, `relayClient.ts` and `hostPlan.ts` cover the rest.

## Design

- **Authority**: the host runs the one simulation and owns every hero, mob, chest, pond and quest. A guest runs no
  simulation: it sends held keys and wishes (`do`, `tr`, inventory ops) and renders what it is told (`snap`, `pack`,
  `looks`, `trade`). The one thing a guest predicts is its own hero's walking (below). A friend's solo hero is restored when they leave; the host leaving ends the game.
- **A guest predicts only its own walking** (`core/prediction.ts`, driven by `GuestLink.predict`). The hero moves at once
  from the held keys with the host's own rules (speed, ice, walls), so a quick turn never waits for a round trip. Each
  snapshot carries `ia`, the newest input number the host had applied for that friend; the guest compares the host's
  position with where its hero stood when it sent that input. The difference is eased away over ~100 ms (and the
  remembered positions shift with it, so an error is never counted twice); above `HARD_SNAP` (a door, respawn, big shove)
  it jumps. Everything else, and every other player, is still only what the host says: other heroes and mobs glide
  toward the latest snapshot (`core/interp.ts`). Stats, hits, pickups and doors stay the host's. Add `?netdebug` to the
  address for a round-trip and correction readout.
- **Star topology, gameplay peer to peer.** Each friend has one data channel to the host (`ordered: false,
  maxRetransmits: 0`, public STUN only, so two strict NATs can't connect). Only the connection setup goes through the
  matchmaking relay (`relay/`): the host prepares one offer per seat, a friend types the two-word code and is given the
  next free seat. The lobby needs no addresses: a friend whose page plays another world moves its page to the host's by
  itself (the hello carries the world tag, `setContentTag`).
- **A live game stays joinable.** Start Game (or all three seats filling) only ends the lobby (`lobbyOpen`); the relay
  room and the code stay open. A seat whose friend left, was dropped or lost the connection is offered again (a fresh
  offer through `reopenSeat`, in the lobby and in a live game), so they type the same code and take a free seat. The
  capacity limit is the three seats: a seat is free only once its link has ended (silence is noticed within 10 s), and
  the relay hands each seat out once. The host keeps the room alive by polling `answers`, and the last friend leaving
  does not end the game (the host just plays solo, `role` `'solo'`, until someone rejoins); only the relay forgetting
  the game, or the host disconnecting, does. A rejoiner arrives at the start as **the hero they left**: a friend's hello carries a lasting id (`HelloMsg.id`, kept in
  their local storage); the host keeps a leaver's hero by it (`HostLink.kept`, the last 12) and hands it back.
- **The channel is lossy, so inputs are state, not events.** Held keys plus running counters for presses; one-shot visuals
  ride in snapshots with ids and are acknowledged (`ack`) so each shows once; anything a guest must see eventually is
  state the host repeats (repeated chunks of the world log, `pack` once a second). Never design a message whose loss
  desyncs a friend for good.
- **Keep snapshots small**: a message over about 1.2 KB is split in transit and losing any piece loses all of it. The
  host sends each friend only what is near them (`MobFeed`, events within view, a size budget `SNAP_BUDGET`), and
  zones nobody is in cost nothing. `protocol.test.ts` checks a busy snapshot. Roaming people (`SnapMsg.folk`, three numbers
  each, only in zones that have some) are host-simulated; a guest never strolls them itself.
- **Both players play the same content**, so item codes, mob order and capabilities agree with nothing on the wire.
  `net/` imports only `core/` and `systems/`; `entities/` never imports `net/`.
- **Online play does not pause the world, except while someone reads a quest conversation** (`Dialog` `pauses`: an NPC's
  words, a quest brief). The host holds foes, crops and weather still (like the DM's Stop time) while it, or any friend
  whose input says `rd`, has one open (`systems/readingPause.ts`); a friend sitting on the box releases the table after
  30 s. Menus, shops, signs and the DM's words never pause it. Kills share XP across the party.

## Changing a message

Bump `PROTOCOL_VERSION` (its doc comment lists every version), validate in `parseMessage` (which never throws), add a
`protocol.test.ts` case, and say in the commit that pages on the old version must reload. Anything a guest does that the
host must act on is a numbered, ackable command, not a raw event. Per feature, decide in the same change what the host
owns and what a guest is sent, and update that feature's doc.

Item codes run through the campaign's authored items and then the pieces gems make (`systems/gems.ts`, derived the same way
on every page), so a set gem travels as a code like any item; the `fuse` Inventory action is `[5, gem index, pack index or
-(slot+1)]`, applied by a guest at once and by the host in order.

## Trading

`systems/trade.ts`: the host's `TradeBook` is the only authority. Players send `TradeCommand`s (ask, yes/no, offer,
ready, cancel) and the book checks them against the real heroes. Any change to either offer clears both accepts, and
the swap is atomic or nothing happens. Commands are numbered and a guest repeats each until acknowledged, so a lost
packet can't drop a click. Only pack items are offered; the trade ends if players drift apart or either cancels.

## Tests

Pure parts have unit tests (`session.test.ts` drives the whole seat lifecycle with a fake link and relay);
`e2e/multiplayer.spec.ts` connects real browser contexts through a local copy of the relay.
