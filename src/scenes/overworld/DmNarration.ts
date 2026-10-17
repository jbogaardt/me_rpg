import { WELCOMES } from '../../systems/dmVoice';
import { Narrator } from '../../systems/narration';
import type { Session } from '../../net/session';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';

/**
 * The Dungeon Master's welcome, told in their voice to every screen (`DmDesk.say`) as the game starts (the host taps Start
 * Game). It is only a greeting: with a DM at the table the DM is the story teller, so the world's own story (its welcome
 * pointing at a keeper, its chapters and their narration) is never told online. What happens next is the DM's to say
 * (a person's, or the bot's), through quests and people they manage. Pre-canned (systems/narration.ts); host only.
 */
export class DmNarration {
  private narrator = new Narrator();
  private wasOpen = false;

  constructor(
    private arena: Arena,
    private session: Session,
    private desk: DmDesk,
    /** Which of the welcomes to say (a different one from game to game). */
    private pick: (welcomes: string[][]) => string[] = (w) => w[Math.floor(Math.random() * w.length)] ?? [],
  ) {}

  update(dt: number) {
    if (this.arena.role !== 'host') {
      this.wasOpen = this.session.lobbyOpen;
      return;
    }
    const open = this.session.lobbyOpen;
    if (this.wasOpen && !open) this.narrator.tell(this.pick(WELCOMES));
    this.wasOpen = open;
    const line = this.narrator.tick(dt);
    if (line) this.desk.say(line);
  }

  reset() {
    this.narrator.clear();
    this.wasOpen = false;
  }
}
