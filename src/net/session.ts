import { LinkClosed, PeerLink, type Link, type LinkFactory, type LinkStatus } from './PeerLink';
import { encodeMessage, parseMessage, PROTOCOL_VERSION, type InputMsg, type Message, type SnapMsg } from './protocol';
import { MAX_GUESTS } from './relayApi';
import { RelayClient, RelayError, type Room } from './relayClient';
import { RELAY_URL } from './relayConfig';
import { codeFromHash, normalizeCode } from './roomCode';

// Multiplayer state shared by the settings menu (which drives the connection) and the game loop (which reads it).
//
// Setting up a game goes through the matchmaking relay: the host's offers are stored under a short game code, each
// friend types the code and takes the next free seat, and the two swap connection details through it. Then the phones
// talk directly: every friend has their own connection to the host (a star, never friend to friend).
//
// The game polls `role` and `connectedSlots()` every frame, so game code never runs inside a network callback:
//   solo    nobody connected (the default, and whenever a host has no friends yet)
//   host    at least one friend is connected; the host runs the simulation
//   client  this machine is a friend in someone else's game; it renders the host's snapshots
// Player numbers: the host is 0; friends are 1 to MAX_GUESTS in the order of their seats.

/** What the player picked in the menu. */
export type Mode = 'off' | 'host' | 'join';
/** How the game loop should behave right now. */
export type Role = 'solo' | 'host' | 'client';

/** A seat at the host's table: waiting for a friend, a friend connecting, or a friend playing. */
export type SeatState = 'waiting' | 'joining' | 'connected';

export interface RosterEntry {
  slot: number;
  /** 'you' for this machine's own player. */
  state: 'you' | SeatState;
}

/** The status as the menu words it. The joiner never sees the host's wording and vice versa. */
export function statusLabel(mode: Mode, status: LinkStatus): string {
  if (mode === 'off' && status !== 'connected') return 'Solo';
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'gathering':
      return mode === 'join' ? 'Connecting' : 'Gathering Candidates';
    case 'awaiting':
      return mode === 'join' ? 'Connecting' : 'Awaiting Client';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'failed':
      return 'Failed';
    case 'disconnected':
      return 'Disconnected';
  }
}

const HELLO_RETRY_MS = 1000; // the channel is unreliable, so the version handshake repeats until answered
const INPUT_STALE_MS = 500; // a guest that stops sending counts as standing still

export interface PeerInput {
  keys: number;
  act: number;
  mag: number;
  /** The pack action the friend is waiting on (see InputMsg.inv), if any. */
  inv?: InputMsg['inv'];
  /** False when nothing arrived recently: ignore `keys` (the counters stay valid). */
  fresh: boolean;
}

/** The parts of the relay client the session uses (a stand-in can replace it in tests). */
export type Relay = Pick<
  RelayClient,
  'createRoom' | 'join' | 'sendAnswer' | 'waitForAnswers' | 'reopenSeat' | 'closeRoom' | 'cancel'
>;

interface Seat {
  slot: number;
  link: Link;
  phase: SeatState;
  /** The relay holds this seat's offer, so a friend can really take it (a seat being refilled isn't offered yet). */
  ready: boolean;
}

/** One go at hosting or joining. Aborting it cancels every request it has in flight. */
interface Attempt {
  abort: AbortController;
}

export class Session {
  mode: Mode = 'off';
  /** Why the last attempt failed or the last connection ended (or what was wrong with a typed code). */
  detail = '';
  /** The host's game code, from when the relay issues it until the host starts the game or it runs out. */
  code: string | null = null;
  /** Host: the code is still joinable, so more friends can come. */
  lobbyOpen = false;
  /** A game code found in the page URL (#join=...) at load. The menu opens on Join with it filled in. */
  readonly urlCode: string | null;

  private phase: LinkStatus = 'idle';
  private slotNo = 0;
  private seats = new Map<number, Seat>(); // host: one per friend who can join
  private guestLink: Link | null = null; // guest: the connection to the host
  private room: Room | null = null;
  private attempt: Attempt | null = null;
  private everConnected = false; // host: a friend has played, so "everyone left" means the game is over
  private listeners = new Set<() => void>();
  private handshakes = new Map<Link, ReturnType<typeof setInterval>>(); // hello resend timers
  private inputs = new Map<number, { msg: InputMsg; at: number }>();
  private newestInput = new Map<number, number>();
  private snapshot: SnapMsg | null = null;
  private newestSnapshot = -1;

  constructor(
    hash = window.location.hash,
    private relay: Relay | null = RELAY_URL ? new RelayClient(RELAY_URL) : null,
    private makeLink: LinkFactory = (role, handlers) => new PeerLink(role, handlers),
  ) {
    this.urlCode = codeFromHash(hash);
    if (this.urlCode) {
      this.mode = 'join';
      // The code is good for one game only; don't leave it in the address bar to be reloaded or shared on.
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // history can be locked down (sandboxed frames); the stale hash is harmless
      }
    }
  }

  /** False when no relay is configured (src/net/relayConfig.ts): games can't be set up, only solo play. */
  get available(): boolean {
    return this.relay !== null;
  }

  /** Where setting up or running the game stands. A host with any friend connected is 'connected'. */
  get status(): LinkStatus {
    if (this.mode === 'host' && this.connectedSlots().length > 0) return 'connected';
    return this.phase;
  }

  /** The game loop's view: only a connected friend changes how the game runs. */
  get role(): Role {
    if (this.mode === 'host') return this.connectedSlots().length > 0 ? 'host' : 'solo';
    if (this.mode === 'join' && this.phase === 'connected' && this.guestLink) return 'client';
    return 'solo';
  }

  /** This machine's player number: 0 for the host (and solo), 1 to MAX_GUESTS for a friend. */
  get slot(): number {
    return this.mode === 'join' ? this.slotNo : 0;
  }

  /** Host: the player numbers of the friends connected right now, in order. */
  connectedSlots(): number[] {
    return [...this.seats.values()]
      .filter((seat) => seat.phase === 'connected')
      .map((seat) => seat.slot)
      .sort((a, b) => a - b);
  }

  /** Who is at the table, for the menu. Empty until a game exists. */
  roster(): RosterEntry[] {
    if (this.mode === 'host') {
      if (!this.room && this.seats.size === 0) return [];
      const entries: RosterEntry[] = [{ slot: 0, state: 'you' }];
      for (let slot = 1; slot <= MAX_GUESTS; slot++) {
        const seat = this.seats.get(slot);
        if (seat && (seat.phase !== 'waiting' || (this.lobbyOpen && seat.ready)))
          entries.push({ slot, state: seat.phase });
      }
      return entries;
    }
    if (this.mode === 'join' && this.slotNo > 0) {
      return [
        { slot: 0, state: this.phase === 'connected' ? 'connected' : 'joining' },
        { slot: this.slotNo, state: 'you' },
      ];
    }
    return [];
  }

  /** Re-render when the mode, status, roster or detail changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pick Solo / Host / Join. Abandons an unfinished attempt; ignored while connected. */
  setMode(mode: Mode) {
    if (this.status === 'connected' || mode === this.mode) return;
    this.reset();
    this.mode = mode;
    this.notify();
  }

  // --- Connection steps, called from the settings menu ---

  // These never throw: a problem is reported through `detail` / `status`, so the menu just re-renders.

  /** Host: set up a game with seats for MAX_GUESTS friends. Resolves to its game code, or null if it could not be made. */
  async createGame(): Promise<string | null> {
    const relay = this.begin('host');
    if (!relay) return null;
    const attempt = this.startAttempt();
    this.phase = 'gathering';
    this.notify(); // a new attempt starts from a clean status
    try {
      // An offer fits exactly one connection, so every seat gets its own, gathered side by side.
      const opened = Array.from({ length: MAX_GUESTS }, (_, i) => this.openSeat(i + 1, attempt));
      const offers = await Promise.all(opened.map((o) => o.offer));
      if (!this.isCurrent(attempt)) return null;
      const room = await relay.createRoom(offers, attempt.abort.signal);
      if (!this.isCurrent(attempt)) {
        relay.cancel(room); // abandoned while the relay was answering
        return null;
      }
      this.room = room;
      this.code = room.code;
      this.lobbyOpen = true;
      for (const seat of this.seats.values()) seat.ready = true; // the relay now holds every seat's offer
      this.phase = 'awaiting';
      this.notify();
      void this.collectAnswers(attempt, relay, room);
      return room.code;
    } catch (err) {
      this.failAttempt(attempt, err);
      return null;
    }
  }

  /** Host: the code stops working and the game begins with whoever is connected. */
  startGame() {
    if (this.lobbyOpen) this.closeLobby();
  }

  /** Friend: join the game with this code (however it was typed). */
  async joinGame(typed: string): Promise<void> {
    const relay = this.begin('join');
    if (!relay) return;
    const code = normalizeCode(typed);
    if (!code) {
      this.detail = 'That doesn’t look like a game code. It’s two words, like “mighty-apples”.';
      this.notify();
      return;
    }
    const attempt = this.startAttempt();
    this.phase = 'gathering';
    this.notify();
    try {
      const invitation = await relay.join(code, attempt.abort.signal); // a wrong code fails here, before any connection work
      if (!this.isCurrent(attempt)) return;
      this.slotNo = invitation.slot;
      const link: Link = this.makeLink('join', {
        status: (status, detail) => this.onGuestStatus(attempt, link, status, detail),
        message: (data) => this.onMessage(link, 0, data),
      });
      this.guestLink = link;
      const answer = await link.acceptOffer(invitation.offer);
      await relay.sendAnswer(code, invitation.guestToken, answer, attempt.abort.signal);
      if (this.isCurrent(attempt)) link.answerDelivered();
    } catch (err) {
      // A code that isn't open is the player's to retype, so it isn't a failure of the connection.
      this.failAttempt(attempt, err, err instanceof RelayError && err.kind === 'not_found' ? 'idle' : 'failed');
    }
  }

  /** Drop the connection or abandon the attempt, and go back to a clean slate. A host's disconnect ends the game for everyone. */
  disconnect() {
    const wasConnected = this.status === 'connected';
    this.reset();
    if (wasConnected) {
      this.phase = 'disconnected';
      this.detail = 'You disconnected.';
    }
    this.notify();
  }

  // --- Game traffic ---

  /** Friend: send a game message to the host; false if it was dropped (not connected, or the connection is backed up). */
  send(message: Message): boolean {
    return this.guestLink?.send(encodeMessage(message)) ?? false;
  }

  /** Host: send a game message to the friend in this seat; false if it was dropped. */
  sendTo(slot: number, message: Message): boolean {
    const seat = this.seats.get(slot);
    return seat?.phase === 'connected' ? seat.link.send(encodeMessage(message)) : false;
  }

  /** Host: this friend's latest controls, or null before the first packet. */
  peerInput(slot: number, now = performance.now()): PeerInput | null {
    const last = this.inputs.get(slot);
    if (!last) return null;
    const { keys, act, mag, inv } = last.msg;
    return { keys, act, mag, ...(inv ? { inv } : {}), fresh: now - last.at < INPUT_STALE_MS };
  }

  /** Friend: the newest snapshot not yet taken, or null. */
  takeSnapshot(): SnapMsg | null {
    const snap = this.snapshot;
    this.snapshot = null;
    return snap;
  }

  // --- Hosting ---

  private openSeat(slot: number, attempt: Attempt): { seat: Seat; offer: Promise<string> } {
    const link: Link = this.makeLink('host', {
      status: (status, detail) => this.onSeatStatus(attempt, link, slot, status, detail),
      message: (data) => this.onMessage(link, slot, data),
    });
    const seat: Seat = { slot, link, phase: 'waiting', ready: false };
    this.seats.set(slot, seat);
    return { seat, offer: link.createOffer() };
  }

  /** The friend at this seat left or never connected: give the seat a fresh offer so someone else can take it. */
  private async refillSeat(attempt: Attempt, slot: number) {
    const room = this.room;
    if (!this.relay || !room) return;
    const { seat, offer } = this.openSeat(slot, attempt);
    try {
      const fresh = await offer;
      if (!this.isCurrent(attempt) || !this.lobbyOpen || this.seats.get(slot) !== seat) throw new LinkClosed();
      await this.relay.reopenSeat(room, slot, fresh, attempt.abort.signal);
      seat.ready = true;
      this.notify();
    } catch {
      // The game filled up, started, or ran out in the meantime: this seat just isn't offered again.
      if (this.seats.get(slot) === seat) this.seats.delete(slot);
      seat.link.close();
      if (this.isCurrent(attempt)) this.notify();
    }
  }

  /** Wait on the relay for friends' answers and apply each to its seat, until the relay forgets the game. */
  private async collectAnswers(attempt: Attempt, relay: Relay, room: Room) {
    let after = 0;
    try {
      for (;;) {
        const got = await relay.waitForAnswers(room, after, attempt.abort.signal);
        after = got.next;
        for (const { slot, answer } of got.answers) this.applyAnswer(attempt, slot, answer);
      }
    } catch (err) {
      if (!this.isCurrent(attempt)) return; // the host moved on, or the game ended
      this.endLobby(attempt, err);
    }
  }

  private applyAnswer(attempt: Attempt, slot: number, answer: string) {
    const seat = this.seats.get(slot);
    if (!this.isCurrent(attempt) || !seat || seat.phase !== 'waiting') return; // stale: a seat that was since refilled
    seat.phase = 'joining';
    this.notify();
    seat.link.acceptAnswer(answer).catch(() => {
      // A damaged answer doesn't end the link by itself; closing it reopens the seat.
      if (this.seats.get(slot) === seat && seat.phase === 'joining') seat.link.close();
    });
  }

  private onSeatStatus(attempt: Attempt, link: Link, slot: number, status: LinkStatus, _detail: string) {
    const seat = this.seats.get(slot);
    if (!this.isCurrent(attempt) || !seat || seat.link !== link) return;
    if (status === 'connected') {
      seat.phase = 'connected';
      this.everConnected = true;
      this.inputs.delete(slot);
      this.newestInput.delete(slot);
      this.beginHandshake(link);
      if (this.lobbyOpen && this.connectedSlots().length >= MAX_GUESTS) this.closeLobby(); // full: nobody else can come
    } else if (status === 'failed' || status === 'disconnected' || status === 'idle') {
      this.seats.delete(slot);
      this.endHandshake(link);
      this.inputs.delete(slot);
      this.newestInput.delete(slot);
      link.close();
      if (this.lobbyOpen && this.room) {
        void this.refillSeat(attempt, slot);
      } else if (this.everConnected && !this.lobbyOpen && this.connectedSlots().length === 0) {
        this.finishGame('Everyone left the game.');
        return;
      }
    }
    this.notify();
  }

  private closeLobby() {
    this.lobbyOpen = false;
    this.code = null;
    if (this.room) this.relay?.closeRoom(this.room);
    this.notify();
  }

  /** The relay has forgotten this game (its code ran out, or it started and the relay tidied up). */
  private endLobby(attempt: Attempt, err: unknown) {
    this.lobbyOpen = false;
    this.code = null;
    this.room = null;
    for (const seat of [...this.seats.values()]) {
      if (seat.phase !== 'connected') {
        this.seats.delete(seat.slot);
        this.endHandshake(seat.link);
        seat.link.close();
      }
    }
    if (this.connectedSlots().length === 0) this.failAttempt(attempt, err);
    else this.notify(); // games already running carry on
  }

  private finishGame(detail: string) {
    this.reset();
    this.phase = 'disconnected';
    this.detail = detail;
    this.notify();
  }

  // --- Joining ---

  private onGuestStatus(attempt: Attempt, link: Link, status: LinkStatus, detail: string) {
    if (!this.isCurrent(attempt) || this.guestLink !== link) return;
    this.phase = status;
    this.detail = detail;
    if (status === 'connected') {
      this.beginHandshake(link);
    } else {
      this.endHandshake(link);
      this.snapshot = null;
    }
    if (status === 'disconnected' || status === 'failed' || status === 'idle') this.guestLink = null;
    this.notify();
  }

  // --- Messages ---

  /** `slot` is the seat a host's link belongs to (0 for a friend's link to the host). */
  private onMessage(link: Link, slot: number, data: string) {
    const message = parseMessage(data);
    if (!message) return;
    switch (message.k) {
      case 'hello':
        this.endHandshake(link); // heard from them: no need to keep repeating ours
        if (message.v !== PROTOCOL_VERSION || message.build !== __BUILD_ID__) {
          link.close(
            'The other player is running a different version of the game. Both of you should reload the page.',
          );
        }
        break;
      case 'in':
        // Unordered delivery: a late old packet must not overwrite a newer one.
        if (
          this.mode === 'host' &&
          this.seats.get(slot)?.link === link &&
          this.seats.get(slot)?.phase === 'connected' &&
          message.n > (this.newestInput.get(slot) ?? -1)
        ) {
          this.newestInput.set(slot, message.n);
          this.inputs.set(slot, { msg: message, at: performance.now() });
        }
        break;
      case 'snap':
        if (this.guestLink === link && message.n > this.newestSnapshot) {
          this.newestSnapshot = message.n;
          this.snapshot = message;
        }
        break;
    }
  }

  /** Version check: both sides send hello until they hear the other's (the first one can be lost). */
  private beginHandshake(link: Link) {
    this.endHandshake(link);
    const hello = encodeMessage({ k: 'hello', v: PROTOCOL_VERSION, build: __BUILD_ID__ });
    link.send(hello);
    this.handshakes.set(
      link,
      setInterval(() => link.send(hello), HELLO_RETRY_MS),
    );
    if (link === this.guestLink) this.newestSnapshot = -1;
  }

  private endHandshake(link: Link) {
    const timer = this.handshakes.get(link);
    if (timer) clearInterval(timer);
    this.handshakes.delete(link);
  }

  // --- Lifecycle ---

  /**
   * Start over for a new attempt as `mode`. Returns the relay to use, or null (after saying why) when there is none.
   */
  private begin(mode: 'host' | 'join'): Relay | null {
    this.reset();
    this.mode = mode;
    if (!this.relay) {
      this.detail = 'Online play isn’t set up for this copy of the game yet.';
      this.notify();
    }
    return this.relay;
  }

  private startAttempt(): Attempt {
    const attempt: Attempt = { abort: new AbortController() };
    this.attempt = attempt;
    return attempt;
  }

  private isCurrent(attempt: Attempt): boolean {
    return this.attempt === attempt;
  }

  /**
   * An attempt couldn't finish: tear it down and show why. A step cancelled because the player moved on (changed
   * mode, disconnected) isn't worth reporting.
   */
  private failAttempt(attempt: Attempt, err: unknown, status: 'idle' | 'failed' = 'failed') {
    if (err instanceof LinkClosed || !this.isCurrent(attempt)) return;
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    this.reset();
    this.phase = status;
    this.detail = message;
    this.notify();
  }

  /** Forget any connection attempt and every connection. */
  private reset() {
    this.attempt?.abort.abort();
    this.attempt = null;
    for (const timer of this.handshakes.values()) clearInterval(timer);
    this.handshakes.clear();
    const links = [...this.seats.values()].map((seat) => seat.link);
    if (this.guestLink) links.push(this.guestLink);
    // Forget them first, so the links' own 'closed' callbacks are ignored.
    this.seats.clear();
    this.guestLink = null;
    if (this.room) this.relay?.cancel(this.room); // an unclaimed game code is released at once
    this.room = null;
    this.code = null;
    this.lobbyOpen = false;
    this.everConnected = false;
    for (const link of links) link.close();
    this.phase = 'idle';
    this.detail = '';
    this.slotNo = 0;
    this.inputs.clear();
    this.newestInput.clear();
    this.snapshot = null;
    this.newestSnapshot = -1;
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
