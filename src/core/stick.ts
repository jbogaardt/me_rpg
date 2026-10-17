// Pixi-free maths and settings for the on-screen movement stick (`touch.ts` does the DOM). Two modes: `fixed`
// (the pad sits in the corner) and `floating` (the pad appears under the thumb where it first touches the left half of
// the screen and follows it, so the thumb never drifts off-centre in a long fight). The deadzone is the fraction of the
// pad radius where the thumb does nothing. Input only: a guest and the host read the same keys, no protocol change.

export type StickMode = 'fixed' | 'floating';
export interface StickSettings {
  mode: StickMode;
  /** Fraction of the pad radius (0.05 to 0.6) inside which the thumb does nothing. */
  deadzone: number;
}
export type StickDir = 'right' | 'left' | 'down' | 'up';

export const DEFAULT_STICK: StickSettings = { mode: 'floating', deadzone: 0.25 };
export const DEADZONE_RANGE = [0.05, 0.6] as const;
const DIAGONAL = Math.sin(Math.PI / 8); // axis share needed to count, giving 8 equal 45° sectors
const STORE_KEY = 'touchStick';

export function clampDeadzone(v: number): number {
  return Number.isFinite(v) ? Math.min(DEADZONE_RANGE[1], Math.max(DEADZONE_RANGE[0], v)) : DEFAULT_STICK.deadzone;
}

/** Read untrusted data (storage, address) into settings; anything invalid falls back to the default. */
export function parseStick(raw: unknown): StickSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    mode: o.mode === 'fixed' || o.mode === 'floating' ? o.mode : DEFAULT_STICK.mode,
    deadzone: typeof o.deadzone === 'number' ? clampDeadzone(o.deadzone) : DEFAULT_STICK.deadzone,
  };
}

export function loadStick(search = ''): StickSettings {
  let saved: unknown = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    /* no storage: defaults */
  }
  const s = parseStick(saved);
  const q = new URLSearchParams(search);
  const mode = q.get('stick');
  if (mode === 'fixed' || mode === 'floating') s.mode = mode;
  const dz = q.get('deadzone');
  if (dz !== null && dz !== '') s.deadzone = clampDeadzone(Number(dz));
  return s;
}

export function saveStick(s: StickSettings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Which of the four directions a thumb offset (from the pad centre) holds; two at once make a diagonal. */
export function stickDirs(dx: number, dy: number, radius: number, deadzone: number): Set<StickDir> {
  const on = new Set<StickDir>();
  const dist = Math.hypot(dx, dy);
  if (dist <= radius * deadzone || dist === 0) return on;
  if (dx > dist * DIAGONAL) on.add('right');
  if (dx < -dist * DIAGONAL) on.add('left');
  if (dy > dist * DIAGONAL) on.add('down');
  if (dy < -dist * DIAGONAL) on.add('up');
  return on;
}

/** Keep a floating pad's centre fully on screen. */
export function clampAnchor(x: number, y: number, radius: number, w: number, h: number): { x: number; y: number } {
  const c = (v: number, max: number) => Math.min(Math.max(v, radius), Math.max(radius, max - radius));
  return { x: c(x, w), y: c(y, h) };
}

/** A floating pad drags along when the thumb strays past its rim, so the thumb never ends up far from the centre. */
export function followAnchor(ax: number, ay: number, px: number, py: number, radius: number): { x: number; y: number } {
  const dx = px - ax;
  const dy = py - ay;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return { x: ax, y: ay };
  const k = (dist - radius) / dist;
  return { x: ax + dx * k, y: ay + dy * k };
}
