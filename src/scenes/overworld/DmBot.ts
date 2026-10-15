// The handle an outside Dungeon Master drives the host through (server/, the DM bot). `?dmbot` in the address puts it on
// `window.dmBot` (main.ts); without it nothing here exists. A headless browser hosts the game and the bot runs the DM's
// whole job through it, polling: it opens what waits in the DM's inbox (the director's nudges, the friends' requests and
// words), answers each card as a person would tap it, replies, speaks, keeps up with the party and starts the game. It
// adds nothing to co-op and no rule: every call is a step the DM bar already offers (`DmPrompts`, `Story.choose`,
// `DmDesk`, `PartyUi.goTo`, `Session`), so friends see what a person hosting would show them. Core engine (the host),
// off unless asked for.

import type { DmCard } from '../../hud/DmCard';
import type { Session } from '../../net/session';
import { openGroundNear } from '../../systems/dmPeople';
import { zoneName } from '../../systems/places';
import type { Arena } from './Arena';
import { parseEpic, type EpicTemplate } from '../../systems/dmEpics';
import type { DmDesk } from './DmDesk';
import type { DmEpics } from './DmEpics';
import type { CardKind, DmPrompts } from './DmPrompts';
import type { DmTasks } from './DmTasks';
import type { Story, StoryView } from './Story';

/** A card waiting for the DM's answer, as the bar shows it. */
export interface DmBotCard {
  kind: string;
  title: string;
  note: string;
  options: { id: string; label: string; on?: boolean }[];
}

/** A friend at the table. */
export interface DmBotFriend {
  slot: number;
  area: string;
  /** Health from 0 to 1. */
  hp: number;
  /** In the same zone as the DM. */
  near: boolean;
}

/** How things stand, for the bot's decisions. */
export interface DmBotState {
  role: Session['role'];
  /** The game code friends type, while the lobby is open. */
  code: string | null;
  lobbyOpen: boolean;
  /** This page is the DM (from the first friend's connection). */
  dm: boolean;
  friends: DmBotFriend[];
  /** The area the DM stands in. */
  area: string;
  /** Things waiting in the DM's inbox. */
  waiting: number;
  /** A DM quest is running. */
  questing: boolean;
  /** A epic (a saga of several quests and people) is being told: between its steps `questing` is false. */
  epic: boolean;
  /** The card up now, if any. */
  card: DmBotCard | null;
  /** The live story and its next roads (null when the world is not a live one). */
  story: StoryView | null;
}

/** The cards the bot may put up on its own (the bar's buttons). */
export const BOT_CARDS = ['next', 'epic', 'sky', 'pressure', 'story', 'suggest'] as const satisfies CardKind[];
export type BotCardKind = (typeof BOT_CARDS)[number];

export interface DmBotApi {
  /** Open a game for friends (the menu's Create): resolves to its code, or null if it could not be made. */
  host(): Promise<string | null>;
  /** Close the lobby and begin: the DM's welcome is told and the game goes on with whoever is connected. */
  start(): void;
  state(): DmBotState;
  /** The Requests button: the oldest thing waiting becomes the card (null when nothing could be shown). */
  openInbox(): DmBotCard | null;
  /** Put up one of the bar's cards now. */
  open(kind: BotCardKind): DmBotCard | null;
  /** Tap an option of the card up now. False when there is no such option. */
  pick(id: string): boolean;
  /** Send the card away unanswered. */
  dismiss(): void;
  /** Take the live story down this road (a `cue` from `state().story.options`). */
  choose(cue: string): { ok: boolean; note: string };
  /** Answer whoever asked for the card up now, privately. */
  reply(text: string): boolean;
  /** Speak to everyone. */
  say(text: string): boolean;
  /** The looks a new person may wear (empty when the world is not a live one). */
  looks(): { id: string; name: string }[];
  /** Make a person and put them near the party, on open ground in the area the DM stands in. */
  spawn(person: { name: string; look: string; lines: string[] }): { ok: boolean; note: string };
  /** The epics the content ships with (data: `epic` takes one back, or one an AI wrote in the same form). */
  stockEpics(): EpicTemplate[];
  /** Tell a epic from where the DM stands. Checked as strictly as a file of epics; the note says what is wrong. */
  epic(raw: unknown): { ok: boolean; note: string };
  /** Go to a friend (the Party tab's Go). */
  goTo: (slot: number) => void;
}

export interface DmBotParts {
  session: Session;
  arena: Arena;
  story: Story;
  desk: DmDesk;
  prompts: DmPrompts;
  card: DmCard;
  tasks: DmTasks;
  epics: DmEpics;
  stock: EpicTemplate[];
  goTo: (slot: number) => void;
}

/** Does this address ask for the bot handle? */
export function wantsDmBot(search: string): boolean {
  return new URLSearchParams(search).has('dmbot');
}

export function createDmBot({
  session,
  arena,
  story,
  desk,
  prompts,
  card,
  tasks,
  epics,
  stock,
  goTo,
}: DmBotParts): DmBotApi {
  const cardView = (): DmBotCard | null => card.view;
  const friends = (): DmBotFriend[] => {
    const here = arena.zoneOf(arena.local);
    return [...arena.remotes.entries()].map(([slot, p]) => {
      const z = arena.zoneOf(p);
      return {
        slot,
        area: zoneName(z.name),
        hp: p.hero.stats.hp / Math.max(1, p.hero.stats.maxHp),
        near: z === here,
      };
    });
  };
  return {
    host: () => session.createGame(),
    start: () => session.startGame(),
    state: () => ({
      role: session.role,
      code: session.code,
      lobbyOpen: session.lobbyOpen,
      dm: arena.local.dm,
      friends: friends(),
      area: zoneName(arena.zoneOf(arena.local).name),
      waiting: prompts.waiting.count,
      questing: tasks.active,
      epic: epics.active,
      card: cardView(),
      story: story.view(),
    }),
    openInbox() {
      prompts.openInbox();
      return cardView();
    },
    open(kind) {
      if (!(BOT_CARDS as readonly string[]).includes(kind)) return null;
      prompts.open(kind);
      return cardView();
    },
    pick(id) {
      const kind = card.kind;
      if (!kind || !card.options.some((o) => o.id === id)) return false;
      card.onPick(kind, id);
      return true;
    },
    dismiss: () => card.dismiss(),
    choose(cue) {
      story.choose(cue);
      const note = story.lastNote;
      return { ok: !note, note };
    },
    reply: (text) => prompts.reply(text),
    say: (text) => desk.say(text),
    looks: () => story.world?.lookOptions() ?? [],
    spawn(person) {
      const world = story.world;
      const z = arena.zoneOf(arena.local);
      const region = story.regionOf(z.name);
      if (!world || !region) return { ok: false, note: 'this is not a place of the live world' };
      const at = openGroundNear(
        z.collision,
        [...arena.remotes.values(), arena.local].filter((p) => arena.zoneOf(p) === z),
      );
      if (!at) return { ok: false, note: 'there is no open ground near the party' };
      story.bring(person, region, at.col, at.row);
      const note = story.lastNote;
      return { ok: !note, note };
    },
    stockEpics: () => stock,
    epic(raw) {
      const epic = parseEpic(raw);
      return typeof epic === 'string' ? { ok: false, note: epic } : epics.beginEpic(epic);
    },
    goTo,
  };
}
