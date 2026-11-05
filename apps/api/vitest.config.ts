import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one database, and the disaster recovery test deletes rows
    // across most tables, so running files in parallel corrupts other tests.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
