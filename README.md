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

A Shade (the dark ninja) wanders the southeast field as a test enemy: it chases you on sight and
attacks after a yellow-flashing windup. It respawns a few seconds after dying; if you fall, you wake
at the spawn point with full HP/MP and keep your XP.

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
