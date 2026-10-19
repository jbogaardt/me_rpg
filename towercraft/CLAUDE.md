# towercraft: head-to-head tower defense

A separate game on the same site (built into `dist/towercraft/`, see the root `CLAUDE.md`). It shares no code with Me RPG; only
the conventions (Vite, strict TypeScript, Pixi-free rules with unit tests beside them, Prettier, ESLint).

- **Rules are Pixi-free and deterministic** (`src/sim/`, an ESLint rule enforces it): `sim.ts` is the whole match (build, send, pay day,
  towers shooting, lives), `races.ts` the three races as data, `board.ts` the road, `ai.ts` the opponent (seeded, so a match replays).
  `main.ts` only draws a `Match` and turns clicks into commands. The same rules can later run on a server for online play.
- **The game**: each player owns a lane. You build towers on your lane and send units down the OTHER lane; what gets through takes
  the lane owner's lives. Sending raises your pay for the rest of the game, so it is an investment as well as an attack.
- **Races** differ by how their numbers trade off, not by special rules: swarm (fast, weak, many), titan (slow, strong, costly),
  legion (the middle, the yardstick). A new race is an entry in `races.ts` and nothing else.
- **State of play** (prototype): one human against the AI, no sell or upgrade, no towers that slow, no air units, no online. Balance is
  not tuned: with the AI on both sides titan beats everyone, legion beats swarm, and matches run 10 to 15 minutes. Tune with a
  headless run of many seeded matches (as `sim.test.ts` plays them), not by feel.
- **Online** (not started) would be two players against a host or server that runs `step`; the open question is a server that
  decides, versus peers that agree on a deterministic replay. The sim is built so either works.
