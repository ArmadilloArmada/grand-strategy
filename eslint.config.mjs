// Flat ESLint config for Grand Strategy.
//
// The codebase went un-linted for a long time, so this config intentionally
// starts pragmatic: it enables the high-signal recommended rules that catch
// real bugs while relaxing the noisiest stylistic ones. Tighten over time.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'server/node_modules/**',
      'assets/**',
      '**/*.json',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // TypeScript sources (browser game + editor).
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // tsc already enforces unused locals/params via noUnusedLocals/Parameters.
      '@typescript-eslint/no-unused-vars': 'off',
      // The engine leans on `any` in a few dynamic spots (mods, save I/O); flag as warning, not error.
      '@typescript-eslint/no-explicit-any': 'warn',

      // High-value bug rules kept as ERRORS. These have no violations in the
      // current code, so they gate regressions in new/changed code.
      'no-fallthrough': 'error',
      'no-unsafe-finally': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],

      // Pre-existing stylistic patterns throughout the codebase. Surfaced as
      // warnings (visible tech debt) instead of rewriting working code wholesale.
      'no-empty': 'warn',
      'no-useless-assignment': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'preserve-caught-error': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },

  // Node CommonJS tooling (build scripts, electron main/preload, MP server).
  {
    files: ['scripts/**/*.{js,cjs}', 'electron/**/*.cjs', 'server/**/*.js', '*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': 'warn',
      'no-useless-assignment': 'warn',
      'no-prototype-builtins': 'warn',
      'no-case-declarations': 'warn',
    },
  },
);
