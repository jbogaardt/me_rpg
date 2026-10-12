import type { Item } from '../systems/combat';
import { arrows, SPELLS } from '../systems/spells';

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
    item.focus ? `${item.focus.kind}, ${item.focus.combos.length} combos` : '',
    item.use?.hp ? `+${item.use.hp} HP` : '',
    item.use?.mp ? `+${item.use.mp} MP` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** A wand's or tome's combos as a small list (arrows, spell, mana), or nothing for any other item. */
export function combosHtml(item: Item): string {
  if (!item.focus) return '';
  const rows = item.focus.combos
    .map(
      (c) => `<li><span class="keys">${arrows(c.keys)}</span> ${SPELLS[c.spell].name} <small>${c.cost} MP</small></li>`,
    )
    .join('');
  return `<ul class="combo-list">${rows}</ul>`;
}
