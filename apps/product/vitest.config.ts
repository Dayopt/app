import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import path from 'path';
import { defineConfig } from 'vitest/config';
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  test: {
    // istanbul: Node.js（unit）とブラウザ（storybook）の両方で動作
    coverage: {
      provider: 'istanbul',
      reportOnFailure: true,
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/lib/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.stories.{ts,tsx}',
        'dist/',
        '.next/',
        'cypress/',
        'compass/',
        '.storybook/',
      ],
      // CIでは npm run test:coverage -- --project unit で実行
    },
    projects: [
      // ユニットテスト（happy-dom）
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'happy-dom',
          setupFiles: ['./src/lib/test/setup.ts'],
          include: ['**/*.{test,spec}.{ts,tsx}', '*.test.mjs'],
          exclude: [
            'node_modules',
            'dist',
            '.next',
            'cypress',
            'compass',
            '**/e2e/**',
            '**/integration/**',
          ],
          css: true,
          server: {
            deps: {
              // next-intl が ESM で next/navigation を拡張子なしで import し解決失敗する問題を回避
              inline: ['next-intl'],
            },
          },
        },
      },
      // Storybook テスト（ブラウザ: Playwright chromium）
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '../storybook/.storybook'),
            storybookScript: 'pnpm --filter @dayopt/storybook storybook -- --no-open',
            tags: {
              exclude: ['docs-only', 'wip'],
            },
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: [path.join(dirname, 'src/lib/test/storybook-setup.ts')],
        },
      },
      // Storybook Dark mode テスト（beforeEach で .dark クラスを強制適用）
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '../storybook/.storybook'),
            storybookScript: 'pnpm --filter @dayopt/storybook storybook -- --no-open',
            tags: {
              exclude: ['docs-only', 'wip'],
            },
          }),
        ],
        test: {
          name: 'storybook-dark',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: [path.join(dirname, 'src/lib/test/storybook-setup-dark.ts')],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dayopt/storybook': path.resolve(__dirname, '../storybook/.storybook'),
      // next-intl が ESM で next/navigation を拡張子なしで import する問題を回避
      'next/navigation': path.resolve(__dirname, './node_modules/next/navigation.js'),
    },
  },
});
