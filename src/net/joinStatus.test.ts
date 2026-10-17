import { describe, expect, it } from 'vitest';
import { failureFromRelay, joinStatus, VERSION_MISMATCH_TEXT, type JoinState } from './joinStatus';

const state = (over: Partial<JoinState>): JoinState => ({ status: 'idle', detail: '', failure: null, ...over });

describe('joinStatus', () => {
  it('says nothing before a join starts', () => {
    expect(joinStatus(state({}), false)).toBeNull();
  });

  it('walks connecting, waiting for the host, joined', () => {
    expect(joinStatus(state({ status: 'gathering' }), false)?.title).toBe('Connecting…');
    expect(joinStatus(state({ status: 'awaiting' }), false)?.title).toBe('Waiting for the host…');
    expect(joinStatus(state({ status: 'connecting' }), false)?.tone).toBe('working');
    expect(joinStatus(state({ status: 'connected' }), true)).toMatchObject({ tone: 'ok', title: 'Joined!' });
  });

  it('explains each failure', () => {
    expect(joinStatus(state({ failure: 'bad_code' }), false)?.title).toBe('Check the code');
    expect(joinStatus(state({ status: 'failed', failure: 'unreachable' }), false)?.title).toMatch(/reach/);
    expect(joinStatus(state({ failure: 'host_full' }), false)?.text).toMatch(/seats are taken/);
    expect(joinStatus(state({ status: 'failed', failure: 'timeout' }), false)?.tone).toBe('error');
  });

  it('recognises a version mismatch from the link', () => {
    const s = joinStatus(state({ status: 'disconnected', detail: VERSION_MISMATCH_TEXT }), false);
    expect(s?.title).toBe('Different game version');
    expect(s?.text).toMatch(/reload/);
  });

  it('reports a live game ending as a disconnect, keeping the reason', () => {
    expect(joinStatus(state({ status: 'disconnected', detail: 'The host left.' }), true)).toMatchObject({
      title: 'Disconnected',
      text: 'The host left.',
    });
  });

  it('keeps an unknown failure’s own words', () => {
    expect(joinStatus(state({ status: 'failed', detail: 'Boom.' }), false)?.text).toBe('Boom.');
  });

  it('maps relay errors', () => {
    expect(failureFromRelay('not_found')).toBe('host_full');
    expect(failureFromRelay('unreachable')).toBe('unreachable');
    expect(failureFromRelay('expired')).toBe('timeout');
    expect(failureFromRelay('rate_limited')).toBe('rate_limited');
    expect(failureFromRelay('server')).toBe('other');
  });
});
