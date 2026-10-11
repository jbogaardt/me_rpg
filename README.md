# Me RPG

A small top-down RPG built with [PixiJS](https://pixijs.com) v8, Vite and TypeScript, deployed to GitHub Pages.

## Develop

```bash
npm install
npm run dev
```

Controls: WASD / arrow keys to move, Space / Enter / E to talk to the red NPC.
On phones and tablets an on-screen D-pad (drag your thumb, 8-way) and **A** button appear instead.

## Map editor

With `npm run dev`, open `/editor.html` to build the overworld: pick tiles/objects from the tilesets, paint them, set collision and spawn, then **Save to project** (writes `public/maps/overworld.json`). Commit that file to deploy the change.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
