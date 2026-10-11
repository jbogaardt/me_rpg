import { joinLink } from '../net/signal';
import { statusLabel, type Mode, type Session } from '../net/session';

// The "Online" tab of the menu (markup in index.html, styles in src/ui.css): pick Solo / Host / Join and walk
// through the manual copy-and-paste handshake. It only drives the Session and mirrors its state; the game loop
// reads the Session itself.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Copy to the clipboard, falling back to a hidden field for browsers/contexts without the async API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    Object.assign(field.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' });
    document.body.append(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

export class Multiplayer {
  private modeButtons = [...document.querySelectorAll<HTMLButtonElement>('#mp-mode [data-mode]')];
  private status = $('mp-status');
  private note = $('mp-note');
  private hostPanel = $('mp-host');
  private joinPanel = $('mp-join');
  private activePanel = $('mp-active');
  private connected = document.querySelector<HTMLElement>('#mp-active .mp-connected')!;

  private genHost = $<HTMLButtonElement>('mp-gen-host');
  private offerOut = $<HTMLTextAreaElement>('mp-offer');
  private copyOffer = $<HTMLButtonElement>('mp-copy-offer');
  private copyLink = $<HTMLButtonElement>('mp-copy-link');
  private answerIn = $<HTMLTextAreaElement>('mp-answer-in');
  private establish = $<HTMLButtonElement>('mp-establish');

  private offerIn = $<HTMLTextAreaElement>('mp-offer-in');
  private genAnswer = $<HTMLButtonElement>('mp-gen-answer');
  private answerOut = $<HTMLTextAreaElement>('mp-answer');
  private copyAnswer = $<HTMLButtonElement>('mp-copy-answer');
  private disconnect = $<HTMLButtonElement>('mp-disconnect');

  private copied = '';

  constructor(private session: Session) {
    for (const button of this.modeButtons) {
      button.addEventListener('click', () => session.setMode(button.dataset.mode as Mode));
    }

    this.genHost.addEventListener('click', () => void this.generateHostCode());
    this.establish.addEventListener('click', () => void this.session.acceptAnswer(this.answerIn.value));
    this.genAnswer.addEventListener('click', () => void this.generateAnswer());
    this.disconnect.addEventListener('click', () => session.disconnect());
    this.copyOffer.addEventListener('click', () => void this.copy(this.copyOffer, this.offerOut.value));
    this.copyLink.addEventListener('click', () => {
      const base = window.location.origin + window.location.pathname;
      void this.copy(this.copyLink, joinLink(base, this.offerOut.value));
    });
    this.copyAnswer.addEventListener('click', () => void this.copy(this.copyAnswer, this.answerOut.value));

    // Tapping a generated code selects all of it, so a long-press or Ctrl+C copies the whole thing.
    for (const field of [this.offerOut, this.answerOut]) field.addEventListener('focus', () => field.select());
    // The buttons enable as soon as there is something to act on.
    for (const field of [this.answerIn, this.offerIn]) field.addEventListener('input', () => this.render());

    // Opened from a join link: the offer is already filled in.
    if (session.urlOffer) this.offerIn.value = session.urlOffer;
    session.onChange(() => this.render());
    this.render();
  }

  private async generateHostCode() {
    this.offerOut.value = '';
    this.answerIn.value = '';
    this.offerOut.value = (await this.session.createHostCode()) ?? '';
    this.render();
  }

  private async generateAnswer() {
    this.answerOut.value = '';
    this.answerOut.value = (await this.session.createAnswer(this.offerIn.value)) ?? '';
    this.render();
  }

  private async copy(button: HTMLButtonElement, text: string) {
    const original = this.copied || button.textContent || '';
    this.copied = original;
    const ok = await copyText(text);
    button.textContent = ok ? 'Copied!' : 'Select the code and copy it';
    window.setTimeout(() => {
      button.textContent = original;
      this.copied = '';
    }, 1500);
  }

  private render() {
    const { mode, status, detail } = this.session;
    const connected = status === 'connected';
    const idle = status === 'idle';
    // A finished or abandoned attempt leaves no stale codes behind.
    if (idle || status === 'failed' || status === 'disconnected') this.offerOut.value = this.answerOut.value = '';
    if (connected) this.offerIn.value = this.answerIn.value = '';

    for (const button of this.modeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.mode === mode));
      button.disabled = connected;
    }
    this.hostPanel.hidden = connected || mode !== 'host';
    this.joinPanel.hidden = connected || mode !== 'join';
    this.activePanel.hidden = !connected;
    this.status.dataset.state = status;
    this.status.querySelector('.label')!.textContent = statusLabel(mode, status);
    this.connected.textContent =
      this.session.role === 'client' ? 'Connected to Player 1 (host)' : 'Connected to Player 2';

    const working = status === 'gathering' || status === 'connecting';
    this.genHost.disabled = working || connected;
    this.copyOffer.disabled = this.copyLink.disabled = !this.offerOut.value;
    this.establish.disabled = status !== 'awaiting' || !this.answerIn.value.trim();
    this.genAnswer.disabled = working || connected || !this.offerIn.value.trim();
    this.copyAnswer.disabled = !this.answerOut.value;

    const failed = status === 'failed' || status === 'disconnected' || (idle && detail !== '');
    this.note.textContent = detail || this.hint();
    this.note.classList.toggle('error', failed);
  }

  /** What to do next, for the current step. */
  private hint(): string {
    const { mode, status } = this.session;
    if (status === 'connected') return 'The game is live. Close this menu to play.';
    if (mode === 'off') return 'Playing solo. Choose Host to start a game, or Join to enter a friend’s.';
    if (mode === 'host') {
      if (status === 'awaiting')
        return 'Send the host code (or join link) to your friend, then paste their answer code below.';
      if (status === 'connecting') return 'Connecting…';
      return 'Generate a code, then send it to your friend.';
    }
    if (status === 'awaiting') return 'Send the answer code back to the host. The game starts when they connect.';
    if (status === 'connecting') return 'Connecting…';
    return 'Paste the host’s code or join link, then generate your answer.';
  }
}
