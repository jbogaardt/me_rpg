/** The full-screen loading overlay (markup in index.html) shown until the first scene is ready. */
export class Loading {
  private root = document.getElementById('loading')!;
  private fill = this.root.querySelector<HTMLElement>('.fill')!;
  private label = this.root.querySelector<HTMLElement>('.label')!;

  progress(fraction: number) {
    this.fill.style.setProperty('--frac', String(Math.max(0, Math.min(1, fraction))));
  }

  done() {
    this.root.hidden = true;
  }

  fail(err: unknown) {
    this.root.classList.add('failed');
    this.label.textContent = `Could not start the game: ${err instanceof Error ? err.message : String(err)}`;
  }
}
