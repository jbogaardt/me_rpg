// Pure rules of the pickup toasts (no DOM): a short stack of one-line notes that leave quickly, and sooner in combat.

export const TOAST_SECONDS = 2.2;
export const TOAST_COMBAT_SECONDS = 1.0;
export const MAX_TOASTS = 3;

export interface Toast {
  text: string;
  /** Seconds left on screen. */
  left: number;
  /** How many of the same thing in a row ("Potion x2"). */
  count: number;
}

/** Add a pickup: the same item again as the newest toast counts up and restarts its time; the oldest leaves when full. */
export function pushToast(stack: readonly Toast[], text: string, inCombat: boolean): Toast[] {
  const life = inCombat ? TOAST_COMBAT_SECONDS : TOAST_SECONDS;
  const top = stack[stack.length - 1];
  if (top && top.text === text) return [...stack.slice(0, -1), { text, left: life, count: top.count + 1 }];
  return [...stack, { text, left: life, count: 1 }].slice(-MAX_TOASTS);
}

/** Let `dt` seconds pass; in combat a toast already showing is cut down to the combat time. */
export function tickToasts(stack: readonly Toast[], dt: number, inCombat: boolean): Toast[] {
  return stack
    .map((t) => ({ ...t, left: Math.min(t.left, inCombat ? TOAST_COMBAT_SECONDS : t.left) - dt }))
    .filter((t) => t.left > 0);
}

export function toastLabel(t: Toast): string {
  return t.count > 1 ? `${t.text} x${t.count}` : t.text;
}
