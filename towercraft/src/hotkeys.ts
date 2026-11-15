// Desktop shortcuts for the camera, the dock and the menu (layer: this game's own, cosmetic, nothing in the protocol). Pure: `keyAction`
// reads a key event and says what it asks for; `main.ts` does it. The older keys (Esc lets go, Ctrl+A picks all, C / X orders, M mutes, arrows
// and WASD pan) stay in `main.ts`; these are the ones that must not clash with them.

export type KeyAction =
  | { k: 'dock'; n: number } // the Nth building the dock shows now, 1-based
  | { k: 'home' }
  | { k: 'fit' }
  | { k: 'zoom'; by: 1 | -1 };

type Key = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };

/** What a key press asks for, or nothing. Never for a chord with Ctrl, Meta or Alt (the browser's own keys). */
export function keyAction(e: Key): KeyAction | undefined {
  if (e.ctrlKey || e.metaKey || e.altKey) return undefined;
  const k = e.key.toLowerCase();
  if (/^[1-9]$/.test(k)) return { k: 'dock', n: Number(k) };
  if (k === 'h' || k === ' ') return { k: 'home' };
  if (k === 'f') return { k: 'fit' };
  if (k === '+' || k === '=') return { k: 'zoom', by: 1 };
  if (k === '-' || k === '_') return { k: 'zoom', by: -1 };
  return undefined;
}

/** Whether a key press is meant for a text box (the join code): then no shortcut fires. */
export const typing = (target: EventTarget | null): boolean => {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  return t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || !!t?.isContentEditable;
};
