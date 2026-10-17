// The natural voice's own thread (HUD, local): the Kokoro speech model lives here, not in the page, because making a
// sentence takes seconds and a frozen page cannot draw the game or answer the network (the other players would drop it).
// `naturalVoice.ts` owns it and speaks to it with the messages below. Nothing here touches the DOM.

import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

/** What the page asks of the worker. */
export type ToWorker =
  { t: 'load'; model: string } | { t: 'say'; id: number; text: string; voice: string; speed: number };

/** What the worker tells the page. */
export type FromWorker =
  | { t: 'progress'; file: string; loaded: number; total: number }
  | { t: 'ready' }
  | { t: 'error'; message: string }
  | { t: 'audio'; id: number; audio: Float32Array | null; rate: number };

/** The few parts of a worker's global scope used here (the project's type libraries are the page's, not a worker's). */
const scope = self as unknown as {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: { data: ToWorker }) => void) | null;
};

let tts: KokoroTTS | null = null;

scope.onmessage = ({ data }) => void handle(data);

async function handle(data: ToWorker) {
  if (data.t === 'load') {
    try {
      env.allowLocalModels = false; // the weights come from the hub: never ask this site for /models/...
      tts = await KokoroTTS.from_pretrained(data.model, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress')
            scope.postMessage({ t: 'progress', file: p.file, loaded: p.loaded, total: p.total });
        },
      });
      scope.postMessage({ t: 'ready' });
    } catch (err) {
      scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  try {
    const raw = await tts?.generate(data.text, { voice: data.voice as never, speed: data.speed });
    if (!raw) return scope.postMessage({ t: 'audio', id: data.id, audio: null, rate: 0 });
    const audio = new Float32Array(raw.audio);
    scope.postMessage({ t: 'audio', id: data.id, audio, rate: raw.sampling_rate }, [audio.buffer]);
  } catch {
    scope.postMessage({ t: 'audio', id: data.id, audio: null, rate: 0 }); // a line the model cannot say is left unsaid
  }
}
