import { heartbeat } from '../systems/cueRules';
import { downCard, downDark, lowHealth, wakeDark } from '../systems/downfall';

/**
 * The screen's own feel for the local hero (markup in index.html, look in src/ui.css; local only, nothing on the wire):
 * a red edge that pulses as HP runs low, and the fall to black with its card when they go down, then the slow return
 * after waking. `sync` is called every frame with the hero's HP and `Player.down` (seconds since falling, or null), so a
 * co-op guest, whose copy of the clock comes from `FLAG.down`, sees the same.
 */
export class ScreenFx {
  private vignette = document.getElementById('hurt-vignette')!;
  private fall = document.getElementById('downfall')!;
  private card = this.fall.querySelector<HTMLElement>('.card')!;
  private clock = 0;
  private wake = -1; // seconds since waking, -1 when not waking
  private wasDown = false;

  sync(hp: number, maxHp: number, down: number | null, dt: number) {
    this.clock += dt;
    const low = down === null ? lowHealth(hp, maxHp) : 0;
    // A slow heartbeat on top of the edge, faster as it gets worse.
    const beat = heartbeat(this.clock, low); // the hero's body pulses in the same step (`BodyCues`)
    this.vignette.style.opacity = low > 0 ? String((low * beat).toFixed(3)) : '0';

    let dark = 0;
    let card = 0;
    if (down !== null) {
      this.wasDown = true;
      this.wake = -1;
      dark = downDark(down);
      card = downCard(down);
    } else if (this.wasDown) {
      this.wasDown = false;
      this.wake = 0;
    }
    if (this.wake >= 0) {
      this.wake += dt;
      dark = wakeDark(this.wake);
      if (dark <= 0) this.wake = -1;
    }
    this.fall.style.display = dark > 0 ? 'flex' : 'none';
    this.fall.style.opacity = dark.toFixed(3);
    this.card.style.opacity = (down !== null ? card : dark).toFixed(3);
  }
}
