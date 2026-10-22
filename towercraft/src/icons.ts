// The small pictures of the stat cards, drawn in code (24x24, one colour, `currentColor`): a heart for health, a sword for damage, a
// running man for speed, and one for each way a unit or building fights (flies, hits air, area, several at once, siege, bomb, bow,
// poison...), so a card is read at a glance. Smooth strokes, not pixel art. DOM-free: `icon(name)` is an SVG string.

type Style = 'line' | 'fill';
const DRAW: Record<string, [Style, string]> = {
  heart: [
    'fill',
    '<path d="M12 21.2l-1.4-1.3C5.4 15.200 2 12.100 2 8.400 2 5.400 4.400 3 7.400 3c1.700 0 3.400.8 4.600 2.100C13.200 3.800 14.900 3 16.600 3 19.600 3 22 5.400 22 8.400c0 3.700-3.400 6.800-8.600 11.500L12 21.200z"/>',
  ],
  sword: [
    'line',
    '<path d="M20 4L10.500 13.500" style="stroke-width:3.400"/><path d="M7 11l6 6" style="stroke-width:2.800"/><path d="M9.500 14.500L5 19" style="stroke-width:3"/><circle cx="4.200" cy="19.800" r="1.700" class="f"/>',
  ],
  runner: [
    'line',
    '<circle cx="15.500" cy="4.600" r="2.300" class="f"/><path d="M14 9L11 13l3.500 2.500v5M11 13l-4 1M14 9l3.600 3 2.400-1M14.500 15.500l3.500 1.500.7 4M11 13.500l-1.500 3.500-3.500 2" style="stroke-width:2.800"/>',
  ],
  wing: [
    'fill',
    '<path d="M2.500 13.500c4.500-.5 7-3.500 9-9 1.200 4 3 6.200 6 7 2.200.6 3.400 2.200 4 4.500-3-1.300-5.200-.8-7 .7-1.800-1.600-6-2.500-12-3.200z"/>',
  ],
  ghost: [
    'fill',
    '<path fill-rule="evenodd" d="M12 3a7 7 0 0 0-7 7v10.500l2.400-2 2.300 2 2.300-2 2.300 2 2.300-2 2.400 2V10a7 7 0 0 0-7-7zM9.500 9a1.300 1.300 0 1 1 0 2.600 1.300 1.300 0 0 1 0-2.600zm5 0a1.300 1.300 0 1 1 0 2.600 1.300 1.300 0 0 1 0-2.600z"/>',
  ],
  skyhit: ['line', '<path d="M12 21V5M6 11l6-6 6 6"/><path d="M5 21h14" opacity=".55"/>'],
  area: [
    'line',
    '<circle cx="12" cy="12" r="3.200" class="f"/><path d="M12 2.500v3.300M12 18.200v3.300M2.500 12h3.300M18.200 12h3.300M5.300 5.300l2.300 2.300M16.400 16.400l2.300 2.300M18.700 5.300l-2.300 2.300M7.600 16.400l-2.300 2.300"/>',
  ],
  multi: ['line', '<path d="M12 21L3.800 6M12 21V3.500M12 21l8.200-15"/><circle cx="12" cy="21" r="1.300" class="f"/>'],
  siege: [
    'line',
    '<path d="M5 20.500V9.500h3v-3h2.200v3h3.600v-3H16v3h3v11z"/><path d="M12.500 11.500l-2 3 2.500 1.500-1.500 3.500"/>',
  ],
  bomb: [
    'line',
    '<circle cx="10.500" cy="14" r="6.200" class="f"/><path d="M15 9.500l3-3M17.500 3.500v2.200M19.800 6h-2.200M21 4l-1.200 1.200"/>',
  ],
  bow: [
    'line',
    '<path d="M6.500 3.500c9 2.500 9 14.500 0 17M6.500 3.500v17M3 12h15.500M15.500 8.800l3.200 3.200-3.200 3.200"/>',
  ],
  shield: ['line', '<path d="M12 3l8 3v6c0 5-3.500 8-8 9.200C7.500 20 4 17 4 12V6z" class="f"/>'],
  drop: [
    'fill',
    '<path d="M12 2.800c4.200 5 6.300 8.200 6.300 11.200a6.300 6.300 0 0 1-12.600 0c0-3 2.100-6.200 6.300-11.200z"/>',
  ],
  ring: [
    'line',
    '<circle cx="12" cy="12" r="2.800" class="f"/><circle cx="12" cy="12" r="8.500" stroke-dasharray="3 3"/>',
  ],
  heal: ['line', '<path d="M12 5v14M5 12h14" stroke-width="3.600"/>'],
  power: ['line', '<path d="M6 14.500l6-6 6 6M6 20l6-6 6 6"/>'],
  eye: ['line', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" class="f"/>'],
  reach: ['line', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="1.800" class="f"/>'],
  range: [
    'line',
    '<circle cx="12" cy="12" r="6.800"/><circle cx="12" cy="12" r="1.600" class="f"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  ],
  ground: ['line', '<path d="M2.500 19.500h19M5 19.500l4.500-9 3.500 5 2.500-4 4 8"/>'],
  unlock: [
    'line',
    '<rect x="5" y="11" width="14" height="9.500" rx="2" class="f"/><path d="M8 11V8a4 4 0 0 1 7.700-1.500"/>',
  ],
  locked: [
    'line',
    '<rect x="5" y="11" width="14" height="9.500" rx="2" class="f"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ],
};

/** A card icon as an inline SVG (it takes the text colour; give it a size in CSS). */
export function icon(name: string, title = ''): string {
  const [style, body] = DRAW[name] ?? DRAW['range']!;
  const label = title ? `<title>${title}</title>` : '';
  return `<svg class="ic ${style}" viewBox="0 0 24 24" role="img" aria-label="${title || name}">${label}${body}</svg>`;
}
