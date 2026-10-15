// Guards for the setup itself: the docs describe things that exist and stay small enough to be worth loading, and the
// engine stays written against registries, not against a campaign's ids. (The layer boundaries are the ESLint rule in
// eslint.config.js.) A failure here means the docs drifted or grew: fix or trim them, don't raise a budget lightly.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './map/image';

function walk(
  dir: string,
  keep: (p: string) => boolean,
  skip = /\/(node_modules|\.git|dist|public)(\/|$)|\/maps\/out/,
): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (skip.test(p)) return [];
    return e.isDirectory() ? walk(p, keep, skip) : keep(p) ? [p] : [];
  });
}

const docs = [
  ...walk(ROOT, (p) => p.endsWith('CLAUDE.md')),
  ...walk(path.join(ROOT, 'docs'), (p) => p.endsWith('.md')),
];
const rel = (p: string) => path.relative(ROOT, p);
const code = walk(
  ROOT,
  (p) => /\.(ts|json|sh|yml|html|css)$/.test(p) && !p.endsWith('CLAUDE.md'),
  /\/(node_modules|\.git|dist|art)(\/|$)|\/maps\/out|\/public\/maps/,
);
const everything = code.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const tracked = new Set(
  walk(ROOT, () => true, /\/(node_modules|\.git|dist|art)(\/|$)|\/maps\/out/).map((p) => path.basename(p)),
);

describe('the docs', () => {
  it('are found', () => expect(docs.length).toBeGreaterThan(8));

  // Budgets: the root loads every session, a nested file whenever its directory is worked in.
  it.each(docs.map(rel))('%s stays within its size budget', (file) => {
    const budget = file === 'CLAUDE.md' ? 16_000 : 8_000;
    expect(fs.statSync(path.join(ROOT, file)).size, `${file} is over ${budget} bytes: trim it`).toBeLessThanOrEqual(
      budget,
    );
  });

  // Drift: every file path and every distinctive identifier a doc puts in backticks must still exist.
  it.each(docs.map(rel))('%s names only files and symbols that exist', (file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const gone: string[] = [];
    for (const raw of new Set([...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()))) {
      if (/^[\w./-]+\.(ts|md|json|sh|yml|html|css)$/.test(raw)) {
        const exists =
          fs.existsSync(path.join(ROOT, raw)) ||
          fs.existsSync(path.join(path.dirname(path.join(ROOT, file)), raw)) ||
          tracked.has(path.basename(raw));
        if (!exists) gone.push(raw);
      } else if (
        /^[A-Za-z_]\w{3,}$/.test(raw) &&
        (raw.includes('_') || /[a-z][A-Z]/.test(raw) || raw === raw.toUpperCase())
      ) {
        if (!everything.includes(raw)) gone.push(raw);
      }
    }
    expect(gone, `${file} mentions things that no longer exist`).toEqual([]);
  });
});

describe('the engine', () => {
  // Core engine code is written against registries and properties, never a content id (CLAUDE.md, "Where a feature
  // belongs"). The known leftover from campaign 1 is allow-listed; clear it when touched, don't add to it.
  const ALLOWED = new Set(['src/systems/skills.ts']);
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/content/campaign1/biomes.json'), 'utf8')) as {
    biomes?: Record<string, unknown>;
  } & Record<string, unknown>;
  const biomes = Object.keys(file.biomes ?? file).filter((id) => /^[a-z]+$/.test(id));

  it('has campaign 1 biome ids to look for', () => expect(biomes.length).toBeGreaterThan(5));
  it('names no campaign 1 biome in game code', () => {
    const hits: string[] = [];
    for (const p of walk(path.join(ROOT, 'src'), (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      if (ALLOWED.has(rel(p))) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const id of biomes) if (new RegExp(`['"\`]${id}['"\`]`).test(text)) hits.push(`${rel(p)}: '${id}'`);
    }
    expect(hits, 'a content id in src/: ask a property or the content instead').toEqual([]);
  });
});
