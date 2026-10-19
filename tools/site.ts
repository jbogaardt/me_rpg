// Assembles the published site after `vite build`: the gallery and the other games' pages (`games/`) are copied into
// `dist/` beside the game, which Vite built into `dist/me_rpg`. Each game is its own folder with its own page and
// assets, so the gallery stays tiny and a game never loads another's files. A new game is a folder in `games/` with an
// `index.html` (or a build that writes `dist/<slug>/`) and an entry in `games/games.json`.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'games');
const to = path.join(root, 'dist');

const games = JSON.parse(fs.readFileSync(path.join(from, 'games.json'), 'utf8')) as { slug: string }[];
fs.cpSync(from, to, { recursive: true });

// Every game in the list must have a page, or its card would lead nowhere.
for (const { slug } of games) {
  if (!fs.existsSync(path.join(to, slug, 'index.html')))
    throw new Error(`games.json lists "${slug}" but dist/${slug}/index.html is missing`);
}
console.log(`site: gallery and ${games.length} games in dist/`);
