import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Link, LinkHandlers, LinkRole, LinkStatus } from './PeerLink';
import { encodeMessage, PROTOCOL_VERSION, type Message, type SnapMsg } from './protocol';
import type { Answers } from './relayClient';
import { RelayError } from './relayClient';
import type { SeatAnswer } from './relayApi';
import { Session, statusLabel } from './session';

// The session's job is bookkeeping: which seat is in which state, when the code closes, who is told what. These
// tests run it against a scripted link and relay, so every step of a game's life can be driven by hand.

class FakeLink implements Link {
  status: LinkStatus = 'idle';
  sent: Message[] = [];
  closeCalls = 0;
  private ended = false;
  readonly createOffer = vi.fn(() => {
    this.set('gathering');
    this.set('awaiting');
    return Promise.resolve(`zOFFER${this.id}`);
  });
  readonly acceptAnswer = vi.fn((_answer: string) => {
    this.set('connecting');
    return Promise.resolve();
  });
  readonly acceptOffer = vi.fn((_offer: string) => {
    this.set('gathering');
    this.set('awaiting');
    return Promise.resolve(`zANSWER${this.id}`);
  });
  readonly answerDelivered = vi.fn(() => this.set('connecting'));

  constructor(
    readonly role: LinkRole,
    private handlers: LinkHandlers,
    readonly id: number,
  ) {}

  send(data: string): boolean {
    if (this.status !== 'connected') return false;
    this.sent.push(JSON.parse(data) as Message);
    return true;
  }

  /** Like the real link, closing an ended link does nothing. */
  close(detail = 'You disconnected.') {
    this.closeCalls++;
    if (this.ended) return;
    if (this.status === 'connected') this.set('disconnected', detail);
    else this.set('idle');
  }

  // --- test controls ---
  connect() {
    this.set('connected');
  }
  drop(detail = 'The other player disconnected.') {
    this.set('disconnected', detail);
  }
  breakDown(detail = 'The connection to the other player was lost.') {
    this.set('failed', detail);
  }
  receive(message: Message) {
    this.handlers.message?.(encodeMessage(message));
  }
  private set(status: LinkStatus, detail = '') {
    if (status === 'disconnected' || status === 'failed' || status === 'idle') this.ended = true;
    this.status = status;
    this.handlers.status?.(status, detail);
  }
}

class FakeRelay {
  room = { code: 'mighty-apples', hostToken: 'host-token' };
  created: string[][] = [];
  reopened: { slot: number; offer: string }[] = [];
  closed = 0;
  cancelled = 0;
  private answers: SeatAnswer[] = [];
  private waiters: { after: number; resolve: (a: Answers) => void; reject: (e: unknown) => void }[] = [];

  createRoom = vi.fn((offers: string[]) => {
    this.created.push(offers);
    return Promise.resolve(this.room);
  });
  reopenSeat = vi.fn((_room: unknown, slot: number, offer: string) => {
    this.reopened.push({ slot, offer });
    return Promise.resolve();
  });
  closeRoom = vi.fn(() => void this.closed++);
  cancel = vi.fn(() => void this.cancelled++);
  join = vi.fn();
  sendAnswer = vi.fn(() => Promise.resolve());
  waitForAnswers = vi.fn(
    (_room: unknown, after: number, signal: AbortSignal) =>
      new Promise<Answers>((resolve, reject) => {
        if (this.answers.length > after)
          return resolve({ answers: this.answers.slice(after), next: this.answers.length });
        signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
        this.waiters.push({ after, resolve, reject });
      }),
  );

  /** A friend answered the offer in this seat. */
  answer(slot: number, answer = `zFRIEND${slot}`) {
    this.answers.push({ slot, answer });
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ answers: this.answers.slice(waiter.after), next: this.answers.length });
    }
  }
  /** The relay forgot the game. */
  expire() {
    for (const waiter of this.waiters.splice(0)) waiter.reject(new RelayError('expired'));
  }
}

let links: FakeLink[];
let relay: FakeRelay;

function setup(hash = '', onLink: (link: FakeLink) => void = () => undefined) {
  links = [];
  relay = new FakeRelay();
  const factory = (role: LinkRole, handlers: LinkHandlers) => {
    const link = new FakeLink(role, handlers, links.length + 1);
    links.push(link);
    onLink(link);
    return link;
  };
  return new Session(hash, relay, factory);
}

const flush = () => vi.advanceTimersByTimeAsync(0);

/** Host a game and bring the seat's friend all the way to connected. */
async function befriend(slot: number) {
  relay.answer(slot);
  await flush();
  const link = links.find(
    (l) => l.acceptAnswer.mock.calls.length > 0 && l.status === 'connecting' && l.role === 'host',
  );
  expect(link).toBeDefined();
  link!.connect();
  return link!;
}

const input = (n: number, keys = 0, act = 0, mag = 0): Message => ({ k: 'in', n, keys, act, mag, ack: 0, vr: 300 });
const snap = (n: number): SnapMsg => ({
  k: 'snap',
  zone: 'overworld',
  away: [],
  n,
  players: [[0, 1, 2, 0, 0]],
  mobs: [],
  me: [1, 0, 30, 30, 20, 20, 5, 1, 8],
  chests: 0,
  w: [0, 0, 1],
  ground: [],
  events: [],
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('statusLabel', () => {
  it('words the host flow as Idle -> Gathering Candidates -> Awaiting Client -> Connected', () => {
    const labels = (['idle', 'gathering', 'awaiting', 'connected'] as LinkStatus[]).map((s) => statusLabel('host', s));
    expect(labels).toEqual(['Idle', 'Gathering Candidates', 'Awaiting Client', 'Connected']);
  });

  it('words the join flow as Connecting -> Connected', () => {
    const labels = (['gathering', 'awaiting', 'connecting', 'connected'] as LinkStatus[]).map((s) =>
      statusLabel('join', s),
    );
    expect(labels).toEqual(['Connecting', 'Connecting', 'Connecting', 'Connected']);
  });

  it('reports endings, and Solo when multiplayer is off', () => {
    expect(statusLabel('host', 'disconnected')).toBe('Disconnected');
    expect(statusLabel('join', 'failed')).toBe('Failed');
    expect(statusLabel('off', 'idle')).toBe('Solo');
  });
});

describe('a new session', () => {
  it('starts solo, with no peer data', () => {
    const session = setup();
    expect(session.mode).toBe('off');
    expect(session.status).toBe('idle');
    expect(session.role).toBe('solo');
    expect(session.slot).toBe(0);
    expect(session.urlCode).toBeNull();
    expect(session.code).toBeNull();
    expect(session.connectedSlots()).toEqual([]);
    expect(session.roster()).toEqual([]);
    expect(session.peerInput(1)).toBeNull();
    expect(session.takeSnapshot()).toBeNull();
    expect(session.send({ k: 'hello', v: 1, build: 'x' })).toBe(false); // nothing to send to
    expect(session.sendTo(1, { k: 'hello', v: 1, build: 'x' })).toBe(false);
  });

  it('opens on Join when the page URL carries a game code', () => {
    const session = setup('#join=Mighty-Apples');
    expect(session.urlCode).toBe('mighty-apples');
    expect(session.mode).toBe('join');
    expect(setup('#join=nonsense').mode).toBe('off');
    expect(setup('#offer=zABC').mode).toBe('off'); // the old paste-a-code links are gone
    expect(setup('#other').mode).toBe('off');
  });

  it('notifies listeners when the mode changes, and stops after unsubscribe', () => {
    const session = setup();
    const listener = vi.fn();
    const off = session.onChange(listener);
    session.setMode('host');
    session.setMode('host'); // no change, no notification
    session.setMode('join');
    expect(session.mode).toBe('join');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    session.setMode('off');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('is unavailable, and says so, when no relay is configured', async () => {
    const session = new Session('', null);
    expect(session.available).toBe(false);
    expect(await session.createGame()).toBeNull();
    expect(session.detail).toMatch(/isn’t set up/);
    await session.joinGame('mighty-apples');
    expect(session.detail).toMatch(/isn’t set up/);
    expect(session.role).toBe('solo');
  });
});

describe('hosting a game', () => {
  it('prepares an offer for every seat and opens the game under a code', async () => {
    const session = setup();
    const statuses: string[] = [];
    session.onChange(() => statuses.push(session.status));
    const code = await session.createGame();

    expect(code).toBe('mighty-apples');
    expect(session.code).toBe('mighty-apples');
    expect(session.lobbyOpen).toBe(true);
    expect(links).toHaveLength(3);
    expect(relay.created).toEqual([['zOFFER1', 'zOFFER2', 'zOFFER3']]); // one offer per seat, in seat order
    expect(statuses[0]).toBe('gathering');
    expect(session.status).toBe('awaiting');
    expect(session.role).toBe('solo'); // nobody has come yet
    expect(session.roster()).toEqual([
      { slot: 0, state: 'you' },
      { slot: 1, state: 'waiting' },
      { slot: 2, state: 'waiting' },
      { slot: 3, state: 'waiting' },
    ]);
  });

  it('brings a friend from answer to connected, and starts the game for the host', async () => {
    const session = setup();
    await session.createGame();
    relay.answer(2); // the friend in seat 2 answered
    await flush();
    expect(links[1]?.acceptAnswer).toHaveBeenCalledWith('zFRIEND2');
    expect(session.roster()[2]).toEqual({ slot: 2, state: 'joining' });
    expect(session.role).toBe('solo');

    links[1]?.connect();
    expect(session.status).toBe('connected');
    expect(session.role).toBe('host');
    expect(session.connectedSlots()).toEqual([2]);
    expect(session.roster()[2]).toEqual({ slot: 2, state: 'connected' });
    expect(links[1]?.sent).toEqual([{ k: 'hello', v: PROTOCOL_VERSION, build: __BUILD_ID__ }]);
    expect(session.lobbyOpen).toBe(true); // more friends can still come
    expect(session.code).toBe('mighty-apples');
  });

  it('keeps each friend’s traffic apart', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    const third = await befriend(3);
    expect(session.connectedSlots()).toEqual([1, 3]);

    session.sendTo(3, snap(1));
    expect(third.sent.at(-1)).toMatchObject({ k: 'snap' });
    expect(first.sent.filter((m) => m.k === 'snap')).toEqual([]);
    expect(session.sendTo(2, snap(1))).toBe(false); // nobody in seat 2

    first.receive(input(1, 4, 2, 0));
    third.receive(input(1, 8, 0, 5));
    expect(session.peerInput(1)).toMatchObject({ keys: 4, act: 2, mag: 0, fresh: true });
    expect(session.peerInput(3)).toMatchObject({ keys: 8, act: 0, mag: 5, fresh: true });
    expect(session.peerInput(2)).toBeNull();
  });

  it('drops late, reordered input per friend, and treats silence as standing still', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    const second = await befriend(2);
    first.receive(input(5, 1));
    first.receive(input(3, 2)); // older than 5: ignored
    second.receive(input(1, 4)); // a different friend's own count
    expect(session.peerInput(1)?.keys).toBe(1);
    expect(session.peerInput(2)?.keys).toBe(4);

    const later = performance.now() + 2000;
    expect(session.peerInput(1, later)?.fresh).toBe(false);
  });

  it("queues each friend's trade requests in order, dropping old and repeated ones", async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    const second = await befriend(2);
    const ask = (n: number, op: 'buy' | 'use' = 'use'): Message => ({ k: 'do', n, op, item: 28, shop: '' });
    first.receive(ask(1));
    first.receive(ask(3, 'buy'));
    first.receive(ask(2)); // older than 3: ignored
    first.receive(ask(3)); // repeated: ignored
    second.receive(ask(1)); // a different friend's own count
    expect(session.takeTrades(1).map((t) => [t.n, t.op])).toEqual([
      [1, 'use'],
      [3, 'buy'],
    ]);
    expect(session.takeTrades(1)).toEqual([]);
    expect(session.takeTrades(2)).toHaveLength(1);
    links[2]?.receive(ask(1)); // seat 3's link, which nobody has connected on
    expect(session.takeTrades(3)).toEqual([]);
  });

  it("takes a friend's trade commands only in order, and acknowledges what it took", async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    const second = await befriend(2);
    const step = (n: number): Message => ({ k: 'tr', n, cmd: { c: 'ready', on: n % 2 === 1 } });
    first.receive(step(2)); // out of order: waits for 1
    expect(session.tradeAck(1)).toBe(0);
    first.receive(step(1));
    first.receive(step(1)); // repeated: ignored
    first.receive(step(2)); // now it is next
    first.receive(step(4)); // a gap: ignored
    second.receive(step(1));
    expect(session.tradeAck(1)).toBe(2);
    expect(session.takeTradeSteps(1).map((m) => m.n)).toEqual([1, 2]);
    expect(session.takeTradeSteps(1)).toEqual([]);
    expect(session.takeTradeSteps(2)).toHaveLength(1);
    links[2]?.receive(step(1)); // seat 3's link, which nobody has connected on
    expect(session.takeTradeSteps(3)).toEqual([]);
  });

  it('ignores controls that do not come from a connected friend’s own link', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    links[2]?.receive(input(1, 15)); // seat 3's link, which nobody has connected on
    expect(session.peerInput(3)).toBeNull();
    first.receive({
      k: 'snap',
      n: 1,
      zone: 'overworld',
      away: [],
      players: [[0, 1, 2, 0, 0]],
      mobs: [],
      me: [1, 0, 1, 1, 1, 1, 1, 1, 1],
      chests: 0,
      w: [0, 0, 1],
      ground: [],
      events: [],
    });
    expect(session.takeSnapshot()).toBeNull(); // snapshots only flow host -> friend
  });

  it('refills a seat when its friend leaves while the code is open, so someone else can take it', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    await befriend(2);
    first.drop();
    await flush();

    expect(session.connectedSlots()).toEqual([2]);
    expect(session.role).toBe('host'); // the other friend is still playing
    expect(links).toHaveLength(4); // a new link was made for the vacated seat
    expect(relay.reopened).toEqual([{ slot: 1, offer: 'zOFFER4' }]);
    expect(session.roster()[1]).toEqual({ slot: 1, state: 'waiting' });
    expect(session.code).toBe('mighty-apples');
  });

  it('does not show a refilled seat as open until the relay has its fresh offer', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    let finish: () => void = () => undefined;
    relay.reopenSeat.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    first.drop();
    await flush();
    expect(session.roster().map((e) => e.slot)).toEqual([0, 2, 3]); // seat 1 is being prepared, not offered yet
    finish();
    await flush();
    expect(session.roster()[1]).toEqual({ slot: 1, state: 'waiting' });
  });

  it('goes back to waiting, with the code still good, when the only friend leaves before the game starts', async () => {
    const session = setup();
    await session.createGame();
    const only = await befriend(1);
    expect(session.role).toBe('host');
    only.drop();
    await flush();
    expect(session.role).toBe('solo');
    expect(session.status).toBe('awaiting');
    expect(session.code).toBe('mighty-apples');
    expect(relay.reopened).toHaveLength(1);
  });

  it('reopens a seat whose friend could not connect', async () => {
    const session = setup();
    await session.createGame();
    relay.answer(1);
    await flush();
    expect(session.roster()[1]).toEqual({ slot: 1, state: 'joining' });
    links[0]?.breakDown();
    await flush();
    expect(relay.reopened).toEqual([{ slot: 1, offer: 'zOFFER4' }]);
    expect(session.roster()[1]).toEqual({ slot: 1, state: 'waiting' });
    expect(session.status).toBe('awaiting');
    expect(session.detail).toBe('');
  });

  it('reopens a seat whose answer was damaged', async () => {
    const session = setup();
    await session.createGame();
    links[0]?.acceptAnswer.mockRejectedValueOnce(new Error('damaged'));
    relay.answer(1);
    await flush();
    expect(links[0]?.closeCalls).toBeGreaterThan(0);
    expect(relay.reopened).toEqual([{ slot: 1, offer: 'zOFFER4' }]);
  });

  it('ignores an answer for a seat that is not waiting', async () => {
    const session = setup();
    await session.createGame();
    relay.answer(1, 'zFIRST');
    await flush();
    relay.answer(1, 'zSECOND'); // a duplicate
    relay.answer(5, 'zNOSUCHSEAT');
    await flush();
    expect(links[0]?.acceptAnswer).toHaveBeenCalledTimes(1);
    expect(links[0]?.acceptAnswer).toHaveBeenCalledWith('zFIRST');
  });
});

describe('starting the game', () => {
  it('closes the code but keeps everyone connected', async () => {
    const session = setup();
    await session.createGame();
    await befriend(1);
    session.startGame();
    expect(relay.closed).toBe(1);
    expect(session.lobbyOpen).toBe(false);
    expect(session.code).toBeNull();
    expect(session.role).toBe('host');
    expect(session.status).toBe('connected');
    // Empty seats are no longer shown, and nothing refills them.
    expect(session.roster()).toEqual([
      { slot: 0, state: 'you' },
      { slot: 1, state: 'connected' },
    ]);
  });

  it('closes by itself once every seat is taken', async () => {
    const session = setup();
    await session.createGame();
    await befriend(1);
    await befriend(2);
    expect(session.lobbyOpen).toBe(true);
    await befriend(3);
    expect(relay.closed).toBe(1);
    expect(session.lobbyOpen).toBe(false);
    expect(session.code).toBeNull();
    expect(session.connectedSlots()).toEqual([1, 2, 3]);
  });

  it('keeps going while friends remain, and ends the game when the last one leaves', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    const second = await befriend(2);
    session.startGame();

    first.drop();
    await flush();
    expect(relay.reopened).toEqual([]); // the code is closed: seats are not refilled
    expect(session.role).toBe('host');
    expect(session.connectedSlots()).toEqual([2]);

    second.drop();
    await flush();
    expect(session.role).toBe('solo');
    expect(session.status).toBe('disconnected');
    expect(session.detail).toBe('Everyone left the game.');
    expect(session.roster()).toEqual([]);
  });

  it('does nothing if the game has not been set up or already started', async () => {
    const session = setup();
    session.startGame();
    expect(relay.closed).toBe(0);
    await session.createGame();
    await befriend(1);
    session.startGame();
    session.startGame();
    expect(relay.closed).toBe(1);
  });
});

describe('when the relay forgets the game', () => {
  it('tells a host nobody came, with a message to act on', async () => {
    const session = setup();
    await session.createGame();
    relay.expire();
    await flush();
    expect(session.status).toBe('failed');
    expect(session.detail).toMatch(/Nobody joined in time/);
    expect(session.code).toBeNull();
    expect(links.every((l) => l.closeCalls > 0)).toBe(true);
  });

  it('lets a game in progress carry on, just without new friends', async () => {
    const session = setup();
    await session.createGame();
    await befriend(1);
    relay.expire();
    await flush();
    expect(session.status).toBe('connected');
    expect(session.role).toBe('host');
    expect(session.code).toBeNull();
    expect(session.lobbyOpen).toBe(false);
    expect(session.roster()).toHaveLength(2); // the unused seats are gone
    expect(links[1]?.closeCalls).toBe(1); // idle, unclaimed seats were released
    expect(links[0]?.closeCalls).toBe(0);
  });
});

describe('ending or abandoning a game', () => {
  it('disconnecting ends the game for everyone and cancels the code', async () => {
    const session = setup();
    await session.createGame();
    const first = await befriend(1);
    const second = await befriend(2);
    session.disconnect();
    expect(session.status).toBe('disconnected');
    expect(session.detail).toBe('You disconnected.');
    expect(session.role).toBe('solo');
    expect(first.closeCalls).toBeGreaterThan(0);
    expect(second.closeCalls).toBeGreaterThan(0);
    expect(relay.cancelled).toBe(1);
    expect(session.connectedSlots()).toEqual([]);
    expect(session.code).toBeNull();
  });

  it('cancels a code nobody used when the host changes their mind', async () => {
    const session = setup();
    await session.createGame();
    session.setMode('off');
    expect(relay.cancelled).toBe(1);
    expect(session.mode).toBe('off');
    expect(session.status).toBe('idle');
    expect(links.every((l) => l.status === 'idle')).toBe(true);
  });

  it('does not change mode in the middle of a game', async () => {
    const session = setup();
    await session.createGame();
    await befriend(1);
    session.setMode('off');
    expect(session.mode).toBe('host');
    expect(session.role).toBe('host');
  });

  it('abandoning a game while its code is being made releases the code without an error', async () => {
    const session = setup();
    let release: (room: FakeRelay['room']) => void = () => undefined;
    relay.createRoom.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const creating = session.createGame();
    await flush();
    session.setMode('off');
    release(relay.room);
    expect(await creating).toBeNull();
    expect(session.detail).toBe('');
    expect(session.code).toBeNull();
    expect(relay.cancelled).toBe(1); // the code that came back late is released
  });

  it('reports an unreachable relay and stays usable', async () => {
    const session = setup();
    relay.createRoom.mockRejectedValueOnce(new RelayError('unreachable'));
    expect(await session.createGame()).toBeNull();
    expect(session.status).toBe('failed');
    expect(session.detail).toMatch(/Can’t reach the game server/);
    expect(links.every((l) => l.status === 'idle')).toBe(true);
    expect(await session.createGame()).toBe('mighty-apples'); // try again
    expect(session.status).toBe('awaiting');
  });

  it('reports a browser that cannot make an offer, and tidies up every seat', async () => {
    const session = setup('', (link) => {
      if (link.id === 2) link.createOffer.mockRejectedValue(new Error('This browser cannot do that.'));
    });
    expect(await session.createGame()).toBeNull();
    expect(session.status).toBe('failed');
    expect(session.detail).toBe('This browser cannot do that.');
    expect(relay.createRoom).not.toHaveBeenCalled(); // nothing was published
    expect(session.roster()).toEqual([]);
  });
});

describe('joining a game', () => {
  const invitation = { slot: 2, offer: 'zHOSTOFFER', guestToken: 'guest-token' };

  it('explains a code that is not two words, without asking the relay', async () => {
    const session = setup();
    await session.joinGame('definitely not a code');
    expect(session.detail).toMatch(/two words/);
    expect(session.status).toBe('idle');
    expect(session.role).toBe('solo');
    expect(relay.join).not.toHaveBeenCalled();
  });

  it('takes the seat it is given, answers its offer, and becomes that player', async () => {
    const session = setup();
    relay.join.mockResolvedValue(invitation);
    const joining = session.joinGame('Mighty Apples');
    await flush();
    await joining;

    expect(relay.join).toHaveBeenCalledWith('mighty-apples', expect.any(AbortSignal));
    expect(links).toHaveLength(1);
    expect(links[0]?.role).toBe('join');
    expect(links[0]?.acceptOffer).toHaveBeenCalledWith('zHOSTOFFER');
    expect(relay.sendAnswer).toHaveBeenCalledWith('mighty-apples', 'guest-token', 'zANSWER1', expect.any(AbortSignal));
    expect(links[0]?.answerDelivered).toHaveBeenCalled();
    expect(session.slot).toBe(2);
    expect(session.role).toBe('solo'); // not connected yet
    expect(session.roster()).toEqual([
      { slot: 0, state: 'joining' },
      { slot: 2, state: 'you' },
    ]);

    links[0]?.connect();
    expect(session.status).toBe('connected');
    expect(session.role).toBe('client');
    expect(session.slot).toBe(2);
    expect(session.roster()[0]).toEqual({ slot: 0, state: 'connected' });
  });

  it('receives snapshots newest first, and sends to the host', async () => {
    const session = setup();
    relay.join.mockResolvedValue(invitation);
    await session.joinGame('mighty-apples');
    const link = links[0]!;
    link.connect();

    link.receive(snap(4));
    link.receive(snap(2)); // late: ignored
    expect(session.takeSnapshot()?.n).toBe(4);
    expect(session.takeSnapshot()).toBeNull();
    link.receive(snap(5));
    expect(session.takeSnapshot()?.n).toBe(5);

    expect(session.send(input(1, 4))).toBe(true);
    expect(link.sent.at(-1)).toMatchObject({ k: 'in', keys: 4 });
    link.receive(input(9, 1)); // controls only flow friend -> host
    expect(session.peerInput(0)).toBeNull();
  });

  it("receives its pack and everyone's gear, newest first, and asks the host to trade", async () => {
    const session = setup();
    relay.join.mockResolvedValue(invitation);
    await session.joinGame('mighty-apples');
    const link = links[0]!;
    link.connect();
    const pack = (n: number, gold: number): Message => ({
      k: 'pack',
      n,
      gold,
      worn: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      ack: 0,
      items: [],
    });
    link.receive(pack(4, 10));
    link.receive(pack(2, 99)); // late: ignored
    expect(session.takePack()).toMatchObject({ n: 4, gold: 10 });
    expect(session.takePack()).toBeNull();
    link.receive({ k: 'looks', n: 3, players: [[0, 1, 0, 0, 0, 0, 0, 0, 0, 0]] });
    expect(session.takeLooks()?.n).toBe(3);
    expect(session.takeLooks()).toBeNull();
    expect(session.send({ k: 'do', n: 1, op: 'use', item: 28, shop: '' })).toBe(true);
    expect(link.sent.at(-1)).toMatchObject({ k: 'do', op: 'use' });
    link.receive({ k: 'do', n: 1, op: 'use', item: 28, shop: '' }); // requests only flow friend -> host
    expect(session.takeTrades(0)).toEqual([]);

    link.receive({ k: 'trade', n: 5, ack: 2, view: null });
    link.receive({ k: 'trade', n: 3, ack: 1, view: null }); // late: ignored
    expect(session.takeTrade()).toMatchObject({ n: 5, ack: 2 });
    expect(session.takeTrade()).toBeNull();
    link.receive({ k: 'tr', n: 1, cmd: { c: 'yes' } }); // commands only flow friend -> host
    expect(session.takeTradeSteps(0)).toEqual([]);
  });

  it('reports a game that is not open as something to retype, not a failure', async () => {
    const session = setup();
    relay.join.mockRejectedValue(new RelayError('not_found'));
    await session.joinGame('Mighty Apples');
    expect(session.detail).toMatch(/isn’t open/);
    expect(session.status).toBe('idle');
    expect(session.mode).toBe('join');
    expect(links).toHaveLength(0);
  });

  it('reports an unreachable server as a failure, and can try again', async () => {
    const session = setup();
    relay.join.mockRejectedValueOnce(new RelayError('unreachable'));
    await session.joinGame('mighty-apples');
    expect(session.status).toBe('failed');
    expect(session.detail).toMatch(/Can’t reach the game server/);
    relay.join.mockRejectedValueOnce(new RelayError('not_found'));
    await session.joinGame('mighty-apples');
    expect(session.status).toBe('idle');
  });

  it('reports the seat timing out while the answer is on its way', async () => {
    const session = setup();
    relay.join.mockResolvedValue(invitation);
    relay.sendAnswer.mockRejectedValueOnce(new RelayError('expired'));
    await session.joinGame('mighty-apples');
    expect(session.status).toBe('failed');
    expect(session.detail).toMatch(/Nobody joined in time/);
    expect(links[0]?.closeCalls).toBeGreaterThan(0);
  });

  it('goes back to solo, saying so, when the host leaves', async () => {
    const session = setup();
    relay.join.mockResolvedValue(invitation);
    await session.joinGame('mighty-apples');
    links[0]?.connect();
    links[0]?.drop();
    expect(session.status).toBe('disconnected');
    expect(session.detail).toBe('The other player disconnected.');
    expect(session.role).toBe('solo');
    expect(session.takeSnapshot()).toBeNull();
  });

  it('leaves the game when asked', async () => {
    const session = setup();
    relay.join.mockResolvedValue(invitation);
    await session.joinGame('mighty-apples');
    links[0]?.connect();
    session.disconnect();
    expect(session.status).toBe('disconnected');
    expect(session.detail).toBe('You disconnected.');
    expect(session.role).toBe('solo');
    expect(links[0]?.status).toBe('disconnected');
  });
});

describe('the version check', () => {
  it('disconnects a friend who is running a different version of the game', async () => {
    const session = setup();
    await session.createGame();
    const link = await befriend(1);
    link.receive({ k: 'hello', v: PROTOCOL_VERSION, build: 'some-other-build' });
    await flush();
    expect(link.status).toBe('disconnected');
    expect(session.connectedSlots()).toEqual([]);
  });

  it('accepts a friend on the same version, and keeps resending hello until it hears theirs', async () => {
    const session = setup();
    await session.createGame();
    const link = await befriend(1);
    await vi.advanceTimersByTimeAsync(2500);
    const hellos = link.sent.filter((m) => m.k === 'hello').length;
    expect(hellos).toBeGreaterThanOrEqual(3);
    link.receive({ k: 'hello', v: PROTOCOL_VERSION, build: __BUILD_ID__ });
    await vi.advanceTimersByTimeAsync(3000);
    expect(link.sent.filter((m) => m.k === 'hello')).toHaveLength(hellos); // stopped
    expect(link.status).toBe('connected');
  });

  it('checks the version even when their hello arrives before ours is sent', async () => {
    const session = setup();
    relay.join.mockResolvedValue({ slot: 1, offer: 'zO', guestToken: 't' });
    await session.joinGame('mighty-apples');
    const link = links[0]!;
    link.receive({ k: 'hello', v: 99, build: __BUILD_ID__ }); // before the channel even opened here
    expect(link.closeCalls).toBe(1);
  });
});
