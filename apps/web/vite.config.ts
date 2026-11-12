import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin /api in development, mirroring the Netlify proxy used in production.
      '/api': { target: 'http://localhost:3000' },
    },
  },
});
