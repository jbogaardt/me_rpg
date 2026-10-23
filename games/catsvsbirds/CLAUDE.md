# Cats vs Birds

A single-page rhythm runner (`index.html`, no build step) on the gallery. Solo: the cat runs a fixed seeded course.

## Co-op: one plays the cat, the other the birds

The **Co-op** button opens a panel laid out like Me RPG's Online tab: a **Solo / Host / Join** choice, a status dot (Idle, Gathering
Candidates, Awaiting Client, Connecting, Connected), a roster (The Cat, The Birds), **Create Game** with the code, **Copy Code** and **Copy Join
Link** (`#join=code` opens the panel on Join with the code filled in), a join box, **Start Game** for the host once the friend is in, and
**Disconnect**. The host is the cat. `net.js` is a plain-script
port of Me RPG's connection layer (`src/net`: relay client, offer/answer text, peer link), because this page cannot import TypeScript; the
relay (`relay/`) only starts the connection, then the pages talk directly over an ordered data channel. Until the host presses Start Game the
friend waits in the lobby; the host keeps playing solo meanwhile.

- **The host owns the game** (same rule as Me RPG): it runs `update`, the course and every collision, and sends a `st` snapshot about 30 times
  a second (scroll, the cat, the foes, the tins taken, score and the swoop cooldown). The guest runs no rules: `applySnapshot` and
  `updateGuest` only carry on at the course's speed between snapshots, and `draw` is shared.
- **The birds' move** is a swoop in one of two lanes, sent as `{t:'in', lane}`: a *high* bird flies at jump height (the cat must stay low), a
  *low* one skims the deck (the cat must jump). It starts off the right edge (a second to read), one per `SWOOP_CD`. The host checks the
  cooldown and that the run is live; a guest can only ask. While a friend is in, the course's scripted birds are skipped (kiwis stay).
- **Scoring**: a death by a swoop is a *catch*; the course restarts as before, and the cat wins by finishing. Solo is unchanged.
- A friend leaving puts the host back to solo with the same code open (the seat is offered again); a friend who rejoins resumes at once, no second Start Game. Open the page with `?relay=http://localhost:8787` and
  `npm run relay` to try it locally.
