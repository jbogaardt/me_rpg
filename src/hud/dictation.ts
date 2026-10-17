// Speaking to a chat line instead of typing: Enter on an empty line starts the mic, the words appear in the line as they
// are heard, and Enter again stops the mic and sends them (the form's own submit). A line with text in it, or a browser with
// no speech recognition, behaves as it always did (Enter sends). Local to each page, nothing is sent but the final words,
// through the same handler as typed text; core engine. Uses the browser's SpeechRecognition (Chrome, Edge, Safari; not
// Firefox), which may send the audio to the browser maker's service: it starts only on the player's own Enter.

interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognizerEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognizerEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function recognizerClass(): (new () => Recognizer) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What Enter does on a line: start listening, send, or stop listening and send. Pure, so it is unit-tested. */
export function enterAction(listening: boolean, text: string, supported: boolean): 'listen' | 'send' | 'stop' {
  if (listening) return 'stop';
  return supported && text.trim() === '' ? 'listen' : 'send';
}

export const dictationSupported = (): boolean => recognizerClass() !== null;

/** Join the heard chunks into one line (each chunk's best guess). */
export function transcript(results: RecognizerEvent['results']): string {
  let out = '';
  for (let i = 0; i < results.length; i++) out += results[i]?.[0]?.transcript ?? '';
  return out.trim();
}

export class Dictation {
  private rec: Recognizer | null = null;
  private submitOnEnd = false;
  private placeholder: string;

  /** `form` is submitted (its own handler sends the words) when the player presses Enter while listening. */
  constructor(
    private input: HTMLInputElement,
    private form: HTMLFormElement,
    private onState: (listening: boolean) => void = () => {},
  ) {
    this.placeholder = input.placeholder;
    // Capture phase: this runs before the form's implicit submit, and the Enter never reaches the game.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const action = enterAction(this.listening, input.value, dictationSupported());
      if (action === 'send') return; // the form submits as usual
      e.preventDefault();
      if (action === 'listen') this.start();
      else this.finish();
    });
    input.addEventListener('blur', () => this.cancel()); // wandered off: the mic goes off, nothing is sent
  }

  get listening(): boolean {
    return this.rec !== null;
  }

  /** Start the mic (a no-op where there is none, or when already listening). */
  start() {
    const Rec = recognizerClass();
    if (!Rec || this.rec) return;
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => (this.input.value = transcript(e.results).slice(0, this.input.maxLength));
    rec.onerror = (e) => {
      this.submitOnEnd = false;
      this.input.placeholder =
        e.error === 'not-allowed' ? 'Microphone blocked: type instead' : 'Could not hear: type instead';
    };
    rec.onend = () => {
      this.rec = null;
      this.input.placeholder = this.placeholder;
      this.onState(false);
      // Submit after the last result has landed, so no word is lost; an empty line is not sent.
      if (this.submitOnEnd && this.input.value.trim() !== '') this.form.requestSubmit();
      this.submitOnEnd = false;
    };
    this.rec = rec;
    this.submitOnEnd = false;
    this.input.placeholder = '🎤 Listening… press Enter to send';
    this.onState(true);
    try {
      rec.start();
    } catch {
      this.rec = null;
      this.onState(false);
    }
  }

  /** Stop listening and send what was heard. */
  finish() {
    if (!this.rec) return;
    this.submitOnEnd = true;
    this.rec.stop(); // `onend` follows once the final words are in
  }

  /** Stop listening and keep the words in the line without sending them. */
  cancel() {
    if (!this.rec) return;
    this.submitOnEnd = false;
    this.rec.abort();
  }
}
