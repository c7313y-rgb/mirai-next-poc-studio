import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/mirai-next-poc-studio/' : '/',
  plugins: [react(), ...(mode === 'pages' ? [{
    name: 'public-demo-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('/src/main.jsx', '/src/public-demo/main.jsx').replace('副担任mirAI NEXT | PoC Studio', '副担任mirAI NEXT | 公開デモ');
      },
    },
  }] : [])],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: mode === 'pages' ? 'dist-pages' : 'dist', sourcemap: false },
}));
