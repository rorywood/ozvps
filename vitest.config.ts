import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'client'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'client/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/migrations/**',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
});
