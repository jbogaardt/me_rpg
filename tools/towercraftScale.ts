// Writes the unit stats of `towercraft/src/sim/races.ts` from StarCraft: every unit has an SC analog (hp with shields, damage per
// attack, cooldown at Faster speed, range in tiles, speed, minerals/gas), and ONE conversion turns it into game numbers, so races
// are like-for-like by construction and differ only by which analogs they own. Run: `npx tsx tools/towercraftScale.ts` (rewrites
// races.ts in place; idempotent); then Prettier. Tune by changing the table or a conversion factor, not one stat in races.ts.

import { readFileSync, writeFileSync } from 'node:fs';

/** The conversion: SC hit points x HP, SC damage x DMG (so the time to kill is about 3 x SC's, as the game was), minerals/gas to wood/stone. */
const HP = 3.5;
const DMG = 1.2;
const WOOD = 0.4; // minerals to wood
const STONE = 0.5; // gas to stone
const SPEED = 2.8 / 3.15; // a marine walks 2.8

interface Sc {
  hp: number;
  dmg: number;
  cd: number;
  range: number;
  speed: number;
  min: number;
  gas: number;
}
const SC: Record<string, Sc> = {
  zergling: { hp: 35, dmg: 5, cd: 0.5, range: 1, speed: 4.1, min: 25, gas: 0 },
  hydralisk: { hp: 80, dmg: 10, cd: 0.63, range: 4, speed: 3.75, min: 75, gas: 25 },
  baneling: { hp: 30, dmg: 45, cd: 1, range: 1, speed: 3.5, min: 25, gas: 25 },
  darkTemplar: { hp: 120, dmg: 40, cd: 1.25, range: 1, speed: 3.15, min: 125, gas: 100 },
  zealot: { hp: 160, dmg: 16, cd: 0.86, range: 1, speed: 3.15, min: 100, gas: 0 },
  dragoon: { hp: 180, dmg: 20, cd: 1.25, range: 4, speed: 4.2, min: 125, gas: 50 },
  firebat: { hp: 50, dmg: 8, cd: 0.93, range: 1.4, speed: 3.15, min: 50, gas: 25 },
  archon: { hp: 350, dmg: 30, cd: 1.25, range: 2, speed: 3.75, min: 100, gas: 150 },
  ultralisk: { hp: 400, dmg: 20, cd: 0.63, range: 1, speed: 4.1, min: 200, gas: 200 },
  vulture: { hp: 80, dmg: 20, cd: 1.25, range: 1, speed: 6.4, min: 75, gas: 0 },
  marine: { hp: 40, dmg: 6, cd: 0.63, range: 4, speed: 3.15, min: 50, gas: 0 },
  tank: { hp: 150, dmg: 50, cd: 2, range: 7, speed: 3.15, min: 150, gas: 100 },
  mutalisk: { hp: 120, dmg: 9, cd: 1.1, range: 1, speed: 6.7, min: 100, gas: 100 },
  scourge: { hp: 25, dmg: 55, cd: 1, range: 1, speed: 6.7, min: 25, gas: 75 },
  devourer: { hp: 250, dmg: 25, cd: 1.9, range: 1, speed: 5, min: 150, gas: 200 },
  wraith: { hp: 120, dmg: 12, cd: 1, range: 1, speed: 5, min: 150, gas: 100 },
  scout: { hp: 250, dmg: 20, cd: 1.25, range: 1, speed: 5, min: 275, gas: 125 },
  valkyrie: { hp: 200, dmg: 24, cd: 1.5, range: 1, speed: 4.4, min: 250, gas: 125 },
  battlecruiser: { hp: 500, dmg: 25, cd: 1.1, range: 1, speed: 2.9, min: 400, gas: 300 },
};

/** race -> unit id -> [analog, how many walk out for one purchase]. A unit's range is the analog's unless `range` says otherwise. */
const MAP: Record<string, Record<string, [string, number, { range?: number }?]>> = {
  swarm: {
    spearman: ['zergling', 3],
    archer: ['hydralisk', 2],
    boomer: ['baneling', 2],
    thief: ['darkTemplar', 1],
    swordsman: ['zealot', 1, { range: 1.4 }],
    glider: ['mutalisk', 1],
    bombbat: ['scourge', 2],
    dreadbat: ['devourer', 1],
  },
  titan: {
    axefighter: ['zealot', 1],
    thunderer: ['dragoon', 1],
    runesmith: ['firebat', 1, { range: 2.8 }],
    thane: ['archon', 1],
    yale: ['vulture', 1],
    scout: ['wraith', 1],
    gryphon: ['scout', 1],
    thundergryphon: ['battlecruiser', 1],
  },
  legion: {
    warrior: ['zealot', 1],
    archer: ['marine', 1],
    saxon: ['firebat', 1],
    sapper: ['baneling', 1],
    ritter: ['ultralisk', 1],
    ram: ['tank', 1, { range: 8 }],
    falcon: ['wraith', 1],
    griffin: ['valkyrie', 1],
  },
};
/** Units that hit the air in StarCraft's rules too (the analog does): added when missing. */
const HITS_AIR = new Set(['swarm.glider', 'titan.scout', 'legion.falcon']);

const r1 = (n: number) => Math.round(n * 10) / 10;
const path = 'towercraft/src/sim/races.ts';
const original = readFileSync(path, 'utf8');

function rewrite(): string {
  let src = original;
  for (const [race, units] of Object.entries(MAP)) {
    const start = src.indexOf(`\n  ${race}: {`);
    if (start < 0) throw new Error(`no race ${race}`);
    const end = src.indexOf('\n  },\n', start);
    let block = src.slice(start, end);
    for (const [id, [analog, count, over]] of Object.entries(units)) {
      const sc = SC[analog];
      const i = block.indexOf(`id: '${id}',`);
      if (i < 0) throw new Error(`no unit ${race}.${id}`);
      const from = block.lastIndexOf('unit({', i);
      const to = block.indexOf('}),', i);
      let u = block.slice(from, to);
      const set = (key: string, value: string) => {
        const re = new RegExp(`(\\n\\s+)${key}: [^\\n]*,`);
        u = re.test(u)
          ? u.replace(re, `$1${key}: ${value},`)
          : u.replace(/(\n\s+)cooldown:/, `$1${key}: ${value},$1cooldown:`);
      };
      set('hp', String(Math.round(sc.hp * HP)));
      set('damage', String(Math.round(sc.dmg * DMG)));
      set('cooldown', String(sc.cd));
      set('speed', String(r1(sc.speed * SPEED)));
      const range = over?.range ?? sc.range;
      if (range > 1) set('range', String(range));
      else u = u.replace(/\n\s+range: [^\n]*,/, '');
      if (count > 1) set('count', String(count));
      else u = u.replace(/\n\s+count: [^\n]*,/, '');
      if (HITS_AIR.has(`${race}.${id}`) && !u.includes('hitsAir'))
        u = u.replace(/(\n\s+)cooldown:/, `$1hitsAir: true,$1cooldown:`);
      set(
        'cost',
        `price(${Math.round(sc.min * WOOD * count)}${sc.gas ? `, ${Math.round(sc.gas * STONE * count)}` : ''})`,
      );
      block = block.slice(0, from) + u + block.slice(to);
    }
    src = src.slice(0, start) + block + src.slice(end);
  }
  return src;
}
writeFileSync(path, rewrite());
console.log('races.ts rewritten from the StarCraft table');
