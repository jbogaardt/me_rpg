/**
 * The "Harvest" buttons that stand by ripe crop plots within the local player's reach (and the "Drink" button by a pond). HTML over the canvas (not Pixi),
 * like the other overlays, so a click or tap on one never also swings the sword at the canvas, and text stays sharp.
 * The scene gives each frame the spots (screen px, CSS) of the plots to show a button for; a button is reused for the
 * same plot (`key`) from frame to frame. Styles in src/ui.css (`#harvest-layer`, `.harvest-btn`).
 */
export interface HarvestSpot {
  /** Which plot (its index in the zone; `DRINK_KEY` for the pond). */
  key: number;
  x: number;
  y: number;
  /** The button's word (default "Harvest"). */
  label?: string;
}

/** The key of the "Drink" button shown at the edge of a pond. */
export const DRINK_KEY = -1;

export class HarvestButtons {
  private layer = document.getElementById('harvest-layer')!;
  private buttons = new Map<number, HTMLButtonElement>();

  /** Called with a plot's key when its button is pressed. */
  onPick: (key: number) => void = () => {};

  /** Show a button at each spot and take away the ones no longer wanted (an empty list clears them all). */
  update(spots: readonly HarvestSpot[]) {
    const wanted = new Set(spots.map((s) => s.key));
    for (const [key, button] of this.buttons) {
      if (wanted.has(key)) continue;
      button.remove();
      this.buttons.delete(key);
    }
    for (const spot of spots) {
      let button = this.buttons.get(spot.key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'harvest-btn wood-btn';
        button.textContent = spot.label ?? 'Harvest';
        // pointerdown, not click: it works the moment a finger lands and the plot may be picked or gone by mouseup.
        button.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.onPick(spot.key);
        });
        this.layer.appendChild(button);
        this.buttons.set(spot.key, button);
      }
      button.style.left = `${Math.round(spot.x)}px`;
      button.style.top = `${Math.round(spot.y)}px`;
    }
  }

  clear() {
    this.update([]);
  }
}
