import { createWorker } from 'tesseract.js';

/** Read text from an image on this device (D2). First use downloads the English model. */
export async function runOcr(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const worker = await createWorker('eng', 1, {
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
