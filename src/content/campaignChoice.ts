// Which world the page plays (Pixi-free, tested): a campaign folder (public/content/<campaign>/), a random campaign
// assembled from the packs with a seed, or a live world (`?campaign=live&seed=N`, optionally `&arc=<id>`) built during
// play by its Dungeon Master. The page's address says which (`?campaign=campaign2`, `?campaign=random`, or a
// `?seed=1234` alone, which means a random one), else the build's default (campaign 1, the sandbox); a random campaign's seed is written into the address, so a reload or a shared link (and a co-op
// join link, which keeps the address) gives the same world.

export const RANDOM = 'random';
/** A live world (content/world.ts): built during play from a story arc, step by step, by its Dungeon Master. */
export const LIVE = 'live';

/** The world a build plays unless told otherwise: campaign 1, the sandbox where new capabilities are built and tried. */
export const DEFAULT_WORLD = 'campaign1';

export interface CampaignChoice {
  /** A campaign folder, `random` or `live`. */
  campaign: string;
  /** The assembler's seed (random and live worlds only). */
  seed: number;
  /** The story arc a live world tells (`?arc=`; absent: the seed picks one). */
  arc?: string;
  /** The address's query to put in place of the page's (null when it is already right). */
  search: string | null;
  /** Names the world, for the co-op handshake and the log: "campaign1", "random:4242". */
  tag: string;
}

const isSeed = (s: string | null): s is string => !!s && /^\d{1,9}$/.test(s);

export function chooseCampaign(search: string, fallback: string, newSeed: () => number): CampaignChoice {
  const params = new URLSearchParams(search);
  const named = params.get('campaign');
  const valid = named && /^[\w-]{1,40}$/.test(named) ? named : null;
  const campaign = valid ?? (isSeed(params.get('seed')) ? RANDOM : fallback); // a seed alone asks for a random world
  if (campaign !== RANDOM && campaign !== LIVE) return { campaign, seed: 0, search: null, tag: campaign };
  const arcParam = params.get('arc');
  const arc = campaign === LIVE && arcParam && /^[\w-]{1,40}$/.test(arcParam) ? arcParam : undefined;
  const given = params.get('seed');
  const seed = isSeed(given) ? Number(given) : newSeed();
  let changed = null;
  if (!isSeed(given)) {
    params.set('seed', String(seed));
    changed = `?${params.toString()}`;
  }
  const tag = `${campaign}:${seed}${arc ? `:${arc}` : ''}`;
  return { campaign, seed, search: changed, tag, ...(arc ? { arc } : {}) };
}

/** What a host may pick as the story in the lobby (hud/Multiplayer.ts); `current` keeps the world the page plays. */
export const HOST_STORIES = [
  { id: 'current', label: 'This world' },
  { id: 'live', label: 'A new story, told as you go' },
  { id: 'campaign1', label: 'The Vale' },
  { id: 'campaign2', label: 'Emberfall Isle' },
] as const;

/** The address query that opens the world a tag names (`live:42`, `campaign2`), or null if it is not a world tag. */
export function queryForTag(tag: string): string | null {
  const [campaign, seed, arc, ...rest] = tag.split(':');
  if (!campaign || rest.length || !/^[\w-]{1,40}$/.test(campaign)) return null;
  if (campaign === RANDOM || campaign === LIVE) {
    if (!isSeed(seed ?? null) || (arc !== undefined && !/^[\w-]{1,40}$/.test(arc))) return null;
    return `?campaign=${campaign}&seed=${seed}${arc ? `&arc=${arc}` : ''}`;
  }
  return seed === undefined ? `?campaign=${campaign}` : null;
}

/**
 * The world (a tag) a host's story choice needs, or null when the page already plays one that fits: a new story keeps
 * a live world already open, and a named campaign keeps itself.
 */
export function worldFor(story: string, currentTag: string, newSeed: () => number): string | null {
  if (story === 'current') return null;
  if (story === LIVE) return currentTag.startsWith(`${LIVE}:`) ? null : `${LIVE}:${newSeed()}`;
  return currentTag === story ? null : story;
}
