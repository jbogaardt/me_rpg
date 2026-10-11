import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { encodePng, type Image } from './image';

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): Image {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

const decode = (buf: Buffer) => PNG.sync.read(buf);

describe('encodePng', () => {
  it('round-trips a few-colour image as an indexed PNG, keeping translucent pixels', () => {
    const colours: [number, number, number, number][] = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 128, 255, 128],
      [10, 20, 30, 255],
      [200, 200, 0, 40],
    ];
    const img = image(13, 7, (x, y) => colours[(x * 3 + y) % colours.length]);
    const buf = encodePng(img);
    expect(buf[25]).toBe(3); // IHDR colour type: palette
    const out = decode(buf);
    expect([out.width, out.height]).toEqual([13, 7]);
    expect(Buffer.from(out.data).equals(img.data)).toBe(true);
  });

  it('packs tiny palettes into fewer bits per pixel', () => {
    const img = image(9, 3, (x) => (x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const buf = encodePng(img);
    expect(buf[24]).toBe(1); // IHDR bit depth
    expect(Buffer.from(decode(buf).data).equals(img.data)).toBe(true);
  });

  it('stores invisible pixels as transparent black', () => {
    const img = image(4, 4, (x) => (x < 2 ? [90, 80, 70, 0] : [1, 2, 3, 255]));
    const out = decode(encodePng(img));
    expect([...out.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...out.data.subarray(8, 12)]).toEqual([1, 2, 3, 255]);
  });

  it('keeps images with more than 256 colours as RGBA', () => {
    const img = image(32, 32, (x, y) => [x * 8, y * 8, (x + y) * 4, 255]);
    const buf = encodePng(img);
    expect(buf[25]).toBe(6); // RGBA
    expect(Buffer.from(decode(buf).data).equals(img.data)).toBe(true);
  });
});
