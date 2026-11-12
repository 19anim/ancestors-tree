import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/globalSetup.ts'],
    // The first run downloads the MongoDB binary.
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
