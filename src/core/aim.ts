// How weapons and magic are aimed (Pixi-free). 'move' is the original way: you aim along the way you last walked. 'mouse'
// aims at the mouse pointer (on a touch screen: at the spot last tapped on the game). Saved in localStorage.

export const AIM_MODES = ['move', 'mouse'] as const;
export type AimMode = (typeof AIM_MODES)[number];

export const DEFAULT_AIM_MODE: AimMode = 'move';

const STORAGE_KEY = 'me_rpg.aim';

export interface Aim {
  x: number;
  y: number;
}

/** The unit vector from (fromX, fromY) toward (toX, toY), or null when they are (nearly) the same point. */
export function aimToward(fromX: number, fromY: number, toX: number, toY: number): Aim | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  return len < 4 ? null : { x: dx / len, y: dy / len };
}

/** An aim goes over the wire as one of this many directions around the circle (about 5.6° apart): 1..AIM_STEPS. */
export const AIM_STEPS = 64;

/** The wire form of an aim: a whole number from 1 to AIM_STEPS. */
export function encodeAim(aim: Aim): number {
  const turn = Math.atan2(aim.y, aim.x) / (2 * Math.PI); // -0.5..0.5 of a full turn
  return ((Math.round(turn * AIM_STEPS) + AIM_STEPS) % AIM_STEPS) + 1;
}

export function decodeAim(code: number): Aim {
  const angle = ((code - 1) / AIM_STEPS) * 2 * Math.PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function isAimMode(v: unknown): v is AimMode {
  return typeof v === 'string' && (AIM_MODES as readonly string[]).includes(v);
}

export function loadAimMode(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): AimMode {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return isAimMode(raw) ? raw : DEFAULT_AIM_MODE;
  } catch {
    return DEFAULT_AIM_MODE;
  }
}

export function saveAimMode(
  mode: AimMode,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
) {
  try {
    if (mode === DEFAULT_AIM_MODE) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, mode);
  } catch {
    // private mode or blocked storage: the choice lasts for this visit only
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
