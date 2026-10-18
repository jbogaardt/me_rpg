// ASCII pixel grids turned into crisp SVG data (one <rect> per run of pixels, `crispEdges`), so there is no image file to
// ship and the art scales by whole CSS pixels without blurring. Pixi-free.

export type Palette = Record<string, string>;

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
