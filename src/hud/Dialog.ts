const DIALOG_MAX_W = 600;

/** The HTML dialog box (markup in index.html). Tapping it presses the action key (see core/touch.ts). */
export class Dialog {
  private box = document.getElementById('dialog')!;
  private text = document.getElementById('dialog-text')!;
  private lines: string[] = [];
  private index = -1; // -1 = closed

  get active(): boolean {
    return this.index >= 0;
  }

  say(lines: string[]) {
    this.lines = lines;
    this.index = 0;
    this.text.textContent = lines[0];
    this.box.hidden = false;
  }

  /** Show the next line, or close after the last one. */
  advance() {
    if (!this.active) return;
    this.index++;
    if (this.index >= this.lines.length) this.close();
    else this.text.textContent = this.lines[this.index];
  }

  close() {
    this.index = -1;
    this.box.hidden = true;
  }

  /**
   * Size the box to the screen and keep it clear of the on-screen touch controls (`[pad, buttons]` rects,
   * empty when hidden). It grows upward with its text.
   */
  layout(screen: { width: number; height: number }, touchRects: readonly DOMRect[]) {
    const margin = 10;
    let left = margin;
    let right = screen.width - margin;
    let bottom = screen.height - 20;
    const [pad, buttons] = touchRects;
    if (pad && buttons) {
      // Fit between the D-pad and the buttons if there's room (landscape), otherwise sit above them.
      if (buttons.left - pad.right - 2 * margin >= 320) {
        left = pad.right + margin;
        right = buttons.left - margin;
      } else {
        bottom = Math.min(pad.top, buttons.top) - margin;
      }
    }
    const w = Math.min(DIALOG_MAX_W, right - left);
    Object.assign(this.box.style, {
      left: `${Math.round(left + (right - left - w) / 2)}px`,
      width: `${w}px`,
      bottom: `${Math.round(screen.height - bottom)}px`,
    });
  }
}
