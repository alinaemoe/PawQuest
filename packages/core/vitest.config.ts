import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text'],
      // Domain math is the foundation of every statistic: coverage is a hard gate, not a goal.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
