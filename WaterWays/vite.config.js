import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Make the server accessible externally
    port: 5173, // Ensure you're using the correct port
    allowedHosts: ['waterways.dylansserver.top', 'localhost', '127.0.0.1'],
    proxy: {
      '/details': {
        target: 'http://localhost:3000',  // Proxy requests to the backend
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/details/, ''), // Remove `/details` from the URL path
      },
    },
  },
});

