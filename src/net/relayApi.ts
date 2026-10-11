// The wire format between the game (relayClient.ts) and the matchmaking relay (relay/). Shared so the two can't
// drift apart; pure types and constants, so the Worker bundles it too.
//
//   POST   /v1/rooms                  {offer}                  -> 201 {code, hostToken, expiresInS}
//   POST   /v1/rooms/{code}/join                               -> 200 {offer, guestToken}   (once per room)
//   POST   /v1/rooms/{code}/answer    {guestToken, answer}     -> 204
//   GET    /v1/rooms/{code}/answer?wait=20   Bearer hostToken  -> 200 {answer} | 204 (nothing yet, ask again)
//   DELETE /v1/rooms/{code}           Bearer hostToken         -> 204
//
// The relay never looks inside an offer or answer: they're the opaque codes from signal.ts. It holds a room for
// ROOM_TTL_MS and forgets it as soon as the host has collected the answer. Gameplay never touches it.

export const API_VERSION = 'v1';

/** How long a game code stays joinable. */
export const ROOM_TTL_MS = 5 * 60_000;

/** The longest the host's "any answer yet?" request is held open before the relay says "not yet". */
export const MAX_WAIT_S = 25;

/** An offer/answer is ~1 KB deflated (a few KB without compression); this only stops absurd input. */
export const MAX_PAYLOAD_CHARS = 16_000;

/** Offers and answers are base64url text (signal.ts). */
export function isPayload(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= MAX_PAYLOAD_CHARS && /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export type ErrorKind =
  'bad_request' | 'not_found' | 'forbidden' | 'conflict' | 'too_large' | 'rate_limited' | 'origin' | 'server';

export interface ErrorBody {
  error: ErrorKind;
}

export interface CreateRoomRequest {
  offer: string;
}

export interface CreateRoomResponse {
  code: string;
  hostToken: string;
  expiresInS: number;
}

export interface JoinRoomResponse {
  offer: string;
  guestToken: string;
}

export interface AnswerRequest {
  guestToken: string;
  answer: string;
}

export interface WaitAnswerResponse {
  answer: string;
}
