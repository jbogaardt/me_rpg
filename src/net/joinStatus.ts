import type { LinkStatus } from './PeerLink';
import type { RelayErrorKind } from './relayClient';

// What a friend joining a game is told, step by step (Pixi-free; src/hud/JoinStatus.ts shows it). The menu closes when
// the friend taps Join, so this text has to carry the whole join on its own: connecting, waiting for the host, joined,
// and every failure with its reason and what to do next. Layer: core engine (co-op), no relay or protocol change.

/** The host's version differs from ours (shown, and recognised, by this exact text). */
export const VERSION_MISMATCH_TEXT =
  'The other player is running a different version of the game. Both of you should reload the page.';

export type JoinFailure = 'bad_code' | 'host_full' | 'version' | 'unreachable' | 'timeout' | 'rate_limited' | 'other';

export type JoinTone = 'working' | 'ok' | 'error';

export interface JoinStatus {
  tone: JoinTone;
  /** One short line. */
  title: string;
  /** What happened and what to do about it. */
  text: string;
}

export interface JoinState {
  status: LinkStatus;
  /** The session's own explanation of the last failure or end. */
  detail: string;
  /** Why the last attempt failed, when known. */
  failure: JoinFailure | null;
}

/** The relay's answer to a join that could not start, as a failure kind. A full game looks like a closed one to the relay. */
export function failureFromRelay(kind: RelayErrorKind): JoinFailure {
  switch (kind) {
    case 'not_found':
      return 'host_full';
    case 'unreachable':
      return 'unreachable';
    case 'expired':
      return 'timeout';
    case 'rate_limited':
      return 'rate_limited';
    case 'server':
      return 'other';
  }
}

const FAILURES: Record<JoinFailure, { title: string; text: string }> = {
  bad_code: {
    title: 'Check the code',
    text: 'That doesn’t look like a game code. It is two words, like “mighty-apples”.',
  },
  host_full: {
    title: 'Can’t join that game',
    text: 'No open game has that code, or all its seats are taken. Check the code, or ask the host for a new one.',
  },
  version: {
    title: 'Different game version',
    text: 'You and the host are running different versions. Both of you should reload the page, then try again.',
  },
  unreachable: {
    title: 'Can’t reach the game server',
    text: 'Check your internet connection and try again.',
  },
  timeout: {
    title: 'The host did not answer',
    text: 'Nobody answered in time. Ask the host to check they are still online, then try again.',
  },
  rate_limited: { title: 'Too many tries', text: 'Wait a minute and try again.' },
  other: { title: 'Couldn’t join', text: 'Something went wrong. Try again in a moment.' },
};

/** The failure to show for a state, preferring the recorded kind and recognising a version clash by its text. */
export function failureOf(state: JoinState): JoinFailure {
  if (state.detail === VERSION_MISMATCH_TEXT) return 'version';
  return state.failure ?? 'other';
}

/**
 * The status line for a friend's join, or null when there is nothing to say (not joining). `joined` says the
 * connection had been made before it ended, which is a disconnect rather than a failed join.
 */
export function joinStatus(state: JoinState, joined: boolean): JoinStatus | null {
  switch (state.status) {
    case 'gathering':
      return { tone: 'working', title: 'Connecting…', text: 'Finding the game.' };
    case 'awaiting':
    case 'connecting':
      return { tone: 'working', title: 'Waiting for the host…', text: 'Found the game. Setting up the connection.' };
    case 'connected':
      return { tone: 'ok', title: 'Joined!', text: 'You are in the game.' };
    case 'failed':
    case 'disconnected':
    case 'idle': {
      if (state.failure === null && !state.detail) return null;
      const kind = failureOf(state);
      if (joined && kind === 'other' && state.detail)
        return { tone: 'error', title: 'Disconnected', text: state.detail };
      const known = FAILURES[kind];
      // Unknown reasons keep the session's own words, which are already written for a player.
      const text = kind === 'other' && state.detail ? state.detail : known.text;
      return { tone: 'error', title: known.title, text };
    }
  }
}
