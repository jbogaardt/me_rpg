// Map toolchain for agents (and humans). Zone specs live in maps/*.ts; see .claude/skills/build-zone.
//
//   npm run map -- build [zone...]   spec -> public/maps/<zone>.json + previews in maps/out/, then checks
//   npm run map -- check             rebuild in memory; fail if any JSON is stale or a check errors (runs in `npm run build`)
//   npm run map -- render <zone> [--crop col,row,w,h] [--scale n] [--debug] [--out file.png]
//   npm run map -- layout [biome...]  print a biome's walls (#), gaps (=) and open ground (.) in world cells

import fs from 'node:fs';
import path from 'node:path';
import { parseMap } from '../../src/map/types';
import { generateAll, loadLayout, zoneNames } from './all';
import { type Report } from './check';
import { renderMap, ROOT, writePng, type RenderOptions } from './image';
import { World } from './world';

const OUT_DIR = path.join(ROOT, 'maps/out');
const jsonPath = (name: string) => path.join(ROOT, 'public/maps', `${name}.json`);
const rel = (p: string) => path.relative(process.cwd(), p);

function printReport(name: string, r: Report) {
  for (const e of r.errors) console.log(`  ✗ ${name}: ${e}`);
  for (const w of r.warnings) console.log(`  ! ${name}: ${w}`);
  if (!r.errors.length && !r.warnings.length) console.log(`  ✓ ${name}: all checks pass`);
}

function parseFlags(args: string[]) {
  const pos: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) pos.push(args[i]);
    else if (['--debug'].includes(args[i])) flags.set(args[i], '1');
    else flags.set(args[i], args[++i]);
  }
  return { pos, flags };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  let failed = false;

  if (cmd === 'build' || cmd === 'check') {
    const { zones, errors } = await generateAll();
    const names = zoneNames(rest);
    for (const name of names) {
      const zone = zones.get(name);
      if (!zone) throw new Error(`No zone ${name}`);
      const { data, report } = zone;
      const file = jsonPath(name);
      if (cmd === 'build') {
        fs.writeFileSync(file, JSON.stringify(data));
        writePng(path.join(OUT_DIR, `${name}.png`), renderMap(data));
        writePng(
          path.join(OUT_DIR, `${name}.debug.png`),
          renderMap(data, { collision: true, grid: true, markers: true }),
        );
        console.log(`${name}: ${rel(file)} (${data.objects.length} objects, ${data.collision.length} blocked cells)`);
        console.log(
          `  previews: ${rel(path.join(OUT_DIR, `${name}.png`))}, ${rel(path.join(OUT_DIR, `${name}.debug.png`))}`,
        );
      } else if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== JSON.stringify(data)) {
        report.errors.unshift(`${rel(file)} is out of date with maps/${name}.ts; run \`npm run map -- build\``);
      }
      printReport(name, report);
      failed ||= report.errors.length > 0;
    }
    if (cmd === 'check') {
      // A zone that no longer has a spec must not linger in public/maps.
      for (const f of fs.readdirSync(path.join(ROOT, 'public/maps')))
        if (f.endsWith('.json') && !zones.has(f.slice(0, -5))) {
          console.log(`  ✗ public/maps/${f} has no spec in maps/; delete it`);
          failed = true;
        }
    }
    for (const e of errors) {
      console.log(`  ✗ ${e}`);
      failed = true;
    }
  } else if (cmd === 'layout') {
    // Where a biome's walls, gaps and open ground are, to plan its spec against.
    const world = new World(await loadLayout());
    for (const name of rest.length ? rest : world.names) console.log(`${name}:\n${world.sketch(name)}\n`);
  } else if (cmd === 'render') {
    const { pos, flags } = parseFlags(rest);
    const name = pos[0];
    if (!name)
      throw new Error(
        'usage: npm run map -- render <zone> [--crop col,row,w,h] [--scale n] [--debug] [--out file.png]',
      );
    const data = parseMap(JSON.parse(fs.readFileSync(jsonPath(name), 'utf8')));
    const opts: RenderOptions = { scale: Number(flags.get('--scale') ?? 1) };
    if (flags.has('--debug')) Object.assign(opts, { collision: true, grid: true, markers: true });
    const crop = flags.get('--crop');
    if (crop) {
      const [col, row, w, h] = crop.split(',').map(Number);
      opts.crop = { col, row, w, h };
    }
    const out =
      flags.get('--out') ??
      path.join(OUT_DIR, `${name}${crop ? `.${crop.replace(/,/g, '-')}` : ''}${opts.collision ? '.debug' : ''}.png`);
    writePng(out, renderMap(data, opts));
    console.log(rel(out));
  } else {
    console.log('usage: npm run map -- <build|check|render> …  (see tools/map/cli.ts)');
    failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
