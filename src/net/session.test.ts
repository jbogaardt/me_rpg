import { describe, expect, it, vi } from 'vitest';
import type { LinkStatus } from './ManualWebRTC';
import { Session, statusLabel } from './session';

describe('statusLabel', () => {
  it('words the host flow as Idle -> Gathering Candidates -> Awaiting Client -> Connected', () => {
    const labels = (['idle', 'gathering', 'awaiting', 'connected'] as LinkStatus[]).map((s) => statusLabel('host', s));
    expect(labels).toEqual(['Idle', 'Gathering Candidates', 'Awaiting Client', 'Connected']);
  });

  it('words the join flow as Connecting -> Ready to Share Answer -> Connected', () => {
    const labels = (['gathering', 'awaiting', 'connected'] as LinkStatus[]).map((s) => statusLabel('join', s));
    expect(labels).toEqual(['Connecting', 'Ready to Share Answer', 'Connected']);
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
    expect(session.urlOffer).toBeNull();
    expect(session.peerInput()).toBeNull();
    expect(session.takeSnapshot()).toBeNull();
    expect(session.send({ k: 'hello', v: 1, build: 'x' })).toBe(false); // nothing to send to
  });

  it('opens on Join when the page URL carries an offer', () => {
    const session = new Session('#offer=zABC-_');
    expect(session.urlOffer).toBe('zABC-_');
    expect(session.mode).toBe('join');
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

  it('reports a bad pasted code instead of throwing, and stays usable', async () => {
    const session = new Session('');
    expect(await session.createAnswer('definitely not a code')).toBeNull();
    expect(session.detail).toMatch(/not a valid code/);
    expect(session.status).toBe('idle');
    expect(session.role).toBe('solo');
  });
});
