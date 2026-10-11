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

## Map editor

With `npm run dev`, open `/editor.html` to build the overworld: pick tiles/objects from the tilesets, paint them, set collision and spawn, then **Save to project** (writes `public/maps/overworld.json`). Commit that file to deploy the change.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
