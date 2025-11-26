import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['water-ways.ca', 'waterways.dylansserver.top', 'localhost', '127.0.0.1'],
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      clientPort: 5173
    },
    proxy: {
      '/details': {
        target: 'http://localhost:5173',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/details/, ''),
      },
    },
  },
});
