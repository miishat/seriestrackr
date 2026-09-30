import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api/discovery': { target: 'http://127.0.0.1:3001',
  changeOrigin: true, timeout: 185000, proxyTimeout: 185000 } };

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 3000, strictPort: true, proxy },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
