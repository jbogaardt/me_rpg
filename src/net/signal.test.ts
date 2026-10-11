import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal, extractCode, joinLink, offerFromHash } from './signal';

// Shaped like a real data-channel offer with candidates (the repetition is realistic: every candidate repeats
// the same attribute names and addresses).
const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  ...Array.from(
    { length: 6 },
    (_, i) =>
      `a=candidate:${i} 1 udp 2113937151 192.168.1.${20 + i} ${50000 + i * 7} typ host generation 0 network-cost 999`,
  ),
  'a=ice-ufrag:abcd',
  'a=ice-pwd:0123456789abcdef0123456789',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('offer/answer codes', () => {
  it('round-trips a description', async () => {
    const code = await encodeSignal({ type: 'offer', sdp: SDP });
    expect(await decodeSignal(code)).toEqual({ type: 'offer', sdp: SDP });
    expect(await decodeSignal(await encodeSignal({ type: 'answer', sdp: SDP }), 'answer')).toMatchObject({
      type: 'answer',
    });
  });

  it('is deflated and uses only URL-safe characters', async () => {
    const code = await encodeSignal({ type: 'offer', sdp: SDP });
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(SDP.length * 0.75);
  });

  it('reads the uncompressed fallback format', async () => {
    const json = JSON.stringify({ t: 'answer', s: SDP });
    const raw = 'r' + b64url(json);
    expect(await decodeSignal(raw)).toEqual({ type: 'answer', sdp: SDP });
  });

  it('accepts a pasted join link, surrounding whitespace and line breaks', async () => {
    const code = await encodeSignal({ type: 'offer', sdp: SDP });
    const link = joinLink('https://example.com/me_rpg/', code);
    expect((await decodeSignal(`  ${link}\n`, 'offer')).type).toBe('offer');
    const wrapped = code.replace(/(.{40})/g, '$1\n');
    expect((await decodeSignal(wrapped, 'offer')).sdp).toBe(SDP);
  });

  it('tells an offer from an answer', async () => {
    const offer = await encodeSignal({ type: 'offer', sdp: SDP });
    const answer = await encodeSignal({ type: 'answer', sdp: SDP });
    await expect(decodeSignal(offer, 'answer')).rejects.toThrow(/offer code/);
    await expect(decodeSignal(answer, 'offer')).rejects.toThrow(/answer code/);
  });

  it('rejects garbage with a readable message', async () => {
    await expect(decodeSignal('')).rejects.toThrow(/Paste a code/);
    for (const bad of ['hello world', 'zzzz', 'z', 'x1234', 'r' + b64url('{"t":"offer"}')]) {
      await expect(decodeSignal(bad)).rejects.toThrow(/not a valid code/);
    }
    const truncated = (await encodeSignal({ type: 'offer', sdp: SDP })).slice(0, 80);
    await expect(decodeSignal(truncated)).rejects.toThrow(/not a valid code/);
  });
});

describe('URL helpers', () => {
  it('finds the offer in a hash', () => {
    expect(offerFromHash('#offer=zABC-_')).toBe('zABC-_');
    expect(offerFromHash('#other=1')).toBeNull();
    expect(offerFromHash('')).toBeNull();
  });

  it('extracts a bare code or the code from a link', () => {
    expect(extractCode(' zABC ')).toBe('zABC');
    expect(extractCode('https://x.io/g/#offer=zABC')).toBe('zABC');
  });

  it('builds the join link', () => {
    expect(joinLink('https://x.io/g/', 'zABC')).toBe('https://x.io/g/#offer=zABC');
  });
});
