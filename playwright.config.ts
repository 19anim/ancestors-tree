import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @ancestors-tree/api e2e:server',
      url: 'http://localhost:3100/api/health',
      reuseExistingServer: !isCI,
      // The first run downloads the MongoDB binary.
      timeout: 180_000,
    },
    {
      // The production build, served by `vite preview` (same files Netlify serves).
      command:
        'pnpm --filter @ancestors-tree/web build && pnpm --filter @ancestors-tree/web preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      env: { API_PORT: '3100' },
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
});
