// Crisper pictures (cosmetic): Wyrmsun's sheets are small pixel art drawn at about 2x and more, and a plain bilinear stretch of them is
// soft. Each sheet is instead enlarged once to 2x with the browser's high-quality resampling and lightly sharpened (an unsharp
// mask that skips the transparent edge, so no halos), then drawn as a resolution-2 texture: edges stay clean and round at any
// zoom, still not retro-blocky. Offline Lanczos (2x or 4x) looked the same; this needs no extra files.

/** Sharpen RGBA `data` (w x h) in place by `amount` (0.3 is gentle): each opaque pixel moves away from the mean of its four neighbours. */
export function sharpen(data: Uint8ClampedArray, w: number, h: number, amount: number) {
  const src = new Uint8ClampedArray(data);
  const at = (x: number, y: number) => (y * w + x) * 4;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = at(x, y);
      if (src[i + 3]! < 200) continue;
      const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let k = 0;
        for (const j of n)
          if (src[j + 3]! >= 200) {
            sum += src[j + c]!;
            k++;
          }
        if (k) data[i + c] = src[i + c]! + (src[i + c]! - sum / k) * amount;
      }
    }
}

/** A copy of `cv` at twice the size, resampled smoothly and sharpened. */
export function enlarge2x(cv: HTMLCanvasElement, amount = 0.45): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = cv.width * 2;
  out.height = cv.height * 2;
  const cx = out.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(cv, 0, 0, out.width, out.height);
  const img = cx.getImageData(0, 0, out.width, out.height);
  sharpen(img.data, out.width, out.height, amount);
  cx.putImageData(img, 0, 0);
  return out;
}
