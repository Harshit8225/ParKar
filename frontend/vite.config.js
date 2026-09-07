import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev calls go to /api and are proxied, so the browser never needs a
    // cross-origin request and the API base URL stays out of the bundle.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Recharts is only used by the three dashboards, and it is by far the
        // largest dependency. Splitting it keeps the initial load small and
        // lets the browser cache each vendor group independently.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          http: ['axios'],
        },
      },
    },
  },
});
