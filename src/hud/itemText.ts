import type { Item } from '../systems/combat';

/** What an item adds, as a short line ("+3 ATK, ranged", "+20 HP"); empty for an item with no effect. */
export function bonuses(item: Item): string {
  return [
    item.attack ? `+${item.attack} ATK` : '',
    item.defense ? `+${item.defense} DEF` : '',
    item.ranged ? 'ranged' : '',
    item.use?.hp ? `+${item.use.hp} HP` : '',
    item.use?.mp ? `+${item.use.mp} MP` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
