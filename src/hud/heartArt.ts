// The HUD's pixel art, as ASCII grids turned into crisp SVG data URIs (one <rect> per run of pixels, `crispEdges`), so there
// is no image file to ship and the art scales by whole CSS pixels without blurring. Pixi-free; Hud.ts sets them as CSS
// variables once (`--heart-full`, `--heart-empty`, `--coin`).

const HEART = [
  '..ooo.ooo..',
  '.orrrorrro.',
  'orhhrrrrrro',
  'orhrrrrrrro',
  'orrrrrrrrro',
  '.orrrrrrro.',
  '..orrrrro..',
  '...orrro...',
  '....oro....',
  '.....o.....',
];

const COIN = [
  '..ooooo..',
  '.oyyyyyo.',
  'oyhhyyyyo',
  'oyhyyyyyo',
  'oyyyyyyyo',
  'oyyyyyyyo',
  'oyyyyyydo',
  '.oyyyyyo.',
  '..ooooo..',
];

// The threat pulse's chevron (a mask: its colour comes from the element), tip to the right.
const CHEVRON = ['XX....', '.XX...', '..XX..', '...XX.', '....XX', '....XX', '...XX.', '..XX..', '.XX...', 'XX....'];

type Palette = Record<string, string>;

export const HEART_FULL: Palette = { o: '#1a0b0e', r: '#d9302c', h: '#ff9b8a' };
export const HEART_EMPTY: Palette = { o: '#1a0b0e', r: '#4a2a30', h: '#4a2a30' };
export const COIN_FULL: Palette = { o: '#2b1a05', y: '#e8b32a', h: '#fff0a0', d: '#a8741a' };

/** The SVG of a grid: each run of the same pixel colour in a row is one rect. */
export function gridSvg(rows: readonly string[], palette: Palette): string {
  const w = Math.max(...rows.map((r) => r.length));
  const rects: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = palette[ch];
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`);
      x = end;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${rows.length}" width="${w}" height="${rows.length}" ` +
    `shape-rendering="crispEdges">${rects.join('')}</svg>`
  );
}

const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Pixel size of the art grids (CSS scales them by whole numbers). */
export const HEART_SIZE = { w: HEART[0]!.length, h: HEART.length };
export const COIN_SIZE = { w: COIN[0]!.length, h: COIN.length };

export const heartFullUrl = () => url(gridSvg(HEART, HEART_FULL));
export const heartEmptyUrl = () => url(gridSvg(HEART, HEART_EMPTY));
export const coinUrl = () => url(gridSvg(COIN, COIN_FULL));
export const chevronUrl = () => url(gridSvg(CHEVRON, { X: '#000' }));
