import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787'
    },
    // Enable client-side routing fallback
    historyApiFallback: true
  },
  // Enable client-side routing for build
  build: {
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
});