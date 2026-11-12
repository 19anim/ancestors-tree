import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API port behind /api: 3000 for `pnpm dev`, 3100 for the Playwright API (API_PORT).
const apiTarget = `http://localhost:${process.env.API_PORT ?? '3000'}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Never inline fonts as data: URLs. The production CSP allows fonts from 'self' only
    // (font-src 'self'), and some @fontsource subsets are below Vite's 4 KiB inline limit.
    assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined),
    rolldownOptions: {
      output: {
        // React and the router change rarely: a separate vendor chunk caches well and keeps
        // the main chunk below Vite's 500 kB warning.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
            },
          ],
        },
      },
    },
  },
  preview: { proxy: { '/api': { target: apiTarget } } },
  server: {
    port: 5173,
    proxy: {
      // Same-origin /api in development, mirroring the Netlify proxy used in production.
      '/api': { target: apiTarget },
    },
  },
});
