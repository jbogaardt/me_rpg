import { LinkClosed, ManualWebRTC, type LinkStatus } from './ManualWebRTC';
import { encodeMessage, parseMessage, PROTOCOL_VERSION, type InputMsg, type Message, type SnapMsg } from './protocol';
import { offerFromHash } from './signal';

// Multiplayer state shared by the settings menu (which drives the connection) and the game loop (which reads it).
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
      return mode === 'join' ? 'Ready to Share Answer' : 'Awaiting Client';
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
  /** Why the last attempt failed or the last connection ended (or what was wrong with a pasted code). */
  detail = '';
  /** An offer code found in the page URL (#offer=...) at load. The menu opens on Join with it filled in. */
  readonly urlOffer: string | null;

  private link: ManualWebRTC | null = null;
  private listeners = new Set<() => void>();
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private peerHello = false;
  private lastInput: { msg: InputMsg; at: number } | null = null;
  private snapshot: SnapMsg | null = null;
  private newestInput = -1;
  private newestSnapshot = -1;

  constructor(hash = window.location.hash) {
    this.urlOffer = offerFromHash(hash);
    if (this.urlOffer) {
      this.mode = 'join';
      // The offer is good for one connection only; don't leave it in the address bar to be reloaded or shared on.
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // history can be locked down (sandboxed frames); the stale hash is harmless
      }
    }
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

  /** Host step 1. Resolves to the offer code, or null if it could not be made. */
  createHostCode(): Promise<string | null> {
    return this.start('host', (link) => link.createOffer());
  }

  /** Host step 2: the joiner's answer code, pasted back. */
  async acceptAnswer(code: string): Promise<void> {
    const link = this.link;
    try {
      await link?.acceptAnswer(code);
    } catch (err) {
      this.fail(err, link);
    }
  }

  /** Joiner: the host's offer code (or join link). Resolves to the answer code to send back, or null. */
  createAnswer(offerCode: string): Promise<string | null> {
    return this.start('join', (link) => link.acceptOffer(offerCode));
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

  private async start(mode: 'host' | 'join', step: (link: ManualWebRTC) => Promise<string>): Promise<string | null> {
    this.reset();
    this.mode = mode;
    const link = new ManualWebRTC(mode, {
      status: (status, detail) => this.onStatus(link, status, detail),
      message: (data) => this.onMessage(link, data),
    });
    this.link = link;
    this.status = 'idle';
    this.notify(); // a new attempt starts from a clean status
    try {
      return await step(link);
    } catch (err) {
      this.fail(err, link);
      return null;
    }
  }

  /**
   * Show why a step failed. Setup failures that ended the link already reported themselves through its status
   * (and detached it); this covers the rest, e.g. a code that was pasted wrongly. A step cancelled because the
   * player moved on (changed mode, disconnected) isn't worth reporting.
   */
  private fail(err: unknown, link: ManualWebRTC | null) {
    if (err instanceof LinkClosed || !link || this.link !== link) return;
    this.detail = err instanceof Error ? err.message : 'Something went wrong.';
    this.notify();
  }

  private onStatus(link: ManualWebRTC, status: LinkStatus, detail: string) {
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

  private onMessage(link: ManualWebRTC, data: string) {
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
  private beginHandshake(link: ManualWebRTC) {
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
    link?.close();
    this.status = 'idle';
    this.detail = '';
    this.lastInput = this.snapshot = null;
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
