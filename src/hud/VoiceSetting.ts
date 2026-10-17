import { natural } from './naturalVoice';
import { voice } from './voice';

// The Controls tab's voice choice (markup `#voice-setting` in index.html): the browser's own voice, or the natural one
// (Kokoro, downloaded once and run in the page; `naturalVoice.ts`). The saving and the fallback are in `voice.ts`.

export class VoiceSetting {
  private browser = document.querySelector<HTMLButtonElement>('#voice-engine [data-voice="browser"]')!;
  private natural = document.querySelector<HTMLButtonElement>('#voice-engine [data-voice="natural"]')!;
  private note = document.getElementById('voice-note')!;

  constructor() {
    this.browser.addEventListener('click', () => {
      voice.setNatural(false);
      this.refresh();
    });
    this.natural.addEventListener('click', () => {
      voice.setNatural(true);
      this.refresh();
    });
    natural.onChange(() => this.refresh());
  }

  /** Called when the menu opens, and as the download goes. */
  refresh() {
    const on = voice.natural;
    this.browser.setAttribute('aria-checked', String(!on));
    this.natural.setAttribute('aria-checked', String(on));
    this.natural.disabled = !natural.supported;
    const fallback = voice.fallback;
    if (fallback) this.note.textContent = fallback;
    else if (!on)
      this.note.textContent =
        'The browser’s own voice reads the Dungeon Master. Natural voice is a one-time download of about 90 MB.';
    else if (natural.state === 'ready') this.note.textContent = 'The natural voice is ready. It runs on this device.';
    else
      this.note.textContent = `Downloading the natural voice… ${Math.round(natural.progress * 100)}%. The browser’s voice speaks until then.`;
  }
}
