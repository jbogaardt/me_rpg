// Map toolchain for agents (and humans). Zone specs live in maps/*.ts; see .claude/skills/build-zone.
//
//   npm run map -- build [zone...]   spec -> public/maps/<zone>.json + previews in maps/out/, then checks
//   npm run map -- check             rebuild in memory; fail if any JSON is stale or a check errors (runs in `npm run build`)
//   npm run map -- render <zone> [--crop col,row,w,h] [--scale n] [--debug] [--out file.png]

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMap, type MapData } from '../../src/map/types';
import { checkDoors, checkMap, type Report } from './check';
import { renderMap, ROOT, writePng, type RenderOptions } from './image';
import { buildSpec, Zone, type ZoneSpec } from './zone';

const MAPS_DIR = path.join(ROOT, 'maps');
const OUT_DIR = path.join(MAPS_DIR, 'out');
const jsonPath = (name: string) => path.join(ROOT, 'public/maps', `${name}.json`);
const rel = (p: string) => path.relative(process.cwd(), p);

async function loadZone(name: string): Promise<ZoneSpec> {
  const file = path.join(MAPS_DIR, `${name}.ts`);
  if (!fs.existsSync(file)) throw new Error(`No zone spec ${rel(file)}`);
  const mod = (await import(pathToFileURL(file).href)) as { default?: ZoneSpec };
  const spec = mod.default;
  if (spec?.name !== name) throw new Error(`${rel(file)} must default-export defineZone({ name: '${name}', ... })`);
  return spec;
}

function zoneNames(args: string[]): string[] {
  if (args.length) return args;
  return fs
    .readdirSync(MAPS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -3))
    .sort();
}

function generate(spec: ZoneSpec): { data: MapData; report: Report } {
  const z = new Zone(spec.width, spec.height);
  buildSpec(spec, z);
  const data = z.toMapData();
  return { data, report: checkMap(data, z.reasons) };
}

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

/** Door checks need every zone at once, so they run over all the specs whatever was asked for. */
async function checkAllDoors(): Promise<string[]> {
  const maps = new Map<string, MapData>();
  for (const name of zoneNames([])) maps.set(name, generate(await loadZone(name)).data);
  return checkDoors(maps);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  let failed = false;

  if (cmd === 'build') {
    for (const name of zoneNames(rest)) {
      const { data, report } = generate(await loadZone(name));
      fs.writeFileSync(jsonPath(name), JSON.stringify(data));
      writePng(path.join(OUT_DIR, `${name}.png`), renderMap(data));
      writePng(
        path.join(OUT_DIR, `${name}.debug.png`),
        renderMap(data, { collision: true, grid: true, markers: true }),
      );
      console.log(
        `${name}: ${rel(jsonPath(name))} (${data.objects.length} objects, ${data.collision.length} blocked cells)`,
      );
      console.log(
        `  previews: ${rel(path.join(OUT_DIR, `${name}.png`))}, ${rel(path.join(OUT_DIR, `${name}.debug.png`))}`,
      );
      printReport(name, report);
      failed ||= report.errors.length > 0;
    }
    for (const e of await checkAllDoors()) {
      console.log(`  ✗ ${e}`);
      failed = true;
    }
  } else if (cmd === 'check') {
    for (const name of zoneNames(rest)) {
      const { data, report } = generate(await loadZone(name));
      const file = jsonPath(name);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== JSON.stringify(data)) {
        report.errors.unshift(`${rel(file)} is out of date with maps/${name}.ts; run \`npm run map -- build\``);
      }
      printReport(name, report);
      failed ||= report.errors.length > 0;
    }
    for (const e of await checkAllDoors()) {
      console.log(`  ✗ ${e}`);
      failed = true;
    }
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
