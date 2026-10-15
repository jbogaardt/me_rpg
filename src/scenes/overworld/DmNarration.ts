import { CHAPTERS, WELCOME, currentChapter } from '../../systems/quests';
import { DEFAULT_WELCOME, Narrator } from '../../systems/narration';
import type { Session } from '../../net/session';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';

/**
 * The Dungeon Master's welcome and chapter openings, told in their voice to every screen (`DmDesk.say`): the story's
 * `welcome` as the game starts (the host taps Start Game), then each chapter's `narration` as the party first reaches it.
 * Pre-canned content (systems/narration.ts); online only, where there is a DM to speak.
 */
export class DmNarration {
  private narrator = new Narrator();
  private wasOpen = false;
  private told = -1; // the furthest chapter narrated

  constructor(
    private arena: Arena,
    private session: Session,
    private desk: DmDesk,
  ) {}

  update(dt: number) {
    if (this.arena.role !== 'host') {
      this.wasOpen = this.session.lobbyOpen;
      return;
    }
    const open = this.session.lobbyOpen;
    if (this.wasOpen && !open) this.narrator.tell(WELCOME.length ? WELCOME : DEFAULT_WELCOME);
    this.wasOpen = open;
    if (!open) this.chapters();
    const line = this.narrator.tick(dt);
    if (line) this.desk.say(line);
  }

  /** The party reached a chapter nobody has heard yet: the DM sets the scene. */
  private chapters() {
    let lead = -1;
    for (const p of this.arena.party()) lead = Math.max(lead, currentChapter(p.hero.quests)?.index ?? -1);
    if (lead <= this.told) return;
    for (let i = this.told + 1; i <= lead; i++) this.narrator.tell(CHAPTERS[i]?.narration ?? []);
    this.told = lead;
  }

  reset() {
    this.narrator.clear();
    this.wasOpen = false;
    this.told = -1;
  }
}
