import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The expo adapter only runs on a device (checked there); the generated file is data.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/adapters/expo.ts',
        'src/migrations.generated.ts',
      ],
      reporter: ['text'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
