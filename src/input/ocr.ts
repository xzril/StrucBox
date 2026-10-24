import { createWorker } from 'tesseract.js';

/** Read text from an image on this device (D2), fully offline (D17). */
export async function runOcr(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  // shortcut: files are served from node_modules by the Vite dev server; copy them to public/ for a production build
  const worker = await createWorker('eng', 1, {
    workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
    corePath: '/node_modules/tesseract.js-core',
    langPath: '/node_modules/@tesseract.js-data/eng/4.0.0_best_int',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
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
