import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one database, and the disaster recovery test deletes rows
    // across most tables, so running files in parallel corrupts other tests.
    fileParallelism: false,
    // Long enough for the end-to-end suites against a remote database.
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
