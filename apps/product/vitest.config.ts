import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import path from 'path';
import { defineConfig } from 'vitest/config';
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// ─── unit test の環境分割（node / happy-dom）─────────────────────────
//
// 全 test に happy-dom を掛けると、**実行時間の大半が環境構築とモジュール読み込みに
// 消える**。CI 実測（308 files）では tests 15.2s に対し environment 85.4s / import
// 123.0s / setup 45.3s で、テスト本体は全体の 5% しかなかった。実際に DOM が要るのは
// 約 1/4 のファイルだけなので、既定を `node` にして DOM が要るものだけ opt-in する。
//
// 判定は 2 段:
//   1. `.tsx` — component / hook を render するので DOM 必須
//   2. `use*.test.ts` — React hook の test は renderHook を使うので DOM 必須
// この 2 つで大半が拾える。残りは DOM_ONLY_TESTS に明示列挙する。
//
// **新しく DOM が要る test を足した時**: 上の 2 パターンに当てはまらなければ
// DOM_ONLY_TESTS に追加する。追加を忘れると `document is not defined` 等で
// 落ちるので、静かに壊れることはない（fail loud）。逆に純ロジックの test を
// DOM 側に置いても遅くなるだけで壊れない。

/** `.tsx` でも `use*.test.ts` でもないが DOM が要る test。 */
const DOM_ONLY_TESTS = [
  'src/features/calendar/hooks/keyboard/__tests__/shortcut-registry.test.ts',
  'src/features/timeblock/components/editor/__tests__/TimeblockRecordActions.test.ts',
  'src/lib/__tests__/cookie-consent.test.ts',
  'src/lib/security/__tests__/encryption.test.ts',
];

/** DOM を必要とする test の include パターン。 */
const DOM_TEST_PATTERNS = ['**/*.{test,spec}.tsx', '**/use*.{test,spec}.ts', ...DOM_ONLY_TESTS];

/** 全 unit project 共通の exclude。 */
const UNIT_EXCLUDE = [
  'node_modules',
  'dist',
  '.next',
  'cypress',
  'compass',
  '**/e2e/**',
  '**/integration/**',
];

/** unit project 共通設定（環境と setup だけが node / dom で違う）。 */
const UNIT_SHARED = {
  globals: true,
  css: true,
  server: {
    deps: {
      // next-intl が ESM で next/navigation を拡張子なしで import し解決失敗する問題を回避
      inline: ['next-intl'],
    },
  },
} as const;

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
      // ローカルで見る時は pnpm test:coverage（unit と unit-dom の両方を回す）
    },
    projects: [
      // ユニットテスト・DOM 不要（node）— 全 unit test の約 3/4 がここに入る
      {
        extends: true,
        test: {
          ...UNIT_SHARED,
          name: 'unit',
          environment: 'node',
          setupFiles: ['./src/lib/test/setup-node.ts'],
          include: ['**/*.{test,spec}.ts', '*.test.mjs'],
          exclude: [...UNIT_EXCLUDE, ...DOM_TEST_PATTERNS],
        },
      },
      // ユニットテスト・DOM 必要（happy-dom）
      {
        extends: true,
        test: {
          ...UNIT_SHARED,
          name: 'unit-dom',
          environment: 'happy-dom',
          setupFiles: ['./src/lib/test/setup.ts'],
          include: DOM_TEST_PATTERNS,
          exclude: UNIT_EXCLUDE,
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
