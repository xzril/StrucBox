import { createWorker } from 'tesseract.js';
import type { RGBA } from './drawing';
import { cleanOcrText, preprocess } from './preprocess';

/** Read text from an image on this device (D2), fully offline (D17). Reads the photo as-is and
 * in two cleaned-up versions, and keeps whichever Tesseract is most confident about. */
export async function runOcr(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  let pass = 0;
  // dev server: straight from node_modules; web build: copied to /ocr by vite.config.ts
  const dev = import.meta.env.DEV;
  const worker = await createWorker('eng', 1, {
    workerPath: dev ? '/node_modules/tesseract.js/dist/worker.min.js' : '/ocr/worker.min.js',
    corePath: dev ? '/node_modules/tesseract.js-core' : '/ocr/core',
    langPath: dev ? '/node_modules/@tesseract.js-data/eng/4.0.0_best_int' : '/ocr/eng',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.((pass + m.progress) / 3);
    },
  });
  try {
    let best = (await worker.recognize(file)).data;
    for (const mode of ['stretch', 'binary'] as const) {
      pass++;
      const d = (await worker.recognize(await preprocess(file, mode))).data;
      if (d.confidence > best.confidence) best = d;
    }
    return cleanOcrText(best.text);
  } finally {
    await worker.terminate();
  }
}

export function fileToBase64(file: Blob): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve({ data: s.slice(s.indexOf(',') + 1), mediaType: file.type || 'image/png' });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Pixels of a photo for the drawing reader, shrunk so the longest side is at most 1600 px. */
export async function imagePixels(file: Blob): Promise<RGBA> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs read as white paper
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}
