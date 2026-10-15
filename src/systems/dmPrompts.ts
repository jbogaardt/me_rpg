// When the Dungeon Master is offered a choice (Pixi-free, tested; core engine, co-op). The DM has no admin panel: a card
// appears at the right moment with two or three options, and the game carries on whether or not they answer (but the
// story, which only they can advance). This decides WHEN; scenes/overworld/DmPrompts.ts decides what each card says.

export type PromptKind = 'story' | 'sky' | 'pressure';

/** What the scheduler sees each frame. */
export interface PromptState {
  /** The party has told every quest placed so far and there is a road to take (a live world's next step). */
  storyReady: boolean;
  /** The name of the area the party is in (changes when they cross into another). */
  area: string;
  /** The most quests any player has finished. */
  questsDone: number;
  /** A card is up, or the DM is typing: nothing new now. */
  busy: boolean;
}

/** Seconds between cards that only add colour (sky, pressure); the story card only waits a few seconds. */
export const PROMPT_GAP = 75;
const STORY_GAP = 5;

export class Prompter {
  private since = 0;
  private area: string | null = null;
  private quests: number | null = null;
  private wantSky = false;
  private wantPressure = false;

  /** Advance `dt` seconds; the card to offer now, if any (each call may return one, and then waits its gap). */
  tick(dt: number, s: PromptState): PromptKind | null {
    this.since += dt;
    if (this.area !== null && s.area !== this.area) this.wantSky = true; // a new land: how does the sky look?
    this.area = s.area;
    if (this.quests !== null && s.questsDone > this.quests) this.wantPressure = true; // a task done: how hard next?
    this.quests = s.questsDone;
    if (s.busy) return null;
    if (s.storyReady && this.since >= STORY_GAP) return this.fire(null);
    if (this.since < PROMPT_GAP) return null;
    if (this.wantSky) return this.fire('sky');
    if (this.wantPressure) return this.fire('pressure');
    return null;
  }

  private fire(kind: 'sky' | 'pressure' | null): PromptKind {
    this.since = 0;
    if (kind === 'sky') this.wantSky = false;
    else if (kind === 'pressure') this.wantPressure = false;
    return kind ?? 'story';
  }

  /** The DM said "not now": ask again no sooner than `seconds` from now. */
  snooze(seconds: number) {
    this.since = Math.min(this.since, -seconds);
  }

  /** Something the DM did by hand counts as an answer: no card for what they just set. */
  settled(kind: 'sky' | 'pressure') {
    if (kind === 'sky') this.wantSky = false;
    else this.wantPressure = false;
  }

  reset() {
    this.since = 0;
    this.area = null;
    this.quests = null;
    this.wantSky = this.wantPressure = false;
  }
}
