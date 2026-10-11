import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetVersions } from './assetVersions';

describe('assetVersions', () => {
  it('versions each file by its content, so only a changed file gets a new URL', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-'));
    fs.mkdirSync(path.join(root, 'maps'));
    fs.mkdirSync(path.join(root, 'sprites/lpc'), { recursive: true });
    fs.writeFileSync(path.join(root, 'maps/a.json'), '{"a":1}');
    fs.writeFileSync(path.join(root, 'sprites/lpc/b.png'), 'png');
    fs.writeFileSync(path.join(root, 'other.txt'), 'not fetched by the game');
    const before = assetVersions(root);
    expect(Object.keys(before)).toEqual(['maps/a.json', 'sprites/lpc/b.png']);
    expect(before['maps/a.json']).toMatch(/^[\w-]{8}$/);

    fs.writeFileSync(path.join(root, 'maps/a.json'), '{"a":2}');
    const after = assetVersions(root);
    expect(after['maps/a.json']).not.toBe(before['maps/a.json']);
    expect(after['sprites/lpc/b.png']).toBe(before['sprites/lpc/b.png']);
    fs.rmSync(root, { recursive: true });
  });

  it('covers every file the game fetches from public/', () => {
    const table = assetVersions(path.resolve(import.meta.dirname, '../public'));
    expect(table['maps/overworld.json']).toBeDefined();
    expect(table['tilesets/chests.png']).toBeDefined();
    expect(table['sprites/lpc/parts.json']).toBeDefined();
  });
});
