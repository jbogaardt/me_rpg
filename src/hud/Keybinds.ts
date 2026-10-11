import { ACTIONS, ACTION_LABELS, FIXED_KEYS, SLOTS, codeLabel, type Action } from '../core/bindings';
import { bindings, persistBindings } from '../core/controls';
import { input } from '../core/input';
import type { TouchControls } from '../core/touch';

// The Controls tab's key/mouse editor (markup `#keybinds` in index.html). Click a slot, then press a key or click
// with a mouse button over the same slot; Backspace clears it, Esc cancels. Hidden on touch devices, which use the
// on-screen controls. Saving and the rules (reserved keys, one action per key) are in core/bindings.ts.

const HINT = 'Click a slot, then press a key or click it with a mouse button. Backspace clears, Esc cancels.';

export class Keybinds {
  private root = document.getElementById('keybinds')!;
  private note = document.getElementById('keybinds-note')!;
  private buttons = new Map<string, HTMLButtonElement>(); // `${action}:${slot}`
  private listening: { action: Action; slot: number } | null = null;
  private cancelCapture: (() => void) | null = null;

  constructor(private readonly touch: TouchControls) {
    const body = this.root.querySelector('tbody')!;
    for (const action of ACTIONS) {
      const row = body.insertRow();
      row.insertCell().textContent = ACTION_LABELS[action];
      const cell = row.insertCell();
      for (let slot = 0; slot < SLOTS; slot++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bind';
        button.addEventListener('pointerdown', (e) => {
          if (e.pointerType !== 'mouse') return;
          e.preventDefault(); // keep focus where it is; right/middle clicks must not open menus
          if (this.isListening(action, slot)) this.finish(`Mouse${e.button}`);
          else this.listen(action, slot);
        });
        // Keyboard activation (Enter/Space on a focused button) arrives as a click with no pointer (detail 0).
        button.addEventListener(
          'click',
          (e) => e.detail === 0 && !this.isListening(action, slot) && this.listen(action, slot),
        );
        button.addEventListener('contextmenu', (e) => e.preventDefault());
        cell.append(button);
        this.buttons.set(`${action}:${slot}`, button);
      }
    }
    document.getElementById('keybinds-reset')!.addEventListener('click', () => {
      this.cancel();
      bindings.reset();
      persistBindings();
      this.say('Controls reset to the defaults.');
      this.refresh();
    });
    // Clicking anywhere but the slot being edited gives up on it.
    document.addEventListener('pointerdown', (e) => {
      if (this.listening && !(e.target instanceof HTMLButtonElement && e.target.classList.contains('bind')))
        this.cancel();
    });
  }

  /** Called when the menu opens: touch devices can't customise, so the editor is hidden for them. */
  refresh() {
    this.root.hidden = this.touch.active;
    const names = (a: Action) => bindings.codes(a).map(codeLabel).join(', ') || '—';
    for (const cell of document.querySelectorAll<HTMLElement>('#menu-controls [data-bound]')) {
      const what = cell.dataset.bound;
      const first = (a: Action) => codeLabel(bindings.codes(a)[0] ?? '');
      if (what === 'move') cell.textContent = (['up', 'left', 'down', 'right'] as const).map(first).join(' ');
      else if (what === 'tabs')
        cell.textContent = `${first('left')} / ${first('right')}`; // the move keys: see tabStep()
      else if (what === 'menu' || what === 'map') cell.textContent = FIXED_KEYS[what].map(codeLabel).join(', ');
      else cell.textContent = names(what as Action);
    }
    for (const action of ACTIONS) {
      for (let slot = 0; slot < SLOTS; slot++) {
        const button = this.buttons.get(`${action}:${slot}`)!;
        const listening = this.isListening(action, slot);
        button.textContent = listening ? 'Press a key…' : codeLabel(bindings.slots(action)[slot] ?? '');
        button.classList.toggle('listening', listening);
      }
    }
  }

  /** Stop waiting for a key (menu closed, another slot picked, or Esc). */
  cancel() {
    this.cancelCapture?.();
    this.cancelCapture = null;
    if (this.listening) {
      this.listening = null;
      this.refresh();
    }
  }

  private isListening(action: Action, slot: number) {
    return this.listening?.action === action && this.listening.slot === slot;
  }

  private listen(action: Action, slot: number) {
    this.cancel();
    this.listening = { action, slot };
    this.cancelCapture = input.captureKey((code) => this.finish(code));
    this.say(HINT);
    this.refresh();
  }

  private finish(code: string) {
    const target = this.listening;
    this.cancelCapture?.();
    this.cancelCapture = null;
    this.listening = null;
    if (!target) return;
    if (code === 'Escape') {
      this.say('');
    } else if (code === 'Backspace' || code === 'Delete') {
      bindings.clear(target.action, target.slot);
      persistBindings();
      this.say(`${ACTION_LABELS[target.action]} slot cleared.`);
    } else {
      const taken = bindings.actionFor(code);
      const error = bindings.set(target.action, target.slot, code);
      if (error) this.say(error, true);
      else {
        persistBindings();
        const moved = taken && taken !== target.action ? ` (was ${ACTION_LABELS[taken]})` : '';
        this.say(`${ACTION_LABELS[target.action]}: ${codeLabel(code)}${moved}`);
      }
    }
    this.refresh();
  }

  private say(text: string, error = false) {
    this.note.textContent = text;
    this.note.classList.toggle('error', error);
  }
}
