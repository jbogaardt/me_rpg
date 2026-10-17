import { joinStatus } from '../net/joinStatus';
import type { Session } from '../net/session';

// The join banner (`#join-status` in index.html, styles in src/ui.css): the friend's join progress as text that stays
// on screen after the menu closes (Join closes it). Connecting and waiting stay up, "Joined" fades by itself, a failure
// stays with its reason until dismissed and calls `onFailed` so the Online tab can come back for another try. The words
// come from net/joinStatus.ts; this only shows them (textContent only). Joining is a guest's own affair, so the host
// has nothing to show here.

const OK_MS = 3000;

export class JoinStatus {
  private root = document.getElementById('join-status')!;
  private title = this.root.querySelector<HTMLElement>('.title')!;
  private text = this.root.querySelector<HTMLElement>('.text')!;
  private joined = false;
  private timer = 0;
  private lastKey = '';

  constructor(
    private session: Session,
    private onFailed: () => void,
  ) {
    this.root.querySelector('button')!.addEventListener('click', () => this.hide());
    session.onChange(() => this.render());
  }

  private hide() {
    window.clearTimeout(this.timer);
    this.root.hidden = true;
  }

  private render() {
    const { mode, status, detail, failure } = this.session;
    if (mode !== 'join') {
      this.joined = false;
      this.lastKey = '';
      this.hide();
      return;
    }
    if (status === 'connected') this.joined = true;
    else if (status === 'gathering') this.joined = false; // a new attempt
    const shown = joinStatus({ status, detail, failure }, this.joined);
    if (!shown) {
      this.hide();
      return;
    }
    const key = `${shown.tone}|${shown.title}|${shown.text}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    window.clearTimeout(this.timer);
    this.root.hidden = false;
    this.root.dataset.tone = shown.tone;
    this.root.setAttribute('role', shown.tone === 'error' ? 'alert' : 'status');
    this.title.textContent = shown.title;
    this.text.textContent = shown.text;
    if (shown.tone === 'ok') this.timer = window.setTimeout(() => this.hide(), OK_MS);
    if (shown.tone === 'error') this.onFailed();
  }
}
