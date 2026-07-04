import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/auth': 'http://127.0.0.1:4000',
      '/health': 'http://127.0.0.1:4000',
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
