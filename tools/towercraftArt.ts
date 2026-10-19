// Copies Towercraft's art out of Wyrmsun (https://github.com/Andrettin/Wyrmsun) into towercraft/public/art/:
//   npm run towercraft:art -- <clone of Wyrmsun> [<folder the OpenGameArt "Wyrmsun CC0" zip was unzipped to>]
// Every file is checked against the credits of the place it comes from, and only accepted when listed there as CC0 or as
// CC-BY-SA 3.0 (Wyrmsun's animated unit sheets, by b_o, are "GPL 2.0 and CC-BY-SA 3.0": we take the CC-BY-SA 3.0 option, so
// they need credit and share-alike, see towercraft/public/art/CREDITS.md). The clone is the faction-correct source for
// sheets, towers and most portraits; the zip (https://opengameart.org/content/wyrmsun-cc0-over-900-items) only supplies the
// goblin and dwarf portraits that the current tree no longer has, and is flat, so a name several factions share is refused.

import fs from 'node:fs';
import path from 'node:path';

interface Item {
  /** Path under Wyrmsun's graphics/ (no extension), or the file name in the flat zip. */
  from: string;
  /** Where it goes under towercraft/public/art/. */
  to: string;
  source: 'tree' | 'pack';
}

export const ART: Item[] = [
  // Animated unit sheets: 72x72 frames, five directions across, the game's own animation rows down (see main.ts).
  { source: 'tree', from: 'goblin/units/goblin_spearman', to: 'units/goblin_spearman' },
  { source: 'tree', from: 'goblin/units/goblin_thief', to: 'units/goblin_thief' },
  { source: 'tree', from: 'dwarf/units/dwarven_axefighter', to: 'units/dwarven_axefighter' },
  { source: 'tree', from: 'dwarf/units/thane', to: 'units/thane' },
  { source: 'tree', from: 'germanic/units/warrior_bronze_shield', to: 'units/germanic_warrior' },
  { source: 'tree', from: 'teuton/units/ritter', to: 'units/teuton_ritter' },
  // Portraits for the buttons and the race picker.
  { source: 'pack', from: 'goblin_spearman', to: 'goblin_spearman' },
  { source: 'pack', from: 'goblin_thief', to: 'goblin_thief' },
  { source: 'pack', from: 'surghan_mercenary_axefighter', to: 'dwarf_axefighter' },
  { source: 'pack', from: 'surghan_mercenary_thane', to: 'dwarf_thane' },
  { source: 'tree', from: 'germanic/icons/warrior', to: 'germanic_warrior' },
  { source: 'tree', from: 'teuton/icons/ritter', to: 'teuton_ritter' },
  // Towers (64x128: the first 64x64 frame is the finished tower).
  { source: 'tree', from: 'goblin/buildings/watch_tower', to: 'goblin_watch_tower' },
  { source: 'tree', from: 'goblin/buildings/guard_tower', to: 'goblin_guard_tower' },
  { source: 'tree', from: 'dwarf/buildings/ballista_tower', to: 'dwarf_ballista_tower' },
  { source: 'tree', from: 'dwarf/buildings/cannon_tower', to: 'dwarf_cannon_tower' },
  { source: 'tree', from: 'teuton/buildings/watch_tower', to: 'teuton_watch_tower' },
  { source: 'tree', from: 'teuton/buildings/catapult_tower', to: 'teuton_catapult_tower' },
];

/** The credits lines of a Wyrmsun-style credits.txt: `/graphics/x/y.png (by A) (licensed under B)`. */
function readCredits(file: string): Map<string, { by: string; licence: string }[]> {
  const out = new Map<string, { by: string; licence: string }[]>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^(\/graphics\/\S+\.png) \((.*?)\) \(licensed under (.*)\)\s*$/.exec(line.trim());
    if (m) out.set(m[1], [...(out.get(m[1]) ?? []), { by: m[2], licence: m[3] }]);
  }
  return out;
}

function main(tree: string | undefined, pack: string | undefined) {
  if (!tree) throw new Error('usage: npm run towercraft:art -- <Wyrmsun clone> [<unzipped Wyrmsun CC0 pack>]');
  const out = path.resolve(import.meta.dirname, '../towercraft/public/art');
  const treeCredits = readCredits(path.join(tree, 'graphics/credits.txt'));
  const packCredits = pack ? readCredits(path.join(pack, 'credits.txt')) : undefined;
  for (const item of ART) {
    let src: string;
    let lines: { by: string; licence: string }[];
    if (item.source === 'tree') {
      src = path.join(tree, 'graphics', `${item.from}.png`);
      lines = treeCredits.get(`/graphics/${item.from}.png`) ?? [];
    } else {
      if (!pack || !packCredits) throw new Error(`${item.from}: needs the unzipped CC0 pack (second argument)`);
      src = path.join(pack, `${item.from}.png`);
      lines = [...packCredits].filter(([k]) => k.endsWith(`/${item.from}.png`)).flatMap(([, v]) => v);
      if (lines.length > 1)
        throw new Error(`${item.from}.png is listed ${lines.length} times in the flat pack: whose is it?`);
    }
    const ok = lines.length > 0 && lines.every((l) => /\bCC0\b|CC-BY-SA 3\.0/.test(l.licence));
    if (!ok)
      throw new Error(
        `${item.from}: not listed as CC0 or CC-BY-SA 3.0 (${lines.map((l) => l.licence).join('; ') || 'not listed'})`,
      );
    const dest = path.join(out, `${item.to}.png`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`${item.to}.png  <- ${item.source}:${item.from}  ${lines[0].by}, ${lines[0].licence}`);
  }
}

if (process.argv[1] === import.meta.filename) main(process.argv[2], process.argv[3]);
