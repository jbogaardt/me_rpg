# Me RPG

A small top-down RPG built with [PixiJS](https://pixijs.com) v8, Vite and TypeScript, deployed to GitHub Pages.

## Develop

```bash
npm install
npm run dev
```

Controls: WASD / arrow keys to move, Space / J / Enter / E to attack (or talk when next to the NPC),
K / Q to cast Time Bolt (costs MP), Esc / I / Tab for the menu.
On phones and tablets an on-screen D-pad (drag your thumb, 8-way) plus **A** (attack/talk), **B** (magic)
and **☰** (menu) buttons appear.

Enemies (shades, goblins, wolfkin, skeletons, zombies, orcs, trolls, raiders, frostbound) wander near
their spawn, chase you on sight and attack after a yellow-flashing swing windup. They respawn a few
seconds after dying; if you fall, you wake at the spawn point with full HP/MP and keep your XP.

Checks (all run in CI on every pull request):

```bash
npm run verify    # lint, format check, typecheck, unit tests, map and sprite checks
npm run test:e2e  # browser smoke tests against the production build (needs Chromium)
npm run build     # typecheck, map and sprite checks, production build
```

## Characters

Every character (hero, NPCs, monsters) is a stack of layers (body, head, hair, armor, weapon, ...) from the
[Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator),
composed at runtime, so equipping gear or giving an NPC a new look is just choosing parts. The parts the
game uses are listed in `sprites/parts.ts`; the packed art lives in `public/sprites/lpc/` and is rebuilt with

```bash
git clone https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator ../Universal-LPC-Spritesheet-Character-Generator
npm run sprites -- build      # needs the clone (or LPC_DIR=<path>); `npm run sprites -- check` does not
```

Hero gear is in `src/systems/items.ts`, NPC looks in `src/systems/looks.ts`, mob looks on each `MobKind`
(`src/systems/combat.ts`). The art is under CC-BY-SA / GPL / OGA-BY terms; see `CREDITS.md`.

## Maps

Maps are built from code so an AI agent can author them: `maps/overworld.ts` describes the zone
(ground, forests, bushes, rocks, spawn, NPC, enemies) and

```bash
npm run map -- build    # -> public/maps/overworld.json + previews in maps/out/, then checks
```

compiles it, deriving collision from the art and blending ground edges. Ask Claude to change the map
in plain words; the `build-zone` skill (`.claude/skills/build-zone/`) tells it how. Commit the spec and
the generated JSON together; the deploy fails if they disagree.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
