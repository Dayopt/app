/**
 * 統合テスト用 Vitest 設定
 *
 * 実行方法: npm run test:integration
 * または: npx vitest run --config vitest.config.integration.ts
 */

import path from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // 統合テストはNode環境で実行
    include: ['src/lib/test/integration/**/*.{test,spec}.ts'],
    // Integration files share one local database and the MCP global mutation
    // control is intentionally a singleton. Keep cross-file gate transitions
    // deterministic while individual tests still exercise explicit races.
    fileParallelism: false,
    testTimeout: 30000, // 統合テストは時間がかかる可能性があるため30秒
    hookTimeout: 30000,
    setupFiles: ['src/lib/test/integration-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
