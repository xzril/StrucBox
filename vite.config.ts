import react from '@vitejs/plugin-react';
import { cpSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { aiPlugin } from './server/ai';

/** The dev server serves the offline OCR files from node_modules; a build copies them to dist/ocr (see src/input/ocr.ts). */
const ocrAssets: Plugin = {
  name: 'ocr-assets',
  apply: 'build',
  closeBundle() {
    cpSync('node_modules/tesseract.js/dist/worker.min.js', 'dist/ocr/worker.min.js');
    cpSync('node_modules/tesseract.js-core', 'dist/ocr/core', { recursive: true });
    cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int', 'dist/ocr/eng', { recursive: true });
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), aiPlugin(env), ocrAssets],
    server: { port: 5173 },
  };
});
