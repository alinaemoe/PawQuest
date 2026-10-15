// Flat config for the whole monorepo. Typed linting (strictTypeChecked) is the ESLint half of the
// "types are enforced, not decorative" rule; Prettier owns formatting (eslint-config-prettier last).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/android/build/**',
      'docs/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false },
      ],
    },
  },
  {
    // Tooling/config scripts run in Node and are not part of any tsconfig project.
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
