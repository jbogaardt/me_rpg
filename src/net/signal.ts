// Offer/answer codes for serverless WebRTC signaling. A session description is wrapped in JSON, deflated when the
// browser can (CompressionStream), and written as base64url so it fits in a text box or a URL fragment:
//   <format char><base64url>   format 'z' = deflate, 'r' = raw (browsers without CompressionStream)
// Pure apart from the Web Streams / Blob / Response globals, so it runs (and is tested) under Node.

export type SignalType = 'offer' | 'answer';

export interface Signal {
  type: SignalType;
  sdp: string;
}

const DEFLATE = 'z';
const RAW = 'r';
const MAX_SDP = 32_000; // a data-channel-only SDP is ~1-3 KB; this only stops absurd input
const URL_KEY = /(?:^|[#?&])(?:offer|answer)=([^&\s]+)/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Pull the code out of whatever was pasted: a bare code, or a full join link containing `#offer=...`. */
export function extractCode(pasted: string): string {
  const trimmed = pasted.trim();
  const fromUrl = URL_KEY.exec(trimmed);
  return (fromUrl?.[1] ?? trimmed).replace(/\s+/g, '');
}

/** The offer code in a page URL's hash (`#offer=...`), or null. */
export function offerFromHash(hash: string): string | null {
  const match = /^#offer=([^&\s]+)/.exec(hash);
  return match?.[1] ?? null;
}

/** The shareable link that opens the game already set up to join `offerCode`. */
export function joinLink(base: string, offerCode: string): string {
  return `${base}#offer=${offerCode}`;
}

export async function encodeSignal(signal: Signal): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ t: signal.type, s: signal.sdp }));
  if (typeof CompressionStream === 'undefined') return RAW + toBase64Url(bytes);
  return DEFLATE + toBase64Url(await pipe(bytes, new CompressionStream('deflate')));
}

/** Decode a pasted code. Throws an Error with a message fit to show the player when it isn't a valid code. */
export async function decodeSignal(pasted: string, expected?: SignalType): Promise<Signal> {
  const code = extractCode(pasted);
  if (!code) throw new Error('Paste a code first.');
  let json: string;
  try {
    let bytes = fromBase64Url(code.slice(1));
    if (code[0] === DEFLATE) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes.');
      bytes = new Uint8Array(await pipe(bytes, new DecompressionStream('deflate')));
    } else if (code[0] !== RAW) {
      throw new SyntaxError('unknown format');
    }
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('This browser')) throw err;
    throw new Error('That is not a valid code. Copy the whole code and try again.', { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That is not a valid code. Copy the whole code and try again.');
  }
  const { t, s } = (parsed ?? {}) as { t?: unknown; s?: unknown };
  if ((t !== 'offer' && t !== 'answer') || typeof s !== 'string' || !s.startsWith('v=') || s.length > MAX_SDP) {
    throw new Error('That is not a valid code. Copy the whole code and try again.');
  }
  if (expected && t !== expected) {
    throw new Error(
      expected === 'offer'
        ? 'That is an answer code. Paste the Host’s offer code (or join link) here.'
        : 'That is an offer code. Paste the answer code your friend generated.',
    );
  }
  return { type: t, sdp: s };
}
