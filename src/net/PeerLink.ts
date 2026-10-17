import { decodeSignal, encodeSignal, type SignalType } from './signal';

// One peer-to-peer link over a native RTCPeerConnection + RTCDataChannel. The two sides never share a server for
// gameplay: they swap one offer and one answer (through the matchmaking relay, see session.ts and relayClient.ts)
// and the data channel then opens directly between the phones. The host makes an offer, the joiner turns it into an
// answer, the host applies that, and the channel opens. Each is a complete session description (all ICE candidates
// gathered before it is encoded) in the compact text format of signal.ts, so one exchange in each direction is enough.
//
// A link is single-use: after it ends ('failed' or 'disconnected') make a new one.

/** Public STUN only, to learn each side's public address. There is no gameplay relay (TURN), so two players behind strict/symmetric NATs can't connect. */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Fast, UDP-like game traffic: no retransmits, no ordering. The protocol (protocol.ts) is built for that. */
export const CHANNEL_OPTIONS: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };

const CHANNEL_LABEL = 'game';
const GATHER_TIMEOUT_MS = 10_000; // an unreachable STUN server shouldn't leave the player waiting forever
const CONNECT_TIMEOUT_MS = 30_000; // from "answer applied" to "channel open"
const KEEPALIVE_MS = 1_000;
const SILENCE_MS = 10_000; // nothing received for this long = the peer is gone
const KEEPALIVE = '~'; // swallowed here; it only exists so a quiet-but-alive peer isn't mistaken for a dead one
const MAX_BUFFERED = 256 * 1024; // don't queue more than this behind a stalled connection

export type LinkRole = 'host' | 'join';

/**
 * idle: nothing started. gathering: collecting ICE candidates. awaiting: offer/answer ready, waiting for the other
 * side. connecting: both descriptions are exchanged and ICE is running. connected: channel open. failed: never
 * connected. disconnected: was connected, now over.
 */
export type LinkStatus = 'idle' | 'gathering' | 'awaiting' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface LinkHandlers {
  status?(status: LinkStatus, detail: string): void;
  message?(data: string): void;
}

/** What the session needs from a link, so tests can stand in a fake for the real WebRTC one. */
export interface Link {
  readonly role: LinkRole;
  readonly status: LinkStatus;
  createOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  acceptOffer(offer: string): Promise<string>;
  answerDelivered(): void;
  send(data: string): boolean;
  close(detail?: string): void;
}

export type LinkFactory = (role: LinkRole, handlers: LinkHandlers) => Link;

/** Thrown when the link was closed while an async step was still running. Not an error to show the player. */
export class LinkClosed extends Error {
  constructor() {
    super('Connection cancelled.');
  }
}

/** Resolves once ICE gathering is complete (or after `timeoutMs`, with whatever has been found so far). */
function gatheringComplete(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => pc.iceGatheringState === 'complete' && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

export class PeerLink implements Link {
  private _status: LinkStatus = 'idle';
  private _detail = '';
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReceived = 0;
  private lastTick = 0;

  constructor(
    readonly role: LinkRole,
    private handlers: LinkHandlers = {},
  ) {}

  get status(): LinkStatus {
    return this._status;
  }

  /** Why the link failed or ended, in words for the player. Empty otherwise. */
  get detail(): string {
    return this._detail;
  }

  // --- Host: offer, then answer ---

  /** Host step 1: create the data channel and an offer; resolves to the offer once all candidates are in. */
  async createOffer(): Promise<string> {
    const pc = this.begin();
    this.attach(pc.createDataChannel(CHANNEL_LABEL, CHANNEL_OPTIONS));
    return this.guard(pc, async () => {
      await pc.setLocalDescription(await pc.createOffer());
      const code = await this.finishGathering(pc, 'offer');
      this.setStatus('awaiting');
      return code;
    });
  }

  /** Host step 2: apply the joiner's answer; the channel opens a moment later. */
  async acceptAnswer(answer: string): Promise<void> {
    const pc = this.pc;
    if (!pc || this.role !== 'host' || this._status !== 'awaiting') {
      throw new Error('Create a game first.');
    }
    const signal = await decodeSignal(answer, 'answer');
    await this.guard(pc, async () => {
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      this.setStatus('connecting');
      this.startConnectTimer();
    });
  }

  // --- Joiner: answer ---

  /** Joiner: apply the host's offer; resolves to the answer to send back. */
  async acceptOffer(offer: string): Promise<string> {
    const signal = await decodeSignal(offer, 'offer'); // bad input throws before anything starts
    const pc = this.begin();
    pc.ondatachannel = (e) => this.attach(e.channel);
    return this.guard(pc, async () => {
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      const answer = await this.finishGathering(pc, 'answer');
      this.setStatus('awaiting');
      return answer;
    });
  }

  /** Joiner: the answer reached the host through the relay. From here the connection is on its way (or times out). */
  answerDelivered() {
    if (this.role !== 'join' || this._status !== 'awaiting') return;
    this.setStatus('connecting');
    this.startConnectTimer();
  }

  // --- Traffic ---

  /** Send a message. False when it was dropped (channel not open, or the connection is badly backed up). */
  send(data: string): boolean {
    const ch = this.channel;
    if (!ch || ch.readyState !== 'open' || ch.bufferedAmount > MAX_BUFFERED) return false;
    try {
      ch.send(data);
      return true;
    } catch {
      return false;
    }
  }

  /** End the link. If it had connected it becomes 'disconnected' (with `detail` as the reason), else it just resets. */
  close(detail = 'You disconnected.') {
    if (this._status === 'connected') this.end('disconnected', detail);
    else this.end('idle', '');
  }

  // --- Internals ---

  /** Start a fresh RTCPeerConnection for this link. */
  private begin(): RTCPeerConnection {
    if (this.pc || this._status !== 'idle') throw new Error('This connection was already started.');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    this.setStatus('gathering');

    // ICE can start probing before the answer has been applied (the joiner already knows the host's candidates) and
    // can time out while the host is still waiting for a friend, so it only counts once both sides have exchanged
    // descriptions ('connecting') or the channel is up.
    const lost = () => {
      if (this.pc !== pc || (this._status !== 'connecting' && this._status !== 'connected')) return;
      this.end(
        this._status === 'connected' ? 'disconnected' : 'failed',
        'The connection to the other player was lost.',
      );
    };
    pc.oniceconnectionstatechange = () => pc.iceConnectionState === 'failed' && lost();
    pc.onconnectionstatechange = () => pc.connectionState === 'failed' && lost();
    return pc;
  }

  /** Run an async step; any failure ends the link, and a link closed in the meantime cancels the step. */
  private async guard<T>(pc: RTCPeerConnection, step: () => Promise<T>): Promise<T> {
    try {
      const result = await step();
      if (this.pc !== pc) throw new LinkClosed();
      return result;
    } catch (err) {
      if (this.pc !== pc) throw new LinkClosed();
      this.end('failed', err instanceof Error ? err.message : 'Could not set up the connection.');
      throw err;
    }
  }

  private async finishGathering(pc: RTCPeerConnection, type: SignalType): Promise<string> {
    await gatheringComplete(pc, GATHER_TIMEOUT_MS);
    if (this.pc !== pc) throw new LinkClosed();
    const description = pc.localDescription;
    if (!description?.sdp || description.type !== type)
      throw new Error('The browser did not produce a connection code.');
    return encodeSignal({ type, sdp: description.sdp });
  }

  private attach(channel: RTCDataChannel) {
    this.channel = channel;
    const opened = () => {
      if (this.channel !== channel || this._status === 'connected') return;
      this.clearConnectTimer();
      this.lastReceived = performance.now();
      this.keepalive = setInterval(() => this.tick(), KEEPALIVE_MS);
      this.setStatus('connected');
    };
    channel.onopen = opened;
    channel.onmessage = (e) => {
      this.lastReceived = performance.now();
      if (typeof e.data === 'string' && e.data !== KEEPALIVE) this.handlers.message?.(e.data);
    };
    channel.onclose = () => {
      if (this.channel === channel) {
        this.end(this._status === 'connected' ? 'disconnected' : 'failed', 'The other player disconnected.');
      }
    };
    if (channel.readyState === 'open') opened(); // a channel handed over by the peer may already be open
  }

  private tick() {
    const now = performance.now();
    // This page itself was frozen (a heavy task, a tab in the background): what the peer sent meanwhile is still queued to
    // be read, so the silence is ours, not theirs. Give it a fresh start rather than hang up on a friend.
    if (this.lastTick && now - this.lastTick > 2 * KEEPALIVE_MS) this.lastReceived = now;
    this.lastTick = now;
    if (now - this.lastReceived > SILENCE_MS) {
      this.end('disconnected', 'The other player stopped responding.');
    } else {
      this.send(KEEPALIVE);
    }
  }

  private startConnectTimer() {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (this._status === 'connecting') {
        this.end(
          'failed',
          'Could not connect. A firewall or strict network may be blocking the direct link between your phones.',
        );
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private clearConnectTimer() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  /** Tear everything down and move to a final status. Safe to call more than once. */
  private end(status: 'idle' | 'failed' | 'disconnected', detail: string) {
    const { pc, channel } = this;
    if (!pc && !channel) return;
    this.pc = null;
    this.channel = null;
    this.clearConnectTimer();
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    if (channel) {
      channel.onopen = channel.onmessage = channel.onclose = channel.onerror = null;
      channel.close();
    }
    if (pc) {
      pc.ondatachannel = pc.oniceconnectionstatechange = pc.onconnectionstatechange = null;
      pc.close();
    }
    this.setStatus(status, detail);
  }

  private setStatus(status: LinkStatus, detail = '') {
    this._status = status;
    this._detail = detail;
    this.handlers.status?.(status, detail);
  }
}
