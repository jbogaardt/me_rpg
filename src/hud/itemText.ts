import type { Item } from '../systems/combat';
import { enabled } from '../systems/capabilities';
import { bonusTexts } from '../systems/gems';
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

/** What a gem adds when it is set in a weapon and in other gear ("set in a weapon: +2 ATK; in gear: +1 DEF"); empty for any other item. */
export function gemText(item: Item): string {
  if (!item.gem) return '';
  const arms = bonusTexts(item.gem.arms).join(', ');
  const worn = bonusTexts(item.gem.worn).join(', ');
  return `a gem: in a weapon ${arms}; in other gear ${worn}`;
}

/** What an item adds, as a short line ("+3 ATK, ranged", "+20 HP"); empty for an item with no effect. */
export function bonuses(item: Item): string {
  return [
    item.attack ? `+${item.attack} ATK` : '',
    item.defense ? `+${item.defense} DEF` : '',
    ...buffTexts(item),
    item.ranged ? 'ranged' : '',
    item.focus ? (enabled('combos') ? `${item.focus.kind}, ${item.focus.combos.length} combos` : item.focus.kind) : '',
    item.use?.hp ? `+${item.use.hp} HP` : '',
    item.use?.mp ? `+${item.use.mp} MP` : '',
    item.use?.food ? `+${item.use.food} food` : '',
    item.use?.water ? `+${item.use.water} water` : '',
    gemText(item),
  ]
    .filter(Boolean)
    .join(', ');
}

/** A wand's or tome's combos as a small list (arrows, spell, mana), or nothing for any other item. */
export function combosHtml(item: Item): string {
  if (!item.focus || !enabled('combos')) return '';
  const rows = item.focus.combos
    .map(
      (c) => `<li><span class="keys">${arrows(c.keys)}</span> ${SPELLS[c.spell].name} <small>${c.cost} MP</small></li>`,
    )
    .join('');
  return `<ul class="combo-list">${rows}</ul>`;
}
