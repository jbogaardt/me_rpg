// A read-only checkout of the game's current `origin/main` for the end-of-game analyst (`report.ts`): a detached git
// worktree in a temp folder, so Haiku can Read/Grep real files (does this path exist? what does the code do now?) instead of
// trusting a hand-kept map, and the working tree the bot runs from is never touched. Any failure (offline, not a git
// checkout, no remote) gives `null` and the analyst falls back to the static `REPO_MAP`.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Checkout {
  /** The folder the analyst runs in. */
  dir: string;
  /** Remove the worktree (safe to call twice). */
  release(): Promise<void>;
}

/** Tools the analyst may use in it: reading and searching only, never writing or running anything. */
export const ANALYST_TOOLS = 'Read,Grep,Glob';

const GIT_TIMEOUT_MS = 30_000;

const git = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS }, (err, stdout) =>
      err ? reject(new Error(err.message)) : resolve(stdout),
    );
  });

/** Fetch `origin/main` and check it out detached in a fresh temp folder; `null` if any step fails. */
export async function checkoutMain(repo = process.cwd(), branch = 'main'): Promise<Checkout | null> {
  let dir = '';
  try {
    await git(repo, ['fetch', '--quiet', 'origin', branch]);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'me-rpg-analyst-'));
    await git(repo, ['worktree', 'add', '--detach', '--force', dir, `origin/${branch}`]);
    let released = false;
    return {
      dir,
      async release() {
        if (released) return;
        released = true;
        await git(repo, ['worktree', 'remove', '--force', dir]).catch(() => undefined);
        fs.rmSync(dir, { recursive: true, force: true });
      },
    };
  } catch {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    await git(repo, ['worktree', 'prune']).catch(() => undefined);
    return null;
  }
}
