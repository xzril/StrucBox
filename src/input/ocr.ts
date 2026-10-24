import { createWorker } from 'tesseract.js';
import { cleanOcrText, preprocess } from './preprocess';

/** Read text from an image on this device (D2), fully offline (D17). Reads the photo as-is and
 * in two cleaned-up versions, and keeps whichever Tesseract is most confident about. */
export async function runOcr(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  // shortcut: files are served from node_modules by the Vite dev server; copy them to public/ for a production build
  let pass = 0;
  const worker = await createWorker('eng', 1, {
    workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
    corePath: '/node_modules/tesseract.js-core',
    langPath: '/node_modules/@tesseract.js-data/eng/4.0.0_best_int',
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
