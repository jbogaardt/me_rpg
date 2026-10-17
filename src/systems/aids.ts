// The player's own say over the map's aids (Pixi-free, tested). The map itself is core engine and always on; what sits on
// top of it is optional twice over: the story may switch it off (the `guide` capability: search circle, place star and
// tracker line; the `compass` capability: the arrow round the hero), and the player may switch it off for themselves
// (Controls tab). An aid is shown only when both allow it. The choice is per player and per browser (localStorage), UI
// state like the aim: online it is never sent, each side draws its own screens, and the host's rules do not depend on it.
import { enabled } from './capabilities';

export interface Aids {
  /** The search circle and star on the map, and the tracker line. */
  hints: boolean;
  /** The arrow round the hero. */
  compass: boolean;
}

const STORAGE_KEY = 'me_rpg.aids';

/** Both on: a new player gets the help the story gives. */
export const DEFAULT_AIDS: Readonly<Aids> = { hints: true, compass: true };

export function loadAids(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Aids {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
      hints: typeof o.hints === 'boolean' ? o.hints : DEFAULT_AIDS.hints,
      compass: typeof o.compass === 'boolean' ? o.compass : DEFAULT_AIDS.compass,
    };
  } catch {
    return { ...DEFAULT_AIDS };
  }
}

export function saveAids(aids: Aids, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage()) {
  try {
    if (aids.hints === DEFAULT_AIDS.hints && aids.compass === DEFAULT_AIDS.compass) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, JSON.stringify(aids));
  } catch {
    // private mode or blocked storage: the choice lasts for this visit only
  }
}

/** The player's saved choices (this module's one piece of state). */
export const aidSetting = {
  aids: loadAids(),
  set(key: keyof Aids, on: boolean) {
    this.aids = { ...this.aids, [key]: on };
    saveAids(this.aids);
  },
};

/** Are map hints shown in `zone`: the story allows them and the player has not turned them off. */
export const hintsOn = (zone: string, aids: Aids = aidSetting.aids): boolean => aids.hints && enabled('guide', zone);
/** Is the compass shown in `zone`? */
export const compassOn = (zone: string, aids: Aids = aidSetting.aids): boolean =>
  aids.compass && enabled('compass', zone);

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
