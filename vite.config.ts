import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { aiPlugin } from './server/ai';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), aiPlugin(env.ANTHROPIC_API_KEY || undefined)],
    server: { port: 5173 },
  };
});
