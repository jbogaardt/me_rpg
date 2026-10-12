import type { Item } from '../systems/combat';
import { arrows, SPELLS } from '../systems/spells';

/** What an item adds, as a short line ("+3 ATK, ranged", "+20 HP"); empty for an item with no effect. */
export function bonuses(item: Item): string {
  return [
    item.attack ? `+${item.attack} ATK` : '',
    item.defense ? `+${item.defense} DEF` : '',
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
