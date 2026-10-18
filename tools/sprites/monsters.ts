// Repacks the "[LPC] Monsters" sheets (art/lpc_monsters/, see CREDITS-monsters.txt) into doll sheets (src/sprites/doll.ts), one
// whole body each, written next to them as <name>_doll.png and listed in `CUSTOM_PARTS` (sprites/parts.ts). The source
// sheets have four rows (up, left, down, right: the doll's order) of 32 or 64 px frames: a few idle and move frames, then
// the attack frames. Each monster below says which source column plays in which pose; the feet are aligned to the doll's
// ground line. A hurt pose is the pack's own flash frame where it has one, else the idle frame flashed white.
// Run with `npm run monsters`; the output is committed, then `npm run sprites -- build body.<name> ...` packs it.

import path from 'node:path';
import { readPng, ROOT, writePng, type Image } from '../map/image';
import { blank, crop, over } from '../map/compose';
import { ANIMS, DOLL_HEIGHT, DOLL_WIDTH, FEET_Y_64, frameRect, type AnimName } from '../../src/sprites/doll';
import type { Direction } from '../../src/core/direction';

interface Monster {
  /** Source frame edge in px. */
  size: 32 | 64;
  /** Source columns for the eight stride frames of a walk. */
  walk: number[];
  /** Source columns for the idle blink (two frames). */
  idle: [number, number];
  /** Source columns for the attack, six frames (windup first); the cast pose plays the same. */
  attack: number[];
  /** A column that is already a hurt flash, else the idle frame is flashed white. */
  hurt?: number;
}

export const MONSTERS: Record<string, Monster> = {
  slime: { size: 64, walk: [0, 1, 2, 4, 5, 3, 1, 0], idle: [0, 1], attack: [1, 2, 4, 4, 5, 3] },
  bat: { size: 64, walk: [1, 2, 3, 4, 5, 6, 3, 2], idle: [2, 4], attack: [2, 3, 5, 5, 6, 4] },
  snake: { size: 64, walk: [0, 1, 2, 3, 0, 1, 2, 3], idle: [0, 3], attack: [0, 3, 4, 4, 5, 0] },
  ghost: { size: 64, walk: [0, 1, 2, 1, 0, 1, 2, 1], idle: [0, 1], attack: [1, 2, 4, 4, 5, 0], hurt: 3 },
  eyeball: { size: 64, walk: [0, 1, 2, 3, 0, 1, 2, 3], idle: [0, 1], attack: [1, 2, 4, 4, 5, 5] },
  pumpking: { size: 64, walk: [0, 1, 2, 1, 0, 1, 2, 1], idle: [0, 1], attack: [0, 2, 3, 4, 4, 5] },
  big_worm: { size: 64, walk: [0, 1, 2, 3, 0, 1, 2, 3], idle: [0, 1], attack: [0, 1, 4, 4, 4, 5] },
  bee: { size: 32, walk: [0, 1, 2, 3, 4, 5, 2, 1], idle: [0, 1], attack: [0, 1, 2, 3, 4, 5] },
};

const DIRS: Direction[] = ['up', 'left', 'down', 'right'];

/** The lowest opaque row of a frame, or -1. */
function bottomOf(frame: Image): number {
  for (let y = frame.height - 1; y >= 0; y--)
    for (let x = 0; x < frame.width; x++) if (frame.data[(y * frame.width + x) * 4 + 3] > 0) return y;
  return -1;
}

/** `frame` with every colour pulled toward white. */
function flashed(frame: Image, amount = 0.7): Image {
  const out = { ...frame, data: Buffer.from(frame.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] + (255 - out.data[i + c]) * amount);
  }
  return out;
}

export function dollOf(name: string, m: Monster): Image {
  const src = readPng(path.join(ROOT, `art/lpc_monsters/${name}.png`));
  const frame = (dir: Direction, col: number) => crop(src, col * m.size, DIRS.indexOf(dir) * m.size, m.size, m.size);
  // One shift for the whole monster, so its feet do not jump between poses.
  let bottom = 0;
  for (const dir of DIRS)
    for (const col of [...m.walk, ...m.idle, ...m.attack]) bottom = Math.max(bottom, bottomOf(frame(dir, col)));
  const dx = (64 - m.size) / 2;
  const dy = FEET_Y_64 - 1 - bottom;
  const doll = blank(DOLL_WIDTH, DOLL_HEIGHT);
  const put = (anim: AnimName, dir: Direction, col: number, img: Image) => {
    const r = frameRect(anim, dir, col);
    over(doll, img, r.x + dx + (r.w - 64) / 2, r.y + dy + (r.h - 64) / 2);
  };
  for (const dir of DIRS) {
    put('walk', dir, 0, frame(dir, m.idle[0]));
    m.walk.forEach((col, i) => put('walk', dir, i + 1, frame(dir, col)));
    m.idle.forEach((col, i) => put('idle', dir, i, frame(dir, col)));
    for (let i = 0; i < ANIMS.slash.cols; i++) put('slash', dir, i, frame(dir, m.attack[i % m.attack.length]));
    for (let i = 0; i < ANIMS.cast.cols; i++)
      put('cast', dir, i, frame(dir, m.attack[Math.min(i, m.attack.length - 1)]));
  }
  const rest = frame('down', m.idle[0]);
  const hurt = m.hurt === undefined ? flashed(rest) : frame('down', m.hurt);
  for (let i = 0; i < ANIMS.hurt.cols; i++) put('hurt', 'down', i, i % 2 === 0 ? hurt : rest);
  return doll;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, m] of Object.entries(MONSTERS)) {
    writePng(path.join(ROOT, `art/lpc_monsters/${name}_doll.png`), dollOf(name, m));
    console.log(`wrote ${name}_doll.png`);
  }
}
