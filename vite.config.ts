import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { aiPlugin } from './server/ai';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), aiPlugin(env)],
    server: { port: 5173 },
  };
});
