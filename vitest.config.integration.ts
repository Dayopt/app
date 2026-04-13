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
    testTimeout: 30000, // 統合テストは時間がかかる可能性があるため30秒
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
