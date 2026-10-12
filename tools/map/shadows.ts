// Baked-in drop-shadow colours of the tilesets (kept apart from catalog.ts so image.ts needs no catalog).

/** Baked-in drop-shadow colour on object-layer.png. Ignored when measuring how much a cell is covered. */
export const SHADOW_RGB = [152, 169, 150] as const;
/** Shadow colours of the recoloured sheets (tools/map/recolor.ts), tuned to read on snow and on sand. */
export const SHADOW_FROST = [150, 162, 178] as const;
export const SHADOWS = [SHADOW_RGB, SHADOW_FROST] as const;
