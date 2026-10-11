import type { IconKind } from '../systems/inventory';

// Small flat icons for the pack screen, drawn as inline SVG in `currentColor` (the slot's tier colour) with a dark
// outline. Items have no art of their own: the sprites only exist as paper-doll layers.

const ICONS: Record<IconKind, string> = {
  sword:
    '<path d="M12 1.5l2 2.5v9.5h-4V4z"/><rect x="6.5" y="13.5" width="11" height="2.5" rx="1"/><rect x="10.5" y="16" width="3" height="5"/><circle cx="12" cy="22" r="1.4"/>',
  bow: '<path d="M6 2.5c11 3 11 16 0 19" fill="none" stroke-width="2.6"/><path d="M6 2.5v19" fill="none" stroke-width="1" stroke="#e8dcc0"/><path d="M8 12h12m-3-3l3 3-3 3" fill="none" stroke="#e8dcc0" stroke-width="1.2"/>',
  dagger:
    '<path d="M12 2l2.2 3.5V14h-4.4V5.5z"/><rect x="7.5" y="14" width="9" height="2.4" rx="1"/><rect x="10.8" y="16.4" width="2.4" height="5"/>',
  shield:
    '<path d="M12 2.5l8 2.8v6.2c0 5-3.6 8.2-8 10-4.4-1.8-8-5-8-10V5.3z"/><path d="M12 6v12" stroke="#2b1d0e" stroke-width="1" opacity=".5"/>',
  helm: '<path d="M4.5 19v-7.5a7.5 7.5 0 0115 0V19h-4.5v-4.5h-6V19z"/><rect x="8.5" y="10" width="7" height="2" fill="#2b1d0e" stroke="none" opacity=".6"/>',
  armor: '<path d="M8 3l4 2 4-2 5.5 4-3 4.2-2-1.2V21H7.5V11L5.5 12.2l-3-4.2z"/>',
  greaves: '<path d="M6.5 3h11v5l-1.5 13h-4.2V9.5L10.2 21H6.5L8 8z"/>',
  boot: '<path d="M8 3h7v9l6 3.2V21H4.5v-6.5L8 12z"/>',
  cape: '<path d="M7 3h10l3.5 17-8.5-3-8.5 3z"/><rect x="9" y="2.5" width="6" height="2.5" rx="1"/>',
  tool: '<rect x="3" y="9" width="18" height="6.5" rx="3" transform="rotate(-30 12 12)"/><path d="M17.5 3.5v3m-1.5-1.5h3" fill="none" stroke="#e8dcc0" stroke-width="1.3"/>',
  sack: '<path d="M9 2.5h6l-1.2 3.2c3.8 1.8 6 5.4 6 9.3 0 3.4-3.2 6-7.8 6S4.2 18.4 4.2 15c0-3.9 2.2-7.5 6-9.3z"/><path d="M9.5 6.2h5" fill="none" stroke="#e8dcc0" stroke-width="1.4"/>',
  backpack:
    '<path d="M8 6a4 4 0 018 0h.5A3.5 3.5 0 0120 9.5v10a2 2 0 01-2 2H6a2 2 0 01-2-2v-10A3.5 3.5 0 017.5 6z"/><rect x="7.5" y="13.5" width="9" height="5.5" rx="1.2" fill="#2b1d0e" stroke="none" opacity=".45"/>',
};

/** Markup for an icon; colour it with CSS `color`. */
export function iconSvg(kind: IconKind): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="#2b1d0e" stroke-width="1.1" stroke-linejoin="round">${ICONS[kind]}</svg>`;
}
