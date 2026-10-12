import { MOB_KINDS } from '../systems/combat';
import { ITEMS } from '../systems/items';
import { SITE_KINDS, type Quest } from '../systems/quests';
import { itemIcon } from './itemIcons';

/** Pictures for the quest page: what the thing a quest wants looks like, so the player knows it when they see it. */

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** The same little shapes the world draws for a quest site (entities/QuestSite.ts), as a picture. */
function siteSvg(kind: string): string {
  const site = SITE_KINDS[kind];
  if (!site) return '';
  const [main, glow] = [hex(site.color), hex(site.glow)];
  const shape =
    site.shape === 'mushroom'
      ? `<rect x="14" y="17" width="4" height="9" fill="#e8e0d0"/><ellipse cx="16" cy="16" rx="9" ry="7" fill="${main}"/><circle cx="13" cy="14" r="1.6" fill="#fff"/>`
      : site.shape === 'stone'
        ? `<path d="M8 28 L10 6 L16 2 L22 6 L24 28 Z" fill="${main}"/><path d="M13 22 L16 10 L19 22" fill="none" stroke="${glow}" stroke-width="1.6"/>`
        : `<ellipse cx="16" cy="23" rx="12" ry="6" fill="#d9b45a"/><ellipse cx="16" cy="19" rx="8" ry="4.5" fill="${main}"/><circle cx="13" cy="17" r="1.3" fill="#fff"/>`;
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="${glow}" opacity=".28"/>${shape}</svg>`;
}

/**
 * The picture and caption for a quest's target: the monster's portrait (`portrait` makes one for a MOB_KINDS key), the
 * glowing thing to gather, or the item to bring. Empty markup when there is nothing to show.
 */
export function questArt(q: Quest, portrait: (mobKind: string) => string | null): string {
  const o = q.objective;
  let picture: string;
  let caption: string;
  if (o.t === 'kill') {
    const src = portrait(o.kind);
    picture = src ? `<img src="${src}" alt="" />` : '';
    caption = MOB_KINDS[o.kind]?.name ?? '';
  } else if (o.t === 'gather') {
    picture = siteSvg(o.site);
    caption = SITE_KINDS[o.site]?.name ?? '';
  } else {
    const item = ITEMS[o.item];
    picture = `<span class="item-art tier${'rare' in item ? 4 : 1}">${itemIcon(item)}</span>`;
    caption = item.name;
  }
  return picture ? `<figure class="quest-art">${picture}<figcaption>${caption}</figcaption></figure>` : '';
}
