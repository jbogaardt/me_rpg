// Connecting two towercraft pages for a duel, the way Me RPG connects co-op: the matchmaking relay (relay/) carries only the
// connection details under a two-word code, then the pages talk directly over a WebRTC data channel and the relay is forgotten. This
// is the transport of `src/net` (PeerLink, RelayClient, room codes) reused as is; what differs is the game on top (lockstep.ts) and
// that a duel has exactly one seat. The channel is ORDERED and reliable (the commands must all arrive, in order), unlike Me RPG's.
//
//   host: createOffer -> relay.createRoom([offer]) -> show the code -> waitForAnswers -> acceptAnswer -> channel opens
//   join: relay.join(code) -> acceptOffer -> relay.sendAnswer -> answerDelivered -> channel opens
//
// Pixi-free; the relay and the link are injected so the flow is tested with fakes (duel.test.ts).

import { PeerLink, type Link, type LinkHandlers, type LinkRole, type LinkStatus } from '../../../src/net/PeerLink';
import { RelayClient, RelayError, type Room } from '../../../src/net/relayClient';
import { RELAY_URL } from '../../../src/net/relayConfig';
import { normalizeCode } from '../../../src/net/roomCode';
import { encode, parseMessage, type Message } from './lockstep';

export type LinkFactory = (role: LinkRole, handlers: LinkHandlers) => Link;
export type Relay = Pick<RelayClient, 'createRoom' | 'join' | 'sendAnswer' | 'waitForAnswers' | 'closeRoom' | 'cancel'>;

/** Where the player is in setting up: the menu words each. */
export type DuelPhase = 'idle' | 'working' | 'waiting' | 'connected' | 'failed';

export interface DuelHandlers {
  /** The setup moved on. `code` is the host's game code once the relay has issued one. */
  phase(phase: DuelPhase, text: string, code?: string): void;
  /** A message from the other player (connected only). */
  message(message: Message): void;
  /** The connection ended after it was up: `reason` is for the player. */
  closed(reason: string): void;
}

const pagesLink: LinkFactory = (role, handlers) => new PeerLink(role, handlers, { ordered: true });

export class Duel {
  private link: Link | null = null;
  private abort: AbortController | null = null;
  private room: Room | null = null;
  private up = false;

  constructor(
    private handlers: DuelHandlers,
    private relay: Relay = new RelayClient(RELAY_URL),
    private makeLink: LinkFactory = pagesLink,
  ) {}

  get connected() {
    return this.up;
  }

  /** Send to the other player; false when the channel is not open. */
  send(message: Message): boolean {
    return this.up && !!this.link?.send(encode(message));
  }

  /** Host a game: get a code, wait for one friend. */
  async host(): Promise<void> {
    if (!RELAY_URL && this.relay instanceof RelayClient)
      return this.fail('Online play needs the game server, which is not set up here.');
    const attempt = this.begin();
    try {
      this.handlers.phase('working', 'Making a game…');
      const link = this.attach('host', attempt);
      const offer = await link.createOffer();
      const room = await this.relay.createRoom([offer], attempt.signal);
      if (attempt.signal.aborted) return void this.relay.cancel(room);
      this.room = room;
      this.handlers.phase('waiting', 'Waiting for your rival…', room.code);
      let after = 0;
      for (let got = false; !got;) {
        const batch = await this.relay.waitForAnswers(room, after, attempt.signal);
        after = batch.next;
        const first = batch.answers[0];
        if (first) {
          got = true;
          this.handlers.phase('working', 'Connecting…', room.code);
          await link.acceptAnswer(first.answer);
        }
      }
    } catch (err) {
      this.failed(err, attempt);
    }
  }

  /** Join a game by the code its host shows. */
  async join(typed: string): Promise<void> {
    const code = normalizeCode(typed);
    if (!code) return this.fail('That is not a game code. It is two words, like mighty-apples.');
    const attempt = this.begin();
    try {
      this.handlers.phase('working', 'Finding the game…');
      const invitation = await this.relay.join(code, attempt.signal);
      const link = this.attach('join', attempt);
      const answer = await link.acceptOffer(invitation.offer);
      await this.relay.sendAnswer(code, invitation.guestToken, answer, attempt.signal);
      if (attempt.signal.aborted) return;
      this.handlers.phase('working', 'Connecting…');
      link.answerDelivered();
    } catch (err) {
      this.failed(err, attempt);
    }
  }

  /** Give up or leave: tears down the link and tells the relay the code is no longer wanted. */
  close() {
    this.abort?.abort();
    this.abort = null;
    if (this.room) this.relay.cancel(this.room);
    this.room = null;
    const link = this.link;
    this.link = null;
    this.up = false;
    link?.close();
  }

  // --- Internals ---

  private begin() {
    this.close();
    const abort = new AbortController();
    this.abort = abort;
    return abort;
  }

  private attach(role: LinkRole, attempt: AbortController): Link {
    const link = this.makeLink(role, {
      status: (status: LinkStatus, detail: string) => {
        if (this.abort !== attempt || this.link !== link) return;
        if (status === 'connected') {
          this.up = true;
          if (this.room) this.relay.closeRoom(this.room);
          this.room = null;
          this.handlers.phase('connected', 'Connected.');
        } else if (status === 'failed' || status === 'disconnected') {
          const wasUp = this.up;
          const reason = detail || 'The connection was lost.';
          this.close();
          if (wasUp) this.handlers.closed(reason);
          else this.handlers.phase('failed', reason);
        }
      },
      message: (data: string) => {
        const m = this.link === link ? parseMessage(data) : null;
        if (m) this.handlers.message(m);
      },
    });
    this.link = link;
    return link;
  }

  private failed(err: unknown, attempt: AbortController) {
    if (this.abort !== attempt || attempt.signal.aborted) return; // cancelled by the player: not an error to show
    this.close();
    this.fail(
      err instanceof RelayError || err instanceof Error ? err.message : 'Could not set up the game. Try again.',
    );
  }

  private fail(text: string) {
    this.handlers.phase('failed', text);
  }
}
