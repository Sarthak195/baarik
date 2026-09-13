import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Coverage is scoped to the pure core deliberately. Reporting a global figure
      // that averages in framework glue would overstate what is actually verified;
      // `src/core` is where every legal decision lives, so it is what gets measured.
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/types.ts', 'src/core/index.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
