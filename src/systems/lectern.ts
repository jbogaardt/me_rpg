// Lecterns: reading stands that tell the player something when the action key is pressed next to one. For now there is
// one, in the wizard's sanctum, listing every combo of every wand and tome. Pure; the map places the prop
// (maps/shop_wizard.ts) and the overworld scene opens the dialog (OverworldScene.handleAction).

import { ITEMS } from './items';
import { arrows, SPELLS } from './spells';

/** Where each lectern stands: the zone and the bottom-left cell of its prop. */
export const LECTERNS = { shop_wizard: { col: 8, row: 6 } } as const;

/** Is there a lectern in `zone`, and where (its feet, in pixels)? */
export function lecternIn(zone: string, cell = 32): { x: number; y: number } | null {
  const at = (LECTERNS as Record<string, { col: number; row: number } | undefined>)[zone];
  return at ? { x: (at.col + 0.5) * cell, y: (at.row + 1) * cell } : null;
}

/** What the lectern says: a first page, then one page per wand or tome with each of its combos. */
export function lecternPages(): string[] {
  const pages = [
    'Tap the arrows in order (W A S D, or the D-pad) with a wand or tome in hand, and its spell goes off for MP.',
  ];
  for (const item of Object.values(ITEMS)) {
    if (!('focus' in item)) continue;
    const combos = item.focus.combos.map((c) => `${arrows(c.keys)} ${SPELLS[c.spell].name} (${c.cost} MP)`);
    pages.push(`${item.name}: ${combos.join('   ')}`);
  }
  return pages;
}
