import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal } from './signal';

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

describe('offer/answer encoding', () => {
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

  it('tells an offer from an answer', async () => {
    const offer = await encodeSignal({ type: 'offer', sdp: SDP });
    const answer = await encodeSignal({ type: 'answer', sdp: SDP });
    await expect(decodeSignal(offer, 'answer')).rejects.toThrow(/damaged/);
    await expect(decodeSignal(answer, 'offer')).rejects.toThrow(/damaged/);
  });

  it('rejects garbage with a readable message', async () => {
    for (const bad of ['', 'hello world', 'zzzz', 'z', 'x1234', 'r' + b64url('{"t":"offer"}')]) {
      await expect(decodeSignal(bad)).rejects.toThrow(/damaged/);
    }
    const truncated = (await encodeSignal({ type: 'offer', sdp: SDP })).slice(0, 80);
    await expect(decodeSignal(truncated)).rejects.toThrow(/damaged/);
  });
});
