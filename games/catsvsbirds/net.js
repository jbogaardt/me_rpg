'use strict';
// Online co-op for Cats vs Birds: a plain-script port of Me RPG's connection layer (src/net: relayClient, signal, PeerLink),
// because this page has no build step. The host (the cat) asks the matchmaking relay for a two-word code; the friend (the
// birds) types it; the relay swaps one WebRTC offer and answer, then the two pages talk directly over an ordered data
// channel. Gameplay never touches the relay. The wire format is documented at the top of src/net/relayApi.ts.
//
//   const h = await CvBNet.host({ status(state, detail), code(c), opened(), closed(reason), message(text), error(text) })   -> { send(text), stop() }
//   const g = await CvBNet.join(code, { status(state, detail), opened(), closed(reason), message(text) })                  -> { send(text), stop() }
// `status` follows Me RPG's link states: gathering, awaiting (host: waiting for a friend), connecting, then `opened` (connected).
//
// After a friend leaves, the host puts a fresh offer in the seat so the same code lets them (or someone else) back in.
(function () {
  const RELAY = (new URLSearchParams(location.search).get('relay') || 'https://me-rpg-relay.jbogaardt.workers.dev').replace(/\/+$/, '');
  const API = RELAY + '/v2';
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  const GATHER_MS = 10000, CONNECT_MS = 30000, SILENCE_MS = 8000, POLL_S = 20;

  // ---- offers and answers as text: <format char><base64url>, 'z' = deflate, 'r' = raw (same as src/net/signal.ts) ----
  const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const fromB64 = (t) => { const s = t.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)); };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function encode(type, sdp) {
    const bytes = new TextEncoder().encode(JSON.stringify({ t: type, s: sdp }));
    return typeof CompressionStream === 'undefined' ? 'r' + toB64(bytes) : 'z' + toB64(await pipe(bytes, new CompressionStream('deflate')));
  }
  async function decode(code, type) {
    const damaged = new Error('The connection details were damaged on the way. Try again.');
    let json;
    try {
      let bytes = fromB64(code.slice(1));
      if (code[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate'));
      else if (code[0] !== 'r') throw damaged;
      json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { throw damaged; }
    if (!json || json.t !== type || typeof json.s !== 'string' || !json.s.startsWith('v=')) throw damaged;
    return json.s;
  }

  // ---- the relay ----
  async function api(method, path, o = {}) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), o.timeout || 10000);
    if (o.signal) o.signal.addEventListener('abort', () => ctl.abort(), { once: true });
    const headers = {};
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.token) headers.authorization = 'Bearer ' + o.token;
    try {
      return await fetch(API + path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: ctl.signal });
    } catch (e) {
      if (o.signal && o.signal.aborted) throw e;
      throw new Error('Can’t reach the game server. Check your connection and try again.');
    } finally { clearTimeout(timer); }
  }
  const fail = (res) => new Error(res.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'The game server had a problem. Try again in a moment.');

  // ---- one peer link ----
  function gathered(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', on); resolve(); };
      const on = () => pc.iceGatheringState === 'complete' && done();
      const timer = setTimeout(done, GATHER_MS); // an unreachable STUN server shouldn't hold the player up for ever
      pc.addEventListener('icegatheringstatechange', on);
    });
  }

  // Wraps a connection and its channel: tells `h` once when it opens and once when it ends, and calls a silent peer gone.
  function makeLink(pc, h) {
    let ch = null, opened = false, ended = false, last = performance.now(), connectTimer = null, beat = null;
    const end = (reason) => {
      if (ended) return; ended = true; clearTimeout(connectTimer); clearInterval(beat);
      try { if (ch) ch.close(); } catch { /* already closed */ }
      try { pc.close(); } catch { /* already closed */ }
      h.closed(reason, opened);
    };
    const link = {
      pc,
      send(text) { if (ch && ch.readyState === 'open') { try { ch.send(text); return true; } catch { /* backed up */ } } return false; },
      close() { end('You left.'); },
      arm() { clearTimeout(connectTimer); connectTimer = setTimeout(() => { if (!opened) end('Could not connect. A firewall or strict network may be blocking the direct link.'); }, CONNECT_MS); },
      use(c) {
        ch = c;
        c.onopen = () => {
          opened = true; last = performance.now(); clearTimeout(connectTimer);
          beat = setInterval(() => { if (performance.now() - last > SILENCE_MS) end('The other player stopped responding.'); else link.send('~'); }, 1000);
          h.opened();
        };
        c.onmessage = (e) => { last = performance.now(); if (typeof e.data === 'string' && e.data !== '~') h.message(e.data); };
        c.onclose = () => end('The other player disconnected.');
        if (c.readyState === 'open') c.onopen();
      },
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') end('The connection to the other player was lost.'); };
    return link;
  }

  // ---- the host: the cat ----
  async function host(cb) {
    let stopped = false, room = null, cur = null, reopening = false, reopenNote = '';
    const ctl = new AbortController();

    async function newSeat() { // a connection with its offer ready
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const link = makeLink(pc, {
        opened: () => { if (cur && cur.link === link) cb.opened(); },
        message: (text) => cb.message(text),
        closed: (reason, wasOpened) => { if (stopped) return; if (wasOpened) cb.closed(reason); else reopenNote = reason; if (cur && cur.link === link) reopen(); },
      });
      link.use(pc.createDataChannel('game', { ordered: true }));
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      return { link, pc, offer: await encode('offer', pc.localDescription.sdp), waiting: true };
    }
    async function reopen() { // the friend left: offer the seat again under the same code
      if (stopped || reopening || !room) return;
      reopening = true;
      try {
        cb.status('gathering', '');
        const seat = await newSeat();
        const res = await api('PUT', '/rooms/' + room.code + '/seats/1', { body: { offer: seat.offer }, token: room.hostToken });
        if (res.status !== 204) throw res.status === 404 || res.status === 409 ? new Error('The game code expired. Host again for a new one.') : fail(res);
        cur = seat; cb.status('awaiting', reopenNote); reopenNote = '';
      } catch (e) { if (!stopped) cb.error(e.message); } finally { reopening = false; }
    }

    cb.status('gathering', '');
    const first = await newSeat();
    const res = await api('POST', '/rooms', { body: { offers: [first.offer] } });
    if (res.status !== 201) { first.link.close(); throw fail(res); }
    room = await res.json();
    cur = first;
    cb.code(room.code); cb.status('awaiting', '');

    (async () => { // the relay holds each request open until an answer arrives; keeping at it also keeps the code alive
      let after = 0, drops = 0;
      while (!stopped) {
        try {
          const r = await api('GET', '/rooms/' + room.code + '/answers?after=' + after + '&wait=' + POLL_S, { token: room.hostToken, timeout: (POLL_S + 10) * 1000, signal: ctl.signal });
          if (r.status === 404 || r.status === 403) throw new Error('The game code expired. Host again for a new one.');
          if (r.status !== 200) throw fail(r);
          const body = await r.json(); drops = 0; after = body.next;
          for (const a of body.answers) {
            if (a.slot !== 1 || !cur || !cur.waiting) continue;
            cur.waiting = false;
            await cur.pc.setRemoteDescription({ type: 'answer', sdp: await decode(a.answer, 'answer') });
            cur.link.arm(); cb.status('connecting', '');
          }
        } catch (e) {
          if (stopped) return;
          if (/expired/.test(e.message) || ++drops > 3) { cb.error(e.message); return; }
          await new Promise((ok) => setTimeout(ok, 1000 * drops));
        }
      }
    })();

    return {
      send: (text) => (cur ? cur.link.send(text) : false),
      stop() {
        stopped = true; ctl.abort();
        if (cur) cur.link.close();
        api('DELETE', '/rooms/' + room.code, { token: room.hostToken }).catch(() => undefined);
      },
    };
  }

  // ---- the friend: the birds ----
  async function join(rawCode, cb) {
    const code = rawCode.trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (!/^[a-z]+-[a-z]+$/.test(code)) throw new Error('A game code is two words, like mighty-apples.');
    cb.status('gathering', '');
    const res = await api('POST', '/rooms/' + encodeURIComponent(code) + '/join');
    if (res.status === 404) throw new Error('That game isn’t open. Check the code, or ask your friend to host a new game.');
    if (res.status !== 200) throw fail(res);
    const inv = await res.json();
    cb.status('gathering', '');
    const pc = new RTCPeerConnection({ iceServers: ICE });
    let ended = false;
    const link = makeLink(pc, { opened: cb.opened, message: cb.message, closed: (reason) => { ended = true; cb.closed(reason); } });
    pc.ondatachannel = (e) => link.use(e.channel);
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: await decode(inv.offer, 'offer') });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      const sent = await api('POST', '/rooms/' + encodeURIComponent(code) + '/answer', { body: { guestToken: inv.guestToken, answer: await encode('answer', pc.localDescription.sdp) } });
      if (sent.status === 404 || sent.status === 403) throw new Error('That game closed before you got in. Ask your friend to host again.');
      if (sent.status !== 204) throw fail(sent);
    } catch (e) { if (!ended) { link.close(); } throw e; }
    link.arm(); cb.status('connecting', '');
    return { send: (text) => link.send(text), stop: () => link.close() };
  }

  window.CvBNet = { host, join };
})();
