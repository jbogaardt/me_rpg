import { pushToast, tickToasts, toastLabel, type Toast } from './toastStack';

/**
 * Item pickups as a small, see-through stack of toasts at the left edge (markup `#pickup-toasts` in index.html), so they
 * never cover the fight. Local to each player (nothing is sent); they take no input.
 */
export class PickupToasts {
  private box = document.getElementById('pickup-toasts')!;
  private stack: Toast[] = [];

  add(text: string, inCombat: boolean) {
    this.stack = pushToast(this.stack, text, inCombat);
    this.draw();
  }

  update(dt: number, inCombat: boolean) {
    if (!this.stack.length) return;
    const before = this.stack.map((t) => t.count + t.text).join();
    this.stack = tickToasts(this.stack, dt, inCombat);
    if (this.stack.map((t) => t.count + t.text).join() !== before) this.draw();
  }

  private draw() {
    this.box.replaceChildren(
      ...this.stack.map((t) => {
        const d = document.createElement('div');
        d.textContent = toastLabel(t);
        return d;
      }),
    );
  }
}
