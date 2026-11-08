import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
    // Long enough for suites that run against a remote database.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
