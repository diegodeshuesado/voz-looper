import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/voz-looper/',
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
