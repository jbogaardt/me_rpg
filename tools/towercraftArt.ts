// Copies Towercraft's art out of the unzipped "Wyrmsun CC0 - over 900 items" pack (https://opengameart.org/content/wyrmsun-cc0-over-900-items,
// `wyrmsun_cc0.zip`): `npm run towercraft:art -- <folder the zip was unzipped to>`. Only the pack's own credits.txt is trusted: a file is
// taken only when it is listed there as CC0 and its name is listed once, because the zip is flat and a name that several factions
// share (`guard_tower.png`) kept just one of them, so we could not say whose it is. The PNGs are committed in towercraft/public/art/.

import fs from 'node:fs';
import path from 'node:path';

/** File in the pack -> the name it gets here. Prefix = the faction the pack's credits give it. */
export const ART: Record<string, string> = {
  'goblin_spearman.png': 'goblin_spearman.png',
  'goblin_thief.png': 'goblin_thief.png',
  'surghan_mercenary_axefighter.png': 'dwarf_axefighter.png',
  'surghan_mercenary_thane.png': 'dwarf_thane.png',
  'veteran_warrior.png': 'germanic_veteran_warrior.png',
  'jarl.png': 'germanic_jarl.png',
  'ballista_tower.png': 'dwarf_ballista_tower.png',
  'cannon_tower.png': 'dwarf_cannon_tower.png',
  'sentry_tower.png': 'dwarf_sentry_tower.png',
  // Shared by more than one faction in the pack (the flat zip kept one): generic towers, not claimed for a faction.
  'watch_tower.png': 'wood_watch_tower.png',
  'guard_tower.png': 'stone_guard_tower.png',
  'catapult_tower.png': 'catapult_tower.png',
};
const SHARED = new Set(['watch_tower.png', 'guard_tower.png', 'catapult_tower.png']);

function main(src: string | undefined) {
  if (!src) throw new Error('usage: npm run towercraft:art -- <folder the Wyrmsun CC0 zip was unzipped to>');
  const out = path.resolve(import.meta.dirname, '../towercraft/public/art');
  fs.mkdirSync(out, { recursive: true });
  const credits = fs.readFileSync(path.join(src, 'credits.txt'), 'utf8').split('\n');
  for (const [from, to] of Object.entries(ART)) {
    const lines = credits.filter((l) => l.includes(`/${from} `));
    if (lines.length === 0 || lines.some((l) => !l.includes('licensed under the CC0')))
      throw new Error(`${from} is not listed as CC0`);
    if (lines.length > 1 && !SHARED.has(from)) throw new Error(`${from} is listed ${lines.length} times: whose is it?`);
    fs.copyFileSync(path.join(src, from), path.join(out, to));
    console.log(
      `${to}  <- ${lines[0].replace(/ \(licensed.*/, '')}${lines.length > 1 ? ` (+${lines.length - 1} more)` : ''}`,
    );
  }
}

if (process.argv[1] === import.meta.filename) main(process.argv[2]);
