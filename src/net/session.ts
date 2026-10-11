import { LinkClosed, PeerLink, type LinkRole, type LinkStatus } from './PeerLink';
import { encodeMessage, parseMessage, PROTOCOL_VERSION, type InputMsg, type Message, type SnapMsg } from './protocol';
import { RelayClient, RelayError, type Room } from './relayClient';
import { RELAY_URL } from './relayConfig';
import { codeFromHash, normalizeCode } from './roomCode';

// Multiplayer state shared by the settings menu (which drives the connection) and the game loop (which reads it).
// Setting up a game goes through the matchmaking relay: the host's offer is stored under a short game code, the
// friend types the code, and the two swap their connection details through it. Then the phones talk directly.
// The game polls `role` every frame: 'solo' unless a peer is connected, then 'host' (runs the simulation) or
// 'client' (renders the host's snapshots). Incoming messages are parked here and read at the next tick, so game
// code never runs inside a network callback.

/** What the player picked in the menu. */
export type Mode = 'off' | 'host' | 'join';
/** How the game loop should behave right now. */
export type Role = 'solo' | 'host' | 'client';

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
  /** False when nothing arrived recently: ignore `keys` (the counters stay valid). */
  fresh: boolean;
}

export class Session {
  mode: Mode = 'off';
  status: LinkStatus = 'idle';
  /** Why the last attempt failed or the last connection ended (or what was wrong with a typed code). */
  detail = '';
  /** The host's game code, once the relay has issued it and until a friend has joined. */
  code: string | null = null;
  /** A game code found in the page URL (#join=...) at load. The menu opens on Join with it filled in. */
  readonly urlCode: string | null;

  private link: PeerLink | null = null;
  private room: Room | null = null;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private peerHello = false;
  private lastInput: { msg: InputMsg; at: number } | null = null;
  private snapshot: SnapMsg | null = null;
  private newestInput = -1;
  private newestSnapshot = -1;

  constructor(
    hash = window.location.hash,
    private relay: RelayClient | null = RELAY_URL ? new RelayClient(RELAY_URL) : null,
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

  /** The game loop's view: only a connected link changes how the game runs. */
  get role(): Role {
    if (this.status !== 'connected' || !this.link) return 'solo';
    return this.link.role === 'host' ? 'host' : 'client';
  }

  /** Re-render when the mode, status or detail changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pick Solo / Host / Join. Abandons an unfinished connection attempt; ignored while connected. */
  setMode(mode: Mode) {
    if (this.status === 'connected' || mode === this.mode) return;
    this.reset();
    this.mode = mode;
    this.notify();
  }

  // --- Connection steps, called from the settings menu ---

  // These never throw: a problem is reported through `detail` / `status`, so the menu just re-renders.

  /** Host: set up a game. Resolves to its game code, or null if it could not be made. */
  async createGame(): Promise<string | null> {
    const relay = this.begin('host');
    if (!relay) return null;
    const link = this.newLink('host');
    const abort = (this.abort = new AbortController());
    this.notify(); // a new attempt starts from a clean status
    try {
      const offer = await link.createOffer();
      const room = await relay.createRoom(offer, abort.signal);
      if (this.link !== link) {
        relay.cancel(room); // abandoned while the relay was answering
        return null;
      }
      this.room = room;
      this.code = room.code;
      this.notify();
      void this.collectAnswer(link, relay, room, abort.signal);
      return room.code;
    } catch (err) {
      this.fail(err, link);
      return null;
    }
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
    const link = this.newLink('join');
    const abort = (this.abort = new AbortController());
    this.notify();
    try {
      const invitation = await relay.join(code, abort.signal); // a wrong code fails here, before any connection work
      if (this.link !== link) return;
      const answer = await link.acceptOffer(invitation.offer);
      await relay.sendAnswer(code, invitation.guestToken, answer, abort.signal);
      link.answerDelivered();
    } catch (err) {
      // A code that isn't open is the player's to retype, so it isn't a failure of the connection.
      this.fail(err, link, err instanceof RelayError && err.kind === 'not_found' ? 'idle' : 'failed');
    }
  }

  /** Drop the connection or abandon the attempt, and go back to a clean slate. */
  disconnect() {
    if (this.link) this.link.close();
    else this.reset();
    this.notify();
  }

  // --- Game traffic ---

  /** Send a game message; false if it was dropped (not connected, or the connection is backed up). */
  send(message: Message): boolean {
    return this.link?.send(encodeMessage(message)) ?? false;
  }

  /** Host: the guest's latest controls, or null before the first packet. */
  peerInput(now = performance.now()): PeerInput | null {
    const last = this.lastInput;
    if (!last) return null;
    return { keys: last.msg.keys, act: last.msg.act, mag: last.msg.mag, fresh: now - last.at < INPUT_STALE_MS };
  }

  /** Client: the newest snapshot not yet taken, or null. */
  takeSnapshot(): SnapMsg | null {
    const snap = this.snapshot;
    this.snapshot = null;
    return snap;
  }

  // --- Internals ---

  /**
   * Start over for a new attempt as `mode`. Returns the relay to use, or null (after saying why) when there is none.
   */
  private begin(mode: 'host' | 'join'): RelayClient | null {
    this.reset();
    this.mode = mode;
    if (!this.relay) {
      this.detail = 'Online play isn’t set up for this copy of the game yet.';
      this.notify();
    }
    return this.relay;
  }

  private newLink(role: LinkRole): PeerLink {
    const link = new PeerLink(role, {
      status: (status, detail) => this.onStatus(link, status, detail),
      message: (data) => this.onMessage(link, data),
    });
    this.link = link;
    this.status = 'idle';
    return link;
  }

  /** Host: wait (on the relay) for the friend's answer, then finish the connection with it. */
  private async collectAnswer(link: PeerLink, relay: RelayClient, room: Room, signal: AbortSignal) {
    try {
      const answer = await relay.waitForAnswer(room, signal);
      this.room = null; // the room is spent once the answer has been collected
      this.code = null;
      await link.acceptAnswer(answer);
    } catch (err) {
      this.fail(err, link);
    }
  }

  /**
   * An attempt couldn't finish: tear it down and show why. A link that failed on its own already reported itself
   * through its status (and detached), so only a problem outside it lands here, such as the relay being
   * unreachable. A step cancelled because the player moved on (changed mode, disconnected) isn't worth reporting.
   */
  private fail(err: unknown, link: PeerLink | null, status: 'idle' | 'failed' = 'failed') {
    if (err instanceof LinkClosed || !link || this.link !== link) return;
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    this.reset();
    this.status = status;
    this.detail = message;
    this.notify();
  }

  private onStatus(link: PeerLink, status: LinkStatus, detail: string) {
    if (this.link !== link) return;
    this.status = status;
    this.detail = detail;
    if (status === 'connected') {
      this.beginHandshake(link);
    } else {
      this.stopHandshake();
      this.lastInput = this.snapshot = null;
    }
    if (status === 'disconnected' || status === 'failed' || status === 'idle') this.link = null;
    this.notify();
  }

  private onMessage(link: PeerLink, data: string) {
    if (this.link !== link) return;
    const message = parseMessage(data);
    if (!message) return;
    switch (message.k) {
      case 'hello':
        this.peerHello = true;
        this.stopHandshake();
        if (message.v !== PROTOCOL_VERSION || message.build !== __BUILD_ID__) {
          link.close(
            'The other player is running a different version of the game. Both of you should reload the page.',
          );
        }
        break;
      case 'in':
        // Unordered delivery: a late old packet must not overwrite a newer one.
        if (link.role === 'host' && message.n > this.newestInput) {
          this.newestInput = message.n;
          this.lastInput = { msg: message, at: performance.now() };
        }
        break;
      case 'snap':
        if (link.role === 'join' && message.n > this.newestSnapshot) {
          this.newestSnapshot = message.n;
          this.snapshot = message;
        }
        break;
    }
  }

  /** Version check: both sides send hello until they hear the other's (the first one can be lost). */
  private beginHandshake(link: PeerLink) {
    this.peerHello = false;
    this.newestInput = this.newestSnapshot = -1;
    this.lastInput = this.snapshot = null;
    const hello = encodeMessage({ k: 'hello', v: PROTOCOL_VERSION, build: __BUILD_ID__ });
    link.send(hello);
    this.helloTimer = setInterval(() => {
      if (this.peerHello) this.stopHandshake();
      else link.send(hello);
    }, HELLO_RETRY_MS);
  }

  private stopHandshake() {
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
  }

  /** Forget any connection attempt. */
  private reset() {
    this.stopHandshake();
    const link = this.link;
    this.link = null; // first, so the link's own 'closed' callback is ignored
    this.abort?.abort();
    this.abort = null;
    if (this.room) this.relay?.cancel(this.room); // an unclaimed game code is released at once
    this.room = null;
    this.code = null;
    link?.close();
    this.status = 'idle';
    this.detail = '';
    this.lastInput = this.snapshot = null;
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
