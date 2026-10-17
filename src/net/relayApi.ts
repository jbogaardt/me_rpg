// The wire format between the game (relayClient.ts) and the matchmaking relay (relay/). Shared so the two can't
// drift apart; pure types and constants, so the Worker bundles it too.
//
// A game has one code and up to MAX_GUESTS seats. An offer belongs to exactly one peer connection, so the host
// prepares one offer per seat up front; each friend who types the code is given the next free seat and its offer.
//
//   POST   /v2/rooms                    {offers}                    -> 201 {code, hostToken, expiresInS, seats}
//   POST   /v2/rooms/{code}/join                                    -> 200 {slot, offer, guestToken}  (404: none free)
//   POST   /v2/rooms/{code}/answer      {guestToken, answer}        -> 204
//   GET    /v2/rooms/{code}/answers?after=N&wait=20   Bearer host   -> 200 {answers: [{slot, answer}], next}
//   PUT    /v2/rooms/{code}/seats/{slot}  Bearer host  {offer}      -> 204   (a fresh offer reopens a seat)
//   POST   /v2/rooms/{code}/close       Bearer host                 -> 204   (no more joins)
//   DELETE /v2/rooms/{code}             Bearer host                 -> 204
//
// The relay never looks inside an offer or answer: they're the opaque strings from signal.ts. It holds a room for
// ROOM_TTL_MS (renewed for as long as the host keeps polling `answers`, once a friend has joined, so a dropped friend
// can rejoin a live game) and forgets it sooner once the host closes it. Gameplay never touches it.

export const API_VERSION = 'v2';

/** Friends who can join one game (the host makes four players). */
export const MAX_GUESTS = 3;

/** How long a game code stays joinable if nobody joins, and how long a game's code outlives its host's last poll. */
export const ROOM_TTL_MS = 10 * 60_000;

/** A friend who has taken a seat must answer within this, or the seat is offered to someone else. */
export const CLAIM_TTL_MS = 60_000;

/** The longest the host's "any answers yet?" request is held open before the relay says "nothing new". */
export const MAX_WAIT_S = 25;

/** An offer/answer is ~1 KB deflated (a few KB without compression); this only stops absurd input. */
export const MAX_PAYLOAD_CHARS = 16_000;

/** The biggest request body: a full set of offers plus a little JSON. */
export const MAX_BODY_CHARS = MAX_GUESTS * MAX_PAYLOAD_CHARS + 500;

/** Offers and answers are base64url text (signal.ts). */
export function isPayload(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= MAX_PAYLOAD_CHARS && /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** One offer per seat to create a room with: between 1 and MAX_GUESTS of them. */
export function isOfferList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_GUESTS && value.every(isPayload);
}

export type ErrorKind =
  'bad_request' | 'not_found' | 'forbidden' | 'conflict' | 'too_large' | 'rate_limited' | 'origin' | 'server';

export interface ErrorBody {
  error: ErrorKind;
}

export interface CreateRoomRequest {
  offers: string[];
}

export interface CreateRoomResponse {
  code: string;
  hostToken: string;
  expiresInS: number;
  /** How many friends can join (the number of offers given). */
  seats: number;
}

export interface JoinRoomResponse {
  /** The friend's player number, 1 to MAX_GUESTS (the host is player 0). */
  slot: number;
  offer: string;
  guestToken: string;
}

export interface AnswerRequest {
  guestToken: string;
  answer: string;
}

export interface SeatAnswer {
  slot: number;
  answer: string;
}

export interface AnswersResponse {
  answers: SeatAnswer[];
  /** Pass this as `after` next time to get only what is newer. */
  next: number;
}

export interface SeatRequest {
  offer: string;
}
