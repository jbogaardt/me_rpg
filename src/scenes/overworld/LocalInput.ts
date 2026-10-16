import type { Aim } from '../../core/aim';
import { COMBO_WINDOW, COMBO_WINDOW_TOUCH, ComboReader } from '../../core/combo';
import { actionDown, actionPressed, actionTouchedOnly, pointerAim } from '../../core/controls';
import type { Command } from '../../entities/Player';
import { heroCombos } from '../../systems/skills';
import type { ComboKey } from '../../systems/spells';
import type { Arena } from './Arena';
import type { Zones } from './Zones';

const aimOf = (aim: Aim | null) => (aim ? { aim } : {});

/** The direction presses a combo is made of, in the order a frame with several is read. */
const COMBO_PRESSES: readonly (readonly [ComboKey, 'up' | 'down' | 'left' | 'right'])[] = [
  ['u', 'up'],
  ['d', 'down'],
  ['l', 'left'],
  ['r', 'right'],
];

/**
 * The controls at this keyboard (or touch pad) turned into a `Command` each frame: where to walk, whether the action key
 * was pressed, the aim, and the combo just finished, if any. Local to this machine in every role; a guest sends the
 * result to the host, solo and the host feed it to the simulation.
 */
export class LocalInput {
  private combos = new ComboReader();
  private comboSet = ''; // the combos the reader is following (a different set starts it afresh)
  private stroll: { dx: number; dy: number; until: number } | null = null; // a bot DM's walk, held for a moment

  constructor(
    private arena: Arena,
    private zones: Zones,
    /** Is the on-screen pad in use? (Combo taps get a longer window on a thumb.) */
    private touching: () => boolean,
  ) {}

  /** The DM bot walks this way for `seconds` (a bot that stops calling stops walking by itself). */
  walk(dx: number, dy: number, seconds: number) {
    this.stroll = { dx: Math.sign(dx), dy: Math.sign(dy), until: this.arena.clock + seconds };
  }

  /** The combo taps typed so far, for the HUD to light. */
  get typed() {
    return this.combos.typed;
  }

  /** The local player's controls this frame. While `reading` (a menu, a dialog) nothing typed counts toward a combo. */
  command(dt: number, reading: boolean): Command {
    const combo = this.readCombo(dt, reading);
    const walking = this.stroll && this.arena.clock < this.stroll.until ? this.stroll : null;
    const dx = (actionDown('right') ? 1 : 0) - (actionDown('left') ? 1 : 0);
    const dy = (actionDown('down') ? 1 : 0) - (actionDown('up') ? 1 : 0);
    return {
      dx: dx || walking?.dx || 0,
      dy: dy || walking?.dy || 0,
      act: actionPressed('attack'),
      ...(combo === undefined ? {} : { combo }),
      ...aimOf(pointerAim(this.zones.heroOnScreen())),
    };
  }

  /**
   * Feed the direction presses of this frame to the combo reader and say which combo of the wand or tome in hand was
   * just finished, if any. Presses are the move actions as bound, and the on-screen pad (the D-pad also moves the hero).
   */
  private readCombo(dt: number, reading: boolean): number | undefined {
    const combos = heroCombos(this.arena.hero, this.arena.zone.name).map((c) => c.keys); // the wand or tome in hand, then the skills ready
    const set = combos.join();
    if (reading || this.comboSet !== set) {
      this.combos.reset();
      this.comboSet = set;
    }
    if (reading) return undefined;
    this.combos.tick(dt, this.touching() ? COMBO_WINDOW_TOUCH : COMBO_WINDOW);
    const pressed = COMBO_PRESSES.filter(([, action]) => actionPressed(action));
    // A thumb that lands on a diagonal of the pad presses two directions at once: that is a slip, not two taps, so ignore it.
    if (pressed.length > 1 && pressed.every(([, action]) => actionTouchedOnly(action))) return undefined;
    let done: number | undefined;
    for (const [key] of pressed) {
      const i = this.combos.press(key, combos);
      if (i >= 0) done = i;
    }
    return done;
  }
}
