import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // These tests run real transactions, which take several round trips to a remote database.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
