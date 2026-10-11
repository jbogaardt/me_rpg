/**
 * The black cut when the player goes through a door (markup `#fade` in index.html). `flash()` goes black at once, in
 * the frame the zone is swapped, and fades back in; `hold()` stays black while the next zone is still loading.
 */
export class Fade {
  private el = document.getElementById('fade')!;
  private holding = false;

  flash() {
    this.el.style.transition = 'none';
    this.el.style.opacity = '1';
    void this.el.offsetWidth; // apply the black before the transition starts, in this frame
    if (!this.holding) this.release();
  }

  /** Stay black (or stop staying black) until released: for a zone that is not loaded yet. */
  hold(on: boolean) {
    this.holding = on;
    if (on) {
      this.el.style.transition = 'none';
      this.el.style.opacity = '1';
    } else {
      this.release();
    }
  }

  private release() {
    this.el.style.transition = 'opacity 280ms ease-out';
    this.el.style.opacity = '0';
  }
}
