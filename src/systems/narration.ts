// The Dungeon Master's pre-canned narration (Pixi-free, tested): lines said in turn, each long enough to read, so a
// welcome or a chapter's opening comes as a few quiet beats rather than a wall of text. The words are content
// (`quests.json` `welcome`, a chapter's `narration`); until an AI writes new ones the DM tells the tale as written.

/** What the DM says as the game starts when the story gives no welcome of its own. */
export const DEFAULT_WELCOME = [
  'Welcome, travellers. I am your Dungeon Master.',
  'Stay close, look after one another, and listen: I will call on you when the tale needs you.',
];

/** Seconds a line is up before the next: time to read it, never longer than the DM's words stay on screen. */
export const readTime = (line: string): number => Math.max(4, Math.min(8, 2.5 + line.length / 20));

export class Narrator {
  private queue: string[] = [];
  private wait = 0;

  /** Add lines to what is to be said (blank ones are skipped). */
  tell(lines: readonly string[]) {
    for (const l of lines) if (l.trim()) this.queue.push(l.trim());
  }

  /** Advance `dt` seconds; the next line when it is time for one, else null. */
  tick(dt: number): string | null {
    this.wait -= dt;
    const line = this.queue[0];
    if (line === undefined || this.wait > 0) return null;
    this.queue.shift();
    this.wait = readTime(line);
    return line;
  }

  get busy(): boolean {
    return this.queue.length > 0 || this.wait > 0;
  }

  clear() {
    this.queue = [];
    this.wait = 0;
  }
}
