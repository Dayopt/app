import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    exclude: ['node_modules'],
    // scripts のテストは spawnSync で実際のスクリプトを子プロセス実行する。
    // 単体では 1-2 秒だが、suite 全体を並列実行すると CPU 競合で default の
    // 5 秒を超えて flaky になるため、integration 相当の余裕を持たせる。
    testTimeout: 30000,
  },
});
