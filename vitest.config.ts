import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/src/test/**',
        'apps/api/src/server.ts',
        'apps/web/src/main.tsx',
      ],
      reporter: ['text-summary', 'html'],
      thresholds: {
        lines: 70,
        'packages/shared/src/**': { lines: 90 },
      },
    },
  },
});
