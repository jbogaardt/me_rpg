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
  // Air and ranged units: gryphon and glider sheets are 100x100 frames, the archer a standard 72x72 sheet.
  { source: 'tree', from: 'dwarf/units/gryphon_rider', to: 'units/gryphon_rider' },
  { source: 'tree', from: 'goblin/units/glider', to: 'units/glider' },
  { source: 'tree', from: 'germanic/units/archer', to: 'units/germanic_archer' },
  // More walkers and flyers: every race's second and third units. Same 72x72 sheets (the bats and birds 32x32 and 64x64, the gryphons 100x100).
  { source: 'tree', from: 'goblin/units/goblin_archer', to: 'units/goblin_archer' },
  { source: 'tree', from: 'goblin/units/gunpowder_infantry', to: 'units/gunpowder_infantry' },
  { source: 'tree', from: 'goblin/units/goblin_swordsman', to: 'units/goblin_swordsman' },
  { source: 'tree', from: 'neutral/units/bat', to: 'units/bat' },
  { source: 'tree', from: 'neutral/units/dread_bat', to: 'units/dread_bat' },
  { source: 'tree', from: 'dwarf/units/thunderer', to: 'units/thunderer' },
  { source: 'tree', from: 'dwarf/units/runesmith', to: 'units/runesmith' },
  { source: 'tree', from: 'dwarf/units/yale_rider_black_hair_brown_fur', to: 'units/yale_rider_black_hair_brown_fur' },
  {
    source: 'tree',
    from: 'dwarf/units/gryphon_rider_brown_hair_blue_feathers',
    to: 'units/gryphon_rider_brown_hair_blue_feathers',
  },
  {
    source: 'tree',
    from: 'dwarf/units/gryphon_rider_red_hair_gray_feathers',
    to: 'units/gryphon_rider_red_hair_gray_feathers',
  },
  { source: 'tree', from: 'teuton/units/saxon_swordsman', to: 'units/saxon_swordsman' },
  { source: 'tree', from: 'teuton/units/austrian_musketeer', to: 'units/austrian_musketeer' },
  { source: 'tree', from: 'teuton/units/catapult', to: 'units/catapult' },
  { source: 'tree', from: 'neutral/units/bird_white', to: 'units/bird_white' },
  { source: 'tree', from: 'neutral/units/gryphon_gray_feathers', to: 'units/gryphon_gray_feathers' },
  // Portraits for the buttons and the race picker.
  { source: 'pack', from: 'goblin_spearman', to: 'goblin_spearman' },
  { source: 'pack', from: 'goblin_thief', to: 'goblin_thief' },
  { source: 'pack', from: 'surghan_mercenary_axefighter', to: 'dwarf_axefighter' },
  { source: 'pack', from: 'surghan_mercenary_thane', to: 'dwarf_thane' },
  { source: 'tree', from: 'germanic/icons/warrior', to: 'germanic_warrior' },
  { source: 'tree', from: 'teuton/icons/ritter', to: 'teuton_ritter' },
  { source: 'tree', from: 'goblin/icons/glider', to: 'goblin_glider' },
  { source: 'tree', from: 'dwarf/icons/gryphon_rider', to: 'dwarf_gryphon' },
  { source: 'tree', from: 'germanic/icons/archer', to: 'germanic_archer' },
  // Castles (128x256: the first 128x128 frame is the finished one).
  { source: 'tree', from: 'goblin/buildings/stronghold', to: 'goblin_castle' },
  { source: 'tree', from: 'dwarf/buildings/stronghold', to: 'dwarf_castle' },
  { source: 'tree', from: 'teuton/buildings/stronghold', to: 'teuton_castle' },
  // Support buildings (96x192: the first 96x96 frame is the finished one): temples, a church and a university.
  { source: 'tree', from: 'goblin/buildings/temple', to: 'goblin_temple' },
  { source: 'tree', from: 'goblin/buildings/academy', to: 'goblin_academy' },
  { source: 'tree', from: 'dwarf/buildings/temple', to: 'dwarf_temple' },
  { source: 'tree', from: 'teuton/buildings/church', to: 'teuton_church' },
  { source: 'tree', from: 'teuton/buildings/university', to: 'teuton_university' },
  // Towers (64x128: the first 64x64 frame is the finished tower).
  { source: 'tree', from: 'goblin/buildings/watch_tower', to: 'goblin_watch_tower' },
  { source: 'tree', from: 'goblin/buildings/guard_tower', to: 'goblin_guard_tower' },
  { source: 'tree', from: 'goblin/buildings/catapult_tower', to: 'goblin_catapult_tower' },
  { source: 'tree', from: 'dwarf/buildings/guard_tower', to: 'dwarf_guard_tower' },
  { source: 'tree', from: 'dwarf/buildings/sentry_tower', to: 'dwarf_sentry_tower' },
  { source: 'tree', from: 'teuton/buildings/guard_tower', to: 'teuton_guard_tower' },
  { source: 'tree', from: 'dwarf/buildings/ballista_tower', to: 'dwarf_ballista_tower' },
  { source: 'tree', from: 'dwarf/buildings/cannon_tower', to: 'dwarf_cannon_tower' },
  { source: 'tree', from: 'teuton/buildings/watch_tower', to: 'teuton_watch_tower' },
  { source: 'tree', from: 'teuton/buildings/catapult_tower', to: 'teuton_catapult_tower' },
  // Money, production and upgrade buildings, each race its own: mills and quarries, the halls that unlock units, smithies (96x192 or 96x288;
  // the first square frame is the finished one), and the keep a bunker is drawn with. The goblin cannon tower is 64x128.
  { source: 'tree', from: 'goblin/buildings/lumber_mill', to: 'goblin_lumber_mill' },
  { source: 'tree', from: 'goblin/buildings/masons_shop', to: 'goblin_masons_shop' },
  { source: 'tree', from: 'goblin/buildings/mess_hall', to: 'goblin_mess_hall' },
  { source: 'tree', from: 'goblin/buildings/town_hall', to: 'goblin_town_hall' },
  { source: 'tree', from: 'goblin/buildings/farm', to: 'goblin_farm' },
  { source: 'tree', from: 'goblin/buildings/fortress', to: 'goblin_fortress' },
  { source: 'tree', from: 'goblin/buildings/smithy', to: 'goblin_smithy' },
  { source: 'tree', from: 'goblin/buildings/market', to: 'goblin_market' },
  { source: 'tree', from: 'goblin/buildings/cannon_tower', to: 'goblin_cannon_tower' },
  { source: 'tree', from: 'dwarf/buildings/lumber_mill', to: 'dwarf_lumber_mill' },
  { source: 'tree', from: 'dwarf/buildings/masons_shop', to: 'dwarf_masons_shop' },
  { source: 'tree', from: 'dwarf/buildings/citadel', to: 'dwarf_citadel' },
  { source: 'tree', from: 'dwarf/buildings/yale_pen', to: 'dwarf_yale_pen' },
  { source: 'tree', from: 'dwarf/buildings/yale_hunting_lodge', to: 'dwarf_yale_hunting_lodge' },
  { source: 'tree', from: 'dwarf/buildings/academy', to: 'dwarf_academy' },
  { source: 'tree', from: 'dwarf/buildings/smithy', to: 'dwarf_smithy' },
  { source: 'tree', from: 'germanic/buildings/carpenters_shop', to: 'germanic_carpenters_shop' },
  { source: 'tree', from: 'germanic/buildings/town_hall', to: 'germanic_town_hall' },
  { source: 'tree', from: 'germanic/buildings/sheep_ranch', to: 'germanic_sheep_ranch' },
  { source: 'tree', from: 'teuton/buildings/town_hall', to: 'teuton_town_hall' },
  { source: 'tree', from: 'teuton/buildings/stables', to: 'teuton_stables' },
  { source: 'tree', from: 'teuton/buildings/masons_shop', to: 'teuton_masons_shop' },
  { source: 'tree', from: 'teuton/buildings/market', to: 'teuton_market' },
  { source: 'tree', from: 'teuton/buildings/farm', to: 'teuton_farm' },
  { source: 'tree', from: 'teuton/buildings/castle', to: 'teuton_fort' },
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
      if (!pack || !packCredits) {
        console.log(`${item.to}.png  skipped (needs the unzipped CC0 pack, the second argument)`);
        continue;
      }
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
