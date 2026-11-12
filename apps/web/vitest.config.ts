import { defineProject, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      name: 'web',
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      // Vitest stubs CSS imports (including ?raw) with an empty string unless they are included here.
      css: { include: [/\.css\?raw$/] },
    },
  }),
);
