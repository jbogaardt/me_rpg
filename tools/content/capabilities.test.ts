// Every capability (src/systems/capabilities.ts) is a switch wired to something and known to the docs: one that nothing
// asks `enabled()` about would do nothing when a campaign turns it off, and one CLAUDE.md does not list is one nobody knows of.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, CAPABILITY_IDS } from '../../src/systems/capabilities';
import { ROOT } from '../map/image';

/** Every .ts file under src/, but the tests and the registry itself. */
function sources(dir = path.join(ROOT, 'src')): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('capabilities.ts') ? [p] : [];
  });
}

describe('capabilities', () => {
  const code = sources().map((f) => fs.readFileSync(f, 'utf8'));
  const docs = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  it.each(CAPABILITY_IDS)('%s is gated in the code and listed in CLAUDE.md', (id) => {
    expect(
      code.some((text) => text.includes(`enabled('${id}')`)),
      `nothing asks enabled('${id}')`,
    ).toBe(true);
    expect(docs.includes(`\`${id}\``), `CLAUDE.md does not list "${id}"`).toBe(true);
    expect(CAPABILITIES[id].off.length).toBeGreaterThan(10);
  });
});
