import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/scoring.service.ts', 'src/lib/scoring-formula.ts', 'src/plugins/crawler-detector.ts'],
      reporter: ['text', 'json'],
    },
  },
});
