import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutMain } from './repo';
import { analysisPrompt } from './report';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

describe('checkoutMain', () => {
  it('checks out origin/main detached, then removes it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
    try {
      const origin = path.join(root, 'origin');
      const clone = path.join(root, 'clone');
      fs.mkdirSync(origin);
      git(origin, 'init', '-q', '-b', 'main');
      fs.writeFileSync(path.join(origin, 'a.txt'), 'hello');
      git(origin, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
      git(origin, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'one');
      git(root, 'clone', '-q', origin, clone);
      const co = await checkoutMain(clone);
      expect(co).not.toBeNull();
      expect(fs.readFileSync(path.join(co!.dir, 'a.txt'), 'utf8')).toBe('hello');
      await co!.release();
      expect(fs.existsSync(co!.dir)).toBe(false);
      await co!.release(); // twice is fine
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('gives null where there is no remote', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
    try {
      expect(await checkoutMain(dir)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('analysisPrompt grounding', () => {
  const game = { code: 'ABCD', started: new Date(0), ended: new Date(60000), why: 'test' };
  it('tells a grounded analyst to confirm paths', () => {
    expect(analysisPrompt(game, [], { grounded: true }).prompt).toContain('read-only checkout');
    expect(analysisPrompt(game, []).prompt).not.toContain('read-only checkout');
  });
});
