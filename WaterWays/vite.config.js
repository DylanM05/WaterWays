import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', 
    port: 5173, 
    allowedHosts: ['waterways.dylansserver.top', 'localhost', '127.0.0.1'],
    proxy: {
      '/details': {
        target: 'http://localhost:5173', 
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/details/, ''), 
      },
    },
  },
});

