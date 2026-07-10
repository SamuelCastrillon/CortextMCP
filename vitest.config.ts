import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'modules/**/__tests__/**/*.test.ts'],
    allowOnly: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd()),
      'server-only': path.resolve(process.cwd(), '__tests__/server-only-shim.ts'),
    },
  },
});
