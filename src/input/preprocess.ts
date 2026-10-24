// Clean-up for blurry or pixelated photos before OCR: enlarge, soften the pixel
// steps with a slight blur, convert to grey, then stretch contrast or go black/white.

/** Otsu's threshold for a 256-bin grey-level histogram. */
export function otsu(hist: number[]): number {
  const total = hist.reduce((a, b) => a + b, 0);
  const sumAll = hist.reduce((a, h, i) => a + h * i, 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const diff = sumB / wB - (sumAll - sumB) / wF;
    const between = wB * wF * diff * diff;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export async function preprocess(file: Blob, mode: 'stretch' | 'binary'): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(file);
  const k = Math.min(4, Math.max(2, 2400 / img.width)); // small text reads far better at ~30 px tall
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = `blur(${k / 2}px)`; // rounds off pixel blocks; measured best on pixelated text
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const hist = new Array(256).fill(0);
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = g;
    hist[g]++;
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  const t = otsu(hist);
  for (let i = 0; i < px.length; i += 4) {
    const g = px[i];
    px[i] = px[i + 1] = px[i + 2] = mode === 'binary' ? (g > t ? 255 : 0) : Math.round(((g - lo) * 255) / Math.max(1, hi - lo));
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Fixes OCR confusions that matter to the problem reader (e.g. the symbol © read for the letter O). */
export function cleanOcrText(s: string): string {
  return s
    .replace(/[©®]/g, 'O')
    .replace(/\ba1\b/g, 'at')
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
