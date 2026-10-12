import type { Item } from '../systems/combat';

/** The buffs gear gives beyond attack and defense, as short pieces ("+8% speed"). Quest rewards carry them. */
export function buffTexts(item: Item): string[] {
  return [
    item.speed ? `+${item.speed}% speed` : '',
    item.magic ? `+${item.magic} magic` : '',
    item.regen ? `+${item.regen} HP/s` : '',
    item.mpRegen ? `+${item.mpRegen} MP/s` : '',
    item.xpBonus ? `+${item.xpBonus}% XP` : '',
    item.goldBonus ? `+${item.goldBonus}% gold` : '',
  ].filter(Boolean);
}

/** What an item adds, as a short line ("+3 ATK, ranged", "+20 HP"); empty for an item with no effect. */
export function bonuses(item: Item): string {
  return [
    item.attack ? `+${item.attack} ATK` : '',
    item.defense ? `+${item.defense} DEF` : '',
    ...buffTexts(item),
    item.ranged ? 'ranged' : '',
    item.use?.hp ? `+${item.use.hp} HP` : '',
    item.use?.mp ? `+${item.use.mp} MP` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
