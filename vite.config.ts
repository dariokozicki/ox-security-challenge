import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { config } from './src/server/config';
const apiTarget = `http://127.0.0.1:${config.port}`;
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
  build: { outDir: 'dist/web' },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': apiTarget, '/health': apiTarget },
  },
});
