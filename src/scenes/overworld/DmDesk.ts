import type { ContentManager } from '../../content/ContentManager';
import type { DmMsg, VoteWire } from '../../net/protocol';
import type { Session } from '../../net/session';
import { DIALS, enabled, type Dial } from '../../systems/capabilities';
import type { DayClock } from '../../systems/daynight';
import { MESSAGE_CODE, REQUESTS, cleanAsk } from '../../systems/dmRequests';
import { cleanCued } from '../../systems/cues';
import { sayTime } from '../../systems/dmPowers';
import { taskFromWire, taskWire } from '../../systems/dmTasks';
import { questDials } from '../../systems/quests';
import { CLIMATES, isClimate, PRECIPS, type Precip } from '../../systems/weather';
import type { Arena } from './Arena';

/** Seconds between the host's repeats of what the DM has set, when nothing changed. */
const DM_RESEND = 1;

/** A vote the Dungeon Master opened: its choices (story cues and what the party reads), and who chose what. */
interface Vote {
  id: number;
  options: { cue: string; label: string }[];
  /** By player number: the index of their choice. */
  chosen: Map<number, number>;
}

/** What the Dials tab shows (hud/Dials.ts). */
export interface DialsView {
  /** The zone the DM stands in, its name, and the precipitation its climate allows (none for a room). */
  zone: string;
  precips: Precip[];
  /** What the sky is doing there now. */
  precip: Precip | null;
  windLevel: number;
  /** Each capability the DM may switch, whether it is on where they stand, and whether the DM set it. */
  dials: { id: Dial; on: boolean; set: boolean }[];
}

/** What the Story tab adds for a vote (the DM's view of it). */
export interface VoteView {
  open: boolean;
  /** How many chose each option, in the order of `options`. */
  tally: Record<string, number>;
  /** How many friends could vote. */
  voters: number;
}

/**
 * The Dungeon Master's controls over the world, beyond the story (scenes/overworld/Story.ts): the weather where they
 * stand, the time of day, the capabilities they switch for everyone (`DIALS`, over the content's own word) and votes
 * they open for the party. On whoever runs the world (solo, or the host); the host tells its friends in a `dm` message
 * (net/protocol.ts) when it changes and once a second, and each friend sets its clock and dials from it and shows the
 * vote. A friend's vote rides in its input (`InputMsg.vt`), so it is never lost.
 */
export class DmDesk {
  private vote: Vote | null = null;
  private voteSeq = 0;
  private seq = 0;
  private timer = 0;
  private sentSig = '';
  /** Guest: the vote the DM has open, as told, and this player's choice in it. */
  private told: VoteWire | null = null;
  private mine: { id: number; index: number } | null = null;
  private dialSig = '';
  private questSig = '{}';
  /** Host: what the DM last said and how long it still goes out; guest: the newest saying shown. */
  private said: { id: number; text: string; left: number; zone?: string } | null = null;
  private saySeq = 0;
  private lastSay = 0;
  private asked: [number, number] | [number, number, string] | undefined;
  private askSeq = 0;
  /** Host: what the DM answered each friend, privately, and how long it still goes out. */
  private replies = new Map<number, { id: number; text: string; left: number }>();
  private replySeq = 0;
  private lastReply = 0;
  /** A friend heard the DM: the scene shows the words. */
  onSay: (text: string) => void = () => {};

  constructor(
    private arena: Arena,
    private session: Session,
    private content: ContentManager,
    private clock: DayClock,
  ) {}

  /** The host's lobby is still open (nobody has tapped Start Game): the game has not begun. */
  get lobby(): boolean {
    return this.session.lobbyOpen;
  }

  // --- The DM's side (solo or host) ---

  /** The weather where the DM stands: `precip` (null: none) and a wind level (0 still, 0.5 a breeze, 1 a gale). */
  setWeather(precip: Precip | null, windLevel: number) {
    this.arena.view.weather?.force(precip, windLevel);
  }

  /** Make it this hour (0 to 24) for everyone; null gives the real time of day back. */
  setHour(hour: number | null) {
    if (hour === null) this.clock.shift = 0;
    else this.clock.setHour(hour);
  }

  /** Switch a capability for everyone (true or false), or give it back to the content (null). */
  setDial(id: Dial, on: boolean | null) {
    const dials = { ...this.content.dialsSet };
    if (on === null) delete dials[id];
    else dials[id] = on;
    this.content.setDials(dials);
  }

  dialsView(): DialsView {
    const z = this.arena.view;
    const climate = z.data.indoor ? null : z.data.climate;
    const precips = climate && isClimate(climate) ? (Object.keys(CLIMATES[climate].precip) as Precip[]) : [];
    const set = this.content.dialsSet;
    return {
      zone: z.name,
      precips: precips.filter((p) => PRECIPS.includes(p)),
      precip: z.weather?.precip ?? null,
      windLevel: z.weather?.windLevel ?? 0,
      dials: DIALS.map((id) => ({ id, on: enabled(id, z.name), set: set[id] !== undefined })),
    };
  }

  /**
   * The DM speaks to the party: the words appear on every friend's screen (and the DM's own). False if there were none.
   * With a `zone`, only friends standing in that zone hear it (a word about what one player sees is not for another who is
   * somewhere else); the DM's own screen always shows it.
   */
  say(text: string, zone?: string): boolean {
    const words = cleanCued(text);
    if (!words || this.arena.role === 'client') return false; // solo speaks to itself (its own screen)
    this.said = { id: ++this.saySeq, text: words, left: sayTime(words), ...(zone ? { zone } : {}) };
    this.timer = DM_RESEND; // tell them now
    this.onSay(words);
    return true;
  }

  /** Ask the party to choose among `options` (the story's next steps); a new vote replaces an open one. */
  openVote(options: { cue: string; label: string }[]) {
    if (options.length < 2) return;
    this.vote = { id: ++this.voteSeq, options: options.slice(0, 6), chosen: new Map() };
    this.timer = DM_RESEND; // tell them now
  }

  closeVote() {
    this.vote = null;
    this.timer = DM_RESEND;
  }

  voteView(): VoteView {
    const vote = this.vote;
    const tally: Record<string, number> = {};
    for (const [, i] of vote?.chosen ?? []) {
      const cue = vote!.options[i]?.cue;
      if (cue) tally[cue] = (tally[cue] ?? 0) + 1;
    }
    return { open: !!vote, tally, voters: [...this.arena.remotes.values()].filter((p) => !p.dm).length };
  }

  // --- Each frame ---

  update(dt: number) {
    if (this.arena.role !== 'client') this.questSwitches();
    if (this.arena.role === 'host') this.host(dt);
    else if (this.arena.role === 'client') this.guest();
    else if (this.vote) this.vote = null; // solo there is nobody to ask
  }

  /** Solo and host: what the party's quests switch (a hide-and-seek quest turns the map off...), told to friends via `dials`. */
  private questSwitches() {
    const heroes = this.arena.party().map((p) => p.hero);
    const now = questDials(heroes);
    const sig = JSON.stringify(now);
    if (sig === this.questSig) return;
    this.questSig = sig;
    this.content.setQuestDials(now);
  }

  private host(dt: number) {
    const vote = this.vote;
    if (vote) {
      for (const slot of this.arena.remotes.keys()) {
        const vt = this.session.peerInput(slot)?.vt;
        if (vt && vt[0] === vote.id && vt[1] < vote.options.length) vote.chosen.set(slot, vt[1]);
      }
    }
    this.timer += dt;
    if (this.said && (this.said.left -= dt) <= 0) this.said = null;
    const said = this.said;
    const say = said ? ([said.id, said.text] as [number, string]) : undefined;
    const base = { shift: Math.round(this.clock.shift * 1e4) / 1e4, dials: this.content.effectiveDials };
    const hold = this.arena.timeStopped;
    const task = this.arena.task;
    for (const [slot, r] of this.replies) if ((r.left -= dt) <= 0) this.replies.delete(slot);
    const replied = [...this.replies].map(([slot, r]) => [slot, r.id]);
    const sig = JSON.stringify([base, vote?.id, [...(vote?.chosen ?? [])], say?.[0], hold, task, replied]);
    if (sig === this.sentSig && this.timer < DM_RESEND) return;
    this.sentSig = sig;
    this.timer = 0;
    const counts = vote ? vote.options.map((_, i) => [...vote.chosen.values()].filter((c) => c === i).length) : [];
    for (const slot of this.arena.remotes.keys()) {
      const msg: DmMsg = {
        k: 'dm',
        n: ++this.seq,
        ...base,
        ...(say && (!said?.zone || this.arena.remotes.get(slot)?.zone === said.zone) ? { say } : {}),
        ...(this.replies.has(slot)
          ? { reply: [this.replies.get(slot)!.id, this.replies.get(slot)!.text] as [number, string] }
          : {}),
        ...(hold ? { hold: 1 as const } : {}),
        ...(task ? { task: taskWire(task) } : {}),
        vote: vote
          ? {
              id: vote.id,
              options: vote.options.map((o) => o.label),
              tally: counts,
              yours: vote.chosen.get(slot) ?? -1,
            }
          : null,
      };
      this.session.sendTo(slot, msg);
    }
  }

  private guest() {
    const msg = this.session.takeDm();
    if (!msg) return;
    this.clock.shift = msg.shift;
    this.arena.timeStopped = msg.hold === 1;
    this.arena.task = msg.task ? taskFromWire(msg.task) : null;
    const sig = JSON.stringify(msg.dials);
    if (sig !== this.dialSig) {
      this.dialSig = sig;
      this.content.setDials(msg.dials);
    }
    if (msg.say && msg.say[0] !== this.lastSay) {
      this.lastSay = msg.say[0];
      this.onSay(msg.say[1]);
    }
    if (msg.reply && msg.reply[0] !== this.lastReply) {
      this.lastReply = msg.reply[0];
      this.onSay(msg.reply[1]); // the DM's answer to this friend alone, shown as the DM's words
    }
    this.told = msg.vote;
    if (!msg.vote || this.mine?.id !== msg.vote.id) this.mine = null;
  }

  // --- A friend's side ---

  /** The vote the DM has open, as this friend is to see it (null: none). */
  get openVoteForGuest(): (VoteWire & { mine: number }) | null {
    if (this.arena.role !== 'client' || !this.told) return null;
    const mine = this.mine?.id === this.told.id ? this.mine.index : this.told.yours;
    return { ...this.told, mine };
  }

  /** This friend chose option `index` of the open vote (sent with every input until the vote closes). */
  castVote(index: number) {
    if (this.told && index >= 0 && index < this.told.options.length) this.mine = { id: this.told.id, index };
  }

  /** What rides in this friend's input: [vote id, choice], while a vote is open and they have chosen. */
  get voteInput(): [number, number] | undefined {
    if (!this.told || !this.mine || this.mine.id !== this.told.id) return undefined;
    return [this.mine.id, this.mine.index];
  }

  /**
   * Friend: ask the Dungeon Master for something: an index of `REQUESTS`, or (`MESSAGE_CODE` with `text`) words of their own.
   * There is no waiting between asks. False for nothing to say.
   */
  ask(code: number, text = ''): boolean {
    if (this.arena.role !== 'client') return false;
    if (code === MESSAGE_CODE) {
      const words = cleanAsk(text);
      if (!words) return false;
      this.asked = [++this.askSeq, code, words];
      return true;
    }
    if (code < 0 || code >= REQUESTS.length) return false;
    this.asked = [++this.askSeq, code];
    return true;
  }

  /** What rides in this friend's input: the latest request, [counter, which, words?]. */
  get requestInput(): [number, number] | [number, number, string] | undefined {
    return this.asked;
  }

  /** Host: each friend's latest request; the caller keeps what it has already seen (each friend's counter grows). */
  requestsHeard(): { slot: number; id: number; code: number; text?: string }[] {
    const out: { slot: number; id: number; code: number; text?: string }[] = [];
    for (const slot of this.arena.remotes.keys()) {
      const rq = this.session.peerInput(slot)?.rq;
      if (rq) out.push({ slot, id: rq[0], code: rq[1], ...(rq[2] ? { text: rq[2] } : {}) });
    }
    return out;
  }

  /** Host: answer friends privately (their seats): the words appear on their screens alone. False if there were none to say. */
  replyTo(slots: number[], text: string): boolean {
    const words = cleanCued(text);
    if (!words || this.arena.role !== 'host' || !slots.length) return false;
    for (const slot of slots) this.replies.set(slot, { id: ++this.replySeq, text: words, left: sayTime(words) });
    this.timer = DM_RESEND; // tell them now
    return true;
  }

  /** Back to solo (or a new game): forget what the DM said; the clock and capabilities go back to the content's. */
  reset() {
    this.vote = null;
    this.told = null;
    this.mine = null;
    this.asked = undefined;
    this.askSeq = 0;
    this.replies.clear();
    this.lastReply = 0;
    this.dialSig = '';
    this.sentSig = '';
    this.said = null;
    this.lastSay = 0;
    this.arena.timeStopped = false;
    this.arena.task = null;
    this.clock.shift = 0;
    this.content.setDials({});
    this.content.setQuestDials({});
    this.questSig = '{}';
  }
}
