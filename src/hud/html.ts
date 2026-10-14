// Text into HTML. Names, quest text and lines are content (a campaign's files, a pack, a live world's Dungeon Master,
// later perhaps a database or an AI), never markup: escape every content string a template puts into innerHTML, or
// build the nodes with textContent (hud/Party.ts, Cast.ts, StoryTab.ts). Pixi-free and tested.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** `text` safe to put into HTML, between tags or in a quoted attribute. */
export const esc = (text: string | number): string => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]!);
