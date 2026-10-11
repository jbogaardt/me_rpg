// Rebindable keyboard/mouse controls (Pixi-free). Each action has two slots, a code per slot: a
// `KeyboardEvent.code` ('KeyW', 'Space') or a mouse button ('Mouse0' = left, 'Mouse2' = right).
// Touch controls are not rebindable; they press fixed codes (see touch.ts, TOUCH_CODES below).

export const ACTIONS = ['up', 'down', 'left', 'right', 'attack', 'magic', 'inventory'] as const;
export type Action = (typeof ACTIONS)[number];
export const SLOTS = 2;

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  attack: 'Attack / talk',
  magic: 'Magic',
  inventory: 'Inventory',
};

export type Slots = readonly [string, string]; // '' = unbound

export const DEFAULT_BINDINGS: Record<Action, Slots> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'Space'],
  magic: ['Mouse2', 'KeyK'],
  inventory: ['KeyI', ''],
};

/** What the on-screen buttons press, whatever the keyboard is bound to. */
export const TOUCH_CODES: Record<Action, readonly string[]> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  attack: ['KeyJ'],
  magic: ['KeyK'],
  inventory: ['KeyI'],
};

/** Fixed keys (menu, map, cancel); they can't be bound to an action. */
export const RESERVED_CODES = ['Escape', 'Tab', 'KeyM'];

const STORAGE_KEY = 'me_rpg.controls';

export function isMouseCode(code: string): boolean {
  return /^Mouse\d$/.test(code);
}

const MOUSE_NAMES = ['Left click', 'Middle click', 'Right click'];
const SPECIAL_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
};

/** A short name for a code: 'KeyW' → 'W', 'Mouse2' → 'Right click'. */
export function codeLabel(code: string): string {
  if (!code) return '—';
  if (isMouseCode(code)) return MOUSE_NAMES[Number(code.slice(5))] ?? `Mouse ${code.slice(5)}`;
  return SPECIAL_NAMES[code] ?? code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'Num ');
}

function isSlots(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === SLOTS && v.every((c) => typeof c === 'string' && c.length <= 24);
}

export class Bindings {
  private map = new Map<Action, [string, string]>();

  constructor(saved?: unknown) {
    this.reset();
    if (typeof saved === 'object' && saved !== null) {
      for (const action of ACTIONS) {
        const slots = (saved as Record<string, unknown>)[action];
        if (isSlots(slots) && slots.every((c) => !RESERVED_CODES.includes(c))) this.map.set(action, [...slots]);
      }
      this.dropDuplicates();
    }
  }

  /** Every code bound to the action (empty slots left out). */
  codes(action: Action): string[] {
    return this.slots(action).filter((c) => c !== '');
  }

  slots(action: Action): Slots {
    return this.map.get(action) ?? DEFAULT_BINDINGS[action];
  }

  /** Bind `code` to a slot. The code is taken from whichever other slot held it. Returns an error message, or null. */
  set(action: Action, slot: number, code: string): string | null {
    if (slot < 0 || slot >= SLOTS) return 'No such slot.';
    if (RESERVED_CODES.includes(code)) return `${codeLabel(code)} is reserved for the menu and map.`;
    for (const other of ACTIONS) {
      const s = this.map.get(other)!;
      for (let i = 0; i < SLOTS; i++) if (s[i] === code) s[i] = '';
    }
    this.map.get(action)![slot] = code;
    return null;
  }

  clear(action: Action, slot: number) {
    const s = this.map.get(action);
    if (s && slot >= 0 && slot < SLOTS) s[slot] = '';
  }

  /** The action that uses `code`, if any. */
  actionFor(code: string): Action | undefined {
    return ACTIONS.find((a) => this.slots(a).includes(code));
  }

  reset() {
    for (const action of ACTIONS) this.map.set(action, [...DEFAULT_BINDINGS[action]]);
  }

  isDefault(): boolean {
    return ACTIONS.every((a) => this.slots(a).every((c, i) => c === DEFAULT_BINDINGS[a][i]));
  }

  toJSON(): Record<string, string[]> {
    return Object.fromEntries(ACTIONS.map((a) => [a, [...this.slots(a)]]));
  }

  private dropDuplicates() {
    const seen = new Set<string>();
    for (const action of ACTIONS) {
      const s = this.map.get(action)!;
      for (let i = 0; i < SLOTS; i++) {
        if (s[i] && seen.has(s[i]!)) s[i] = '';
        else if (s[i]) seen.add(s[i]!);
      }
    }
  }
}

/** Load saved bindings (defaults when nothing valid is saved or storage is unavailable). */
export function loadBindings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Bindings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return new Bindings(raw ? (JSON.parse(raw) as unknown) : undefined);
  } catch {
    return new Bindings();
  }
}

export function saveBindings(
  b: Bindings,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
) {
  try {
    if (b.isDefault()) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // private mode or blocked storage: the bindings last for this visit only
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
