// The natural voice (HUD, local): Kokoro, an open 82M-parameter speech model, run in the player's own browser through
// Transformers.js (the `kokoro-js` package: ONNX Runtime on WebAssembly, quantised weights). Nothing is sent anywhere
// but the one download of the weights from the Hugging Face hub, (about 90 MB, then cached
// by the browser). It is the DM's default voice (`voiceChoice.ts`), loaded lazily: the package's chunk is fetched only
// when `voice.ts` asks. `voice.ts`
// owns the choice and falls back to the browser's own voice while this loads, if it fails, or where there is no audio.

import type { FromWorker, ToWorker } from './kokoroWorker';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** An older British man: the wise old wanderer the DM is. */
const VOICE = 'bm_george';
const SPEED = 0.95;
/** ms: the longest a sentence is waited for from the worker before it is given up (a line left unsaid, the next goes on). */
const MAKE_LIMIT = 30_000;

export type NaturalState = 'idle' | 'loading' | 'ready' | 'failed';

/** The speech model's thread (kokoroWorker.ts), once loading has begun. */
let worker: Worker | null = null;
let nextId = 0;
const making = new Map<number, (r: { audio: Float32Array; rate: number } | null) => void>();
let state: NaturalState = 'idle';
/** Why the model could not be loaded (the error's own words, short), for the player to read and to tell us. */
let reason = '';
let loading: Promise<void> | null = null;
let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
/** Bumped by `stop`: a sentence queued before it is dropped unspoken. */
let epoch = 0;
/** Synthesis and playback are two queues: the next sentence is made while the last is still being said. */
let genQueue: Promise<unknown> = Promise.resolve();
let playQueue: Promise<unknown> = Promise.resolve();

const loaded = new Map<string, { loaded: number; total: number }>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

/** Bytes fetched over bytes to fetch of the weights, 0 to 1 (the files are counted as they are found). */
function fraction(): number {
  let have = 0;
  let total = 0;
  for (const f of loaded.values()) {
    have += f.loaded;
    total += f.total;
  }
  return total > 0 ? have / total : 0;
}

export const natural = {
  get state(): NaturalState {
    return state;
  },
  get error(): string {
    return reason;
  },
  get progress(): number {
    return fraction();
  },
  /** Can this browser play synthesised audio at all (and run the model's WebAssembly)? */
  get supported(): boolean {
    return typeof AudioContext !== 'undefined' && typeof WebAssembly !== 'undefined';
  },
  /** Call back when the state or the download progress changes. Returns the way to stop. */
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Begin loading the model (once; a failed load may be tried again). */
  load(): Promise<void> {
    if (!this.supported) return Promise.resolve();
    if (loading) return loading;
    state = 'loading';
    changed();
    loading = new Promise<void>((resolve) => {
      const give = (why: string) => {
        reason = why.replace(/\s+/g, ' ').slice(0, 80);
        state = 'failed';
        loading = null; // asking again tries again
        stopWorker();
        changed();
        resolve();
      };
      try {
        worker = new Worker(new URL('./kokoroWorker.ts', import.meta.url), { type: 'module' });
      } catch (err) {
        return give(err instanceof Error ? err.message : String(err));
      }
      worker.onerror = (e) => give(e.message || 'the speech thread failed');
      worker.onmessage = ({ data }: { data: FromWorker }) => {
        if (data.t === 'progress') {
          loaded.set(data.file, { loaded: data.loaded, total: data.total });
          changed();
        } else if (data.t === 'ready') {
          state = 'ready';
          changed();
          resolve();
        } else if (data.t === 'error') give(data.message);
        else {
          making.get(data.id)?.(data.audio ? { audio: data.audio, rate: data.rate } : null);
          making.delete(data.id);
        }
      };
      worker.postMessage({ t: 'load', model: MODEL } satisfies ToWorker);
    });
    return loading;
  },
  /**
   * Call from a tap, click or key (the first one): a phone starts audio only from a gesture, and a context made later, while
   * the DM is speaking, stays suspended, so the voice would be made and never heard.
   */
  unlock() {
    if (!this.supported) return;
    try {
      ctx ??= new AudioContext();
      void ctx.resume().catch(() => undefined);
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, 22050); // a silent blip: it is what really unlocks it on iOS
      source.connect(ctx.destination);
      source.start();
    } catch {
      /* no audio here: the browser's voice speaks */
    }
  },
  /** The model broke outside a call that could catch it (a browser it does not run in): give up on it, so the browser's voice takes over. */
  fail() {
    if (state !== 'loading') return; // a voice that is ready or already given up on is left as it is
    reason = 'it stopped working in this browser';
    state = 'failed';
    loading = null;
    stopWorker();
    this.stop();
    changed();
  },
  /** Say `sentence` after anything still being said, then call `done` (also when it is dropped or cannot be made). */
  say(sentence: string, done: () => void) {
    const mine = epoch;
    const thread = worker;
    const made = (async () => {
      await genQueue;
      if (!thread || state !== 'ready' || mine !== epoch) return null;
      return new Promise<{ audio: Float32Array; rate: number } | null>((resolve) => {
        const id = ++nextId;
        const timer = setTimeout(() => resolve(null), MAKE_LIMIT);
        making.set(id, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
        thread.postMessage({ t: 'say', id, text: sentence, voice: VOICE, speed: SPEED } satisfies ToWorker);
      });
    })();
    genQueue = made;
    playQueue = playQueue
      .then(async () => {
        const raw = await made;
        if (raw && mine === epoch) await play(raw.audio, raw.rate);
      })
      .catch(() => undefined)
      .finally(done);
  },
  /** Stop at once and drop what was waiting. */
  stop() {
    epoch++;
    try {
      playing?.stop();
    } catch {
      /* it had already ended */
    }
  },
};

/** End the speech thread (a failure, or giving up on it), and let every sentence waiting on it go unsaid. */
function stopWorker() {
  worker?.terminate();
  worker = null;
  for (const resolve of making.values()) resolve(null);
  making.clear();
}

/** Play mono samples, resolving when they have been heard (or `stop` cut them short). */
async function play(samples: Float32Array, rate: number): Promise<void> {
  ctx ??= new AudioContext();
  if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
  if (ctx.state !== 'running') return; // still locked (no tap yet): drop the line rather than hold every later one up
  const buffer = ctx.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  playing = source;
  await new Promise<void>((resolve) => {
    // `onended` is not always fired on a phone (a tab put to sleep): the line's own length, and a moment, is the longest it waits
    const guard = setTimeout(resolve, (samples.length / rate) * 1000 + 1500);
    source.onended = () => {
      clearTimeout(guard);
      resolve();
    };
    source.start();
  });
  if (playing === source) playing = null;
}
