/**
 * The big name of an area in the top middle of the screen, shown for a few seconds when the player arrives somewhere
 * (markup in index.html, the fade in src/ui.css). `sub` is the small line above it ("New area discovered").
 */
export class AreaBanner {
  private root = document.getElementById('area-banner')!;
  private title = this.root.querySelector<HTMLElement>('.title')!;
  private sub = this.root.querySelector<HTMLElement>('.sub')!;

  show(name: string, sub = '') {
    this.title.textContent = name;
    this.sub.textContent = sub;
    // Restart the animation when it is already running (a quick trip through two areas).
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
  }
}
