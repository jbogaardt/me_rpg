// Which world the page plays (Pixi-free, tested): a campaign folder (public/content/<campaign>/) or a random campaign
// assembled from the packs with a seed. The page's address says which (`?campaign=campaign2`, `?campaign=random`, or a
// `?seed=1234` alone, which means a random one), else the build's default (campaign 1, the sandbox); a random campaign's seed is written into the address, so a reload or a shared link (and a co-op
// join link, which keeps the address) gives the same world.

export const RANDOM = 'random';

/** The world a build plays unless told otherwise: campaign 1, the sandbox where new capabilities are built and tried. */
export const DEFAULT_WORLD = 'campaign1';

export interface CampaignChoice {
  /** A campaign folder, or `random`. */
  campaign: string;
  /** The assembler's seed (random campaigns only). */
  seed: number;
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
  if (campaign !== RANDOM) return { campaign, seed: 0, search: null, tag: campaign };
  const given = params.get('seed');
  const seed = isSeed(given) ? Number(given) : newSeed();
  let changed = null;
  if (!isSeed(given)) {
    params.set('seed', String(seed));
    changed = `?${params.toString()}`;
  }
  return { campaign, seed, search: changed, tag: `${RANDOM}:${seed}` };
}
