import { describe, expect, it, vi } from 'vitest';
import type { LinkStatus } from './PeerLink';
import { RelayError, type RelayClient } from './relayClient';
import { Session, statusLabel } from './session';

/** A relay that does whatever the test says (the real round trip is covered in relayClient.test.ts and e2e). */
const fakeRelay = (overrides: Partial<Record<keyof RelayClient, unknown>> = {}) =>
  ({
    join: vi.fn(),
    createRoom: vi.fn(),
    sendAnswer: vi.fn(),
    waitForAnswer: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  }) as unknown as RelayClient;

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

describe('Session', () => {
  it('starts solo, with no peer data', () => {
    const session = new Session('');
    expect(session.mode).toBe('off');
    expect(session.status).toBe('idle');
    expect(session.role).toBe('solo');
    expect(session.urlCode).toBeNull();
    expect(session.code).toBeNull();
    expect(session.peerInput()).toBeNull();
    expect(session.takeSnapshot()).toBeNull();
    expect(session.send({ k: 'hello', v: 1, build: 'x' })).toBe(false); // nothing to send to
  });

  it('opens on Join when the page URL carries a game code', () => {
    const session = new Session('#join=Mighty-Apples');
    expect(session.urlCode).toBe('mighty-apples');
    expect(session.mode).toBe('join');
    expect(new Session('#join=nonsense').mode).toBe('off');
    expect(new Session('#offer=zABC').mode).toBe('off'); // the old paste-a-code links are gone
    expect(new Session('#other').mode).toBe('off');
  });

  it('notifies listeners when the mode changes, and stops after unsubscribe', () => {
    const session = new Session('');
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

  it('explains a code that is not two words, without asking the relay', async () => {
    const join = vi.fn();
    const session = new Session('', fakeRelay({ join }));
    await session.joinGame('definitely not a code');
    expect(session.detail).toMatch(/two words/);
    expect(session.status).toBe('idle');
    expect(session.role).toBe('solo');
    expect(join).not.toHaveBeenCalled();
  });

  it('says so, calmly, when the game code is not open', async () => {
    const join = vi.fn().mockRejectedValue(new RelayError('not_found'));
    const session = new Session('', fakeRelay({ join }));
    await session.joinGame('Mighty Apples');
    expect(join).toHaveBeenCalledWith('mighty-apples', expect.any(AbortSignal));
    expect(session.detail).toMatch(/isn’t open/);
    expect(session.status).toBe('idle'); // a retype, not a broken connection
    expect(session.mode).toBe('join');
  });

  it('reports an unreachable server as a failure, and stays usable', async () => {
    const join = vi.fn().mockRejectedValue(new RelayError('unreachable'));
    const session = new Session('', fakeRelay({ join }));
    await session.joinGame('mighty-apples');
    expect(session.status).toBe('failed');
    expect(session.detail).toMatch(/Can’t reach the game server/);
    expect(session.role).toBe('solo');
    join.mockRejectedValue(new RelayError('not_found'));
    await session.joinGame('mighty-apples'); // try again
    expect(session.status).toBe('idle');
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
