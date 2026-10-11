import { joinLink } from '../net/roomCode';
import { statusLabel, type Mode, type Session } from '../net/session';

// The "Online" tab of the menu (markup in index.html, styles in src/ui.css): pick Solo / Host / Join. A host taps
// Create Game and reads out the short code; a friend types it and taps Join Game. It only drives the Session and
// mirrors its state; the game loop reads the Session itself.

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

  private create = $<HTMLButtonElement>('mp-create');
  private share = $('mp-share');
  private codeOut = $('mp-code');
  private copyCode = $<HTMLButtonElement>('mp-copy-code');
  private copyLink = $<HTMLButtonElement>('mp-copy-link');

  private codeIn = $<HTMLInputElement>('mp-code-in');
  private joinGo = $<HTMLButtonElement>('mp-join-go');
  private disconnect = $<HTMLButtonElement>('mp-disconnect');

  private copied = new Map<HTMLButtonElement, string>();

  constructor(private session: Session) {
    for (const button of this.modeButtons) {
      button.addEventListener('click', () => session.setMode(button.dataset.mode as Mode));
    }

    this.create.addEventListener('click', () => void this.session.createGame());
    this.joinGo.addEventListener('click', () => void this.session.joinGame(this.codeIn.value));
    this.disconnect.addEventListener('click', () => session.disconnect());
    this.copyCode.addEventListener('click', () => void this.copy(this.copyCode, session.code ?? ''));
    this.copyLink.addEventListener('click', () => {
      const base = window.location.origin + window.location.pathname;
      void this.copy(this.copyLink, joinLink(base, session.code ?? ''));
    });

    // Tapping the code selects all of it, so a long-press or Ctrl+C copies it even without the buttons.
    this.codeOut.addEventListener('focus', () => window.getSelection()?.selectAllChildren(this.codeOut));
    this.codeIn.addEventListener('input', () => this.render());
    this.codeIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.joinGo.disabled) this.joinGo.click();
    });

    // Opened from a join link: the code is already filled in.
    if (session.urlCode) this.codeIn.value = session.urlCode;
    session.onChange(() => this.render());
    this.render();
  }

  private async copy(button: HTMLButtonElement, text: string) {
    const original = this.copied.get(button) ?? button.textContent ?? '';
    this.copied.set(button, original);
    const ok = await copyText(text);
    button.textContent = ok ? 'Copied!' : 'Select the code and copy it';
    window.setTimeout(() => {
      button.textContent = original;
      this.copied.delete(button);
    }, 1500);
  }

  private render() {
    const { mode, status, detail, code } = this.session;
    const connected = status === 'connected';
    const idle = status === 'idle';
    const working = status === 'gathering' || status === 'connecting';
    // A finished or abandoned attempt leaves no stale code behind.
    if (connected) this.codeIn.value = '';

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

    this.share.hidden = !code;
    this.codeOut.textContent = code ?? '';
    // Starting a second game while one is being set up would just replace it, so wait until it is waiting or over.
    this.create.disabled = !this.session.available || working || connected;
    this.joinGo.disabled = !this.session.available || working || connected || !this.codeIn.value.trim();

    const failed = status === 'failed' || status === 'disconnected' || (idle && detail !== '');
    this.note.textContent = detail || this.hint();
    this.note.classList.toggle('error', failed);
  }

  /** What to do next, for the current step. */
  private hint(): string {
    const { mode, status, code } = this.session;
    if (status === 'connected') return 'The game is live. Close this menu to play.';
    if (mode === 'off') return 'Playing solo. Choose Host to start a game, or Join to enter a friend’s.';
    if (!this.session.available) return 'Online play isn’t set up for this copy of the game yet.';
    if (mode === 'host') {
      if (code) return 'Tell your friend this code, or send them the join link. It works once, for 5 minutes.';
      if (status === 'connecting') return 'Connecting…';
      return 'Create a game to get a code for your friend.';
    }
    if (status === 'gathering' || status === 'awaiting' || status === 'connecting') return 'Connecting…';
    return 'Type the game code your friend gave you, then join.';
  }
}
