import { Assets, Rectangle, Texture } from 'pixi.js';
import { cellOf, type MissileId } from './fxKinds';

/**
 * The effect pictures (art/fx/, CREDITS.md), cut into frames once and shared by every effect. Layouts, from Wyrmsun's missile
 * definitions: a flying missile's sheet has five directions across (up, up-right, RIGHT, down-right, down), so column 2 is the one
 * the game rotates to any heading; a lobbed one has three sizes down (small, medium, large); the others are square frames read
 * left to right, five to a row.
 */
export interface FxArt {
  /** One picture per missile pointing right, or for a lobbed one its three sizes. */
  missiles: Record<MissileId, Texture[]>;
  explosion: Texture[];
  impact: Texture[];
  bigFire: Texture[];
  smallFire: Texture[];
  /** Soft white smoke puffs to tint (soot, ash, dust). */
  smoke: Texture[];
  /** A small dust puff where a missile lands, and a crescent cut for a melee blow. */
  hit: Texture[];
  slash: Texture[];
  /** A building site (two stages) and the scar a fallen building leaves (two sizes). */
  site: Texture[];
  destroyed: Texture[];
  /** Five small rock chips (12 px). */
  shards: Texture[];
}

const FILES = [
  'arrow',
  'goblin_arrow',
  'ballista_bolt',
  'javelin',
  'cannon_ball',
  'catapult_rock',
  'slime_glob',
  'bullet',
  'explosion',
  'impact',
  'big_fire',
  'small_fire',
  'smoke',
  'hit',
  'slash',
  'construction_site',
  'destroyed_site',
  'rock_shard',
] as const;

const cut = (t: Texture, x: number, y: number, w: number, h: number) =>
  new Texture({ source: t.source, frame: new Rectangle(x, y, w, h) });
/** `n` frames of `w` x `h` read in rows of `cols`. */
const grid = (t: Texture, n: number, cols: number, w: number, h = w) =>
  Array.from({ length: n }, (_, i) => {
    const [x] = cellOf(i, cols, w);
    const y = Math.floor(i / cols) * h;
    return cut(t, x, y, w, h);
  });

/** Fetch and cut all of them (about 100 kB). */
export async function loadFxArt(): Promise<FxArt> {
  const tex = {} as Record<(typeof FILES)[number], Texture>;
  await Promise.all(FILES.map(async (n) => void (tex[n] = await Assets.load<Texture>(`art/fx/${n}.png`))));
  const right = (t: Texture, size: number) => [cut(t, size * 2, 0, size, size)];
  const sizes = (t: Texture, w: number) => [0, 1, 2].map((r) => cut(t, 0, r * w, w, w));
  return {
    missiles: {
      arrow: right(tex.arrow, 32),
      goblin_arrow: right(tex.goblin_arrow, 32),
      bolt: right(tex.ballista_bolt, 64),
      javelin: right(tex.javelin, 48),
      bullet: sizes(tex.bullet, 32).slice(1, 2),
      cannon: sizes(tex.cannon_ball, 32),
      rock: sizes(tex.catapult_rock, 32),
      slime: [0, 1, 2].map((r) => cut(tex.slime_glob, 64, r * 32, 32, 32)),
    },
    explosion: grid(tex.explosion, 22, 5, 64),
    impact: grid(tex.impact, 10, 5, 48),
    bigFire: grid(tex.big_fire, 10, 5, 48),
    smallFire: grid(tex.small_fire, 10, 5, 32, 48),
    smoke: grid(tex.smoke, 6, 6, 128),
    hit: grid(tex.hit, 6, 6, 32),
    slash: grid(tex.slash, 6, 6, 48),
    site: [cut(tex.construction_site, 0, 0, 64, 64), cut(tex.construction_site, 0, 64, 64, 64)],
    destroyed: [cut(tex.destroyed_site, 0, 0, 64, 64), cut(tex.destroyed_site, 0, 64, 64, 64)],
    shards: grid(tex.rock_shard, 5, 5, 12),
  };
}
