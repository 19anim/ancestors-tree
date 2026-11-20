import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API port behind /api: 3000 for `pnpm dev`, 3100 for the Playwright API (API_PORT).
const apiTarget = `http://localhost:${process.env.API_PORT ?? '3000'}`;

// Netlify sets COMMIT_REF and CONTEXT during builds; anything else is a local build.
const release = process.env.COMMIT_REF ?? 'local';
// Source maps go to Sentry only from a build that has a token (Netlify); otherwise the build is
// unchanged and makes no maps at all.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(uploadSourceMaps
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: release },
          // Browsers never get the maps: they are uploaded, then deleted before Netlify publishes.
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          telemetry: false,
        })
      : []),
  ],
  define: {
    __SENTRY_RELEASE__: JSON.stringify(release),
    __SENTRY_ENVIRONMENT__: JSON.stringify(process.env.CONTEXT ?? 'local'),
  },
  build: {
    // 'hidden': maps for Sentry only, with no sourceMappingURL comment in the published files.
    sourcemap: uploadSourceMaps ? 'hidden' : false,
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
