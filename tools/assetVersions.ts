// Content versions for the files the game fetches from public/ at run time (maps, tilesets, sprite parts), as a Vite
// plugin. GitHub Pages lets every file be cached for 10 minutes and then revalidated, and a deploy must never pair new
// code with a stale map or tileset, so each URL carries `?v=<hash of that file>`: it changes exactly when the file
// does, so a deploy that leaves the art alone keeps every player's cached copy (a build id would refetch it all).
//
// The game imports the table from `virtual:asset-versions` (src/assets.ts). In the dev server it is empty: files are
// served fresh there, and they change under it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Folders under public/ whose files the game fetches by URL. */
export const VERSIONED_DIRS = ['maps', 'tilesets', 'sprites/lpc', 'sprites/pets', 'content'];

/** Short content hash of every file in these folders of `root`, keyed by path relative to `root` (`maps/x.json`). */
export function assetVersions(root: string, dirs = VERSIONED_DIRS): Record<string, string> {
  const table: Record<string, string> = {};
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      const file = path.join(abs, name);
      if (!fs.statSync(file).isFile()) continue;
      const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('base64url');
      table[`${dir}/${name}`] = hash.slice(0, 8);
    }
  }
  return table;
}

const ID = 'virtual:asset-versions';
const RESOLVED = '\0' + ID;

export function assetVersionsPlugin(): Plugin {
  let table: Record<string, string> = {};
  return {
    name: 'asset-versions',
    configResolved(config) {
      if (config.command === 'build') table = assetVersions(config.publicDir);
    },
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load: (id) => (id === RESOLVED ? `export default ${JSON.stringify(table)};` : undefined),
  };
}
