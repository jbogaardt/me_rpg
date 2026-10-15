// The handle an outside Dungeon Master drives the host through (tools/dm-bot). `?dmbot` in the address puts it on
// `window.dmBot` (main.ts); without it nothing here exists. A headless browser hosts the game, each friend's request to
// the DM (`DmPrompts.onHeard`) is handed to `window.onPlayerAction`, which the bot's script exposes, and the script answers
// through the same handle: choose the live story's next step, reply to the friend. It adds nothing to co-op: it drives
// the host's own steps (`Session.createGame`, `Story.choose`, `DmDesk.replyTo`), so friends see what a person hosting
// would show them, through the usual messages. Core engine (the host), off unless asked for.

import type { Session } from '../../net/session';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { DmPrompts } from './DmPrompts';
import type { Story, StoryView } from './Story';

/** What the bot is told with every action, and can ask for at any time. */
export interface DmBotState {
  role: Session['role'];
  /** The game code friends type, while the lobby is open. */
  code: string | null;
  /** The friends' player numbers. */
  friends: number[];
  /** The area the DM stands in. */
  area: string;
  /** The live story and its next roads (null when the world is not a live one). */
  story: StoryView | null;
}

export interface DmBotApi {
  /** Open a game for friends (the menu's Create): resolves to its code, or null if it could not be made. */
  host(): Promise<string | null>;
  /** Close the lobby: the game goes on with whoever is connected. */
  start(): void;
  state(): DmBotState;
  /** Take the live story down this road (a `cue` from `state().story.options`). */
  choose(cue: string): { ok: boolean; note: string };
  /** Answer one friend privately, as the DM's words. */
  reply(slot: number, text: string): boolean;
}

/** The function the bot's script puts on the page (`page.exposeBinding`). */
type ActionListener = (slot: number, text: string, state: DmBotState) => unknown;

/** Does this address ask for the bot handle? */
export function wantsDmBot(search: string): boolean {
  return new URLSearchParams(search).has('dmbot');
}

export function createDmBot(session: Session, arena: Arena, story: Story, desk: DmDesk, prompts: DmPrompts): DmBotApi {
  const state = (): DmBotState => ({
    role: session.role,
    code: session.code,
    friends: [...arena.remotes.keys()],
    area: arena.view.name,
    story: story.view(),
  });
  prompts.onHeard = (slot, text) => {
    const listener = (window as { onPlayerAction?: ActionListener }).onPlayerAction;
    if (typeof listener !== 'function') return;
    try {
      void Promise.resolve(listener(slot, text, state())).catch((err: unknown) => console.warn('dm bot', err));
    } catch (err) {
      console.warn('dm bot', err); // the bot going wrong must never stop the game
    }
  };
  return {
    host: () => session.createGame(),
    start: () => session.startGame(),
    state,
    choose(cue) {
      const before = story.view()?.placed.length ?? 0;
      story.choose(cue);
      const note = story.lastNote;
      return { ok: !note && (story.view()?.placed.length ?? 0) >= before, note };
    },
    reply: (slot, text) => desk.replyTo([slot], text),
  };
}
