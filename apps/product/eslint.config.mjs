// Dayopt ESLint - Next.js 16 Flat Config
// @see https://nextjs.org/docs/app/api-reference/config/eslint

import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import storybook from 'eslint-plugin-storybook';
import tailwindcss from 'eslint-plugin-tailwindcss';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  // Next.js公式推奨設定（React, React Hooks, Core Web Vitals）
  ...nextVitals,
  // TypeScript推奨ルール
  ...nextTs,

  // 未使用の eslint-disable ディレクティブを error 扱いにする（再発防止）
  // 対象ルールが発火しなくなった disable は CI で fail させ、stale な disable の蓄積を防ぐ
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },

  // Ignore patterns
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'storybook-static/**',
    'next-env.d.ts',
    // CLI scripts (console.log is expected)
    'scripts/**',
    'src/lib/i18n/scripts/**',
    'src/lib/styles/scripts/**',
  ]),

  // Tailwind CSS: 任意値(arbitrary value)の使用を警告
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { tailwindcss },
    settings: {
      tailwindcss: {
        config: {},
      },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'warn',
    },
  },

  // Storybook: Story の装飾サイズ（h-[500px] 等）は UI 品質に無関係のため除外
  {
    files: ['**/*.stories.{ts,tsx}', '**/story-helpers.{ts,tsx}'],
    rules: {
      'tailwindcss/no-arbitrary-value': 'off',
    },
  },

  // TypeScript用カスタムルール
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // any型禁止（CLAUDE.md準拠）
      '@typescript-eslint/no-explicit-any': 'error',
      // console.log禁止（warn/errorは許可）
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // React 19.2 の新しい react-hooks ルール
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      // 空のインターフェースは type alias で代替可能だが既存コードに多いため warn
      '@typescript-eslint/no-empty-object-type': 'warn',
      // no-unused-vars は以前の設定では未有効。段階的に有効化する
      // TypeScript自体が未使用importを検出し、Prettierが自動削除するため低優先
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // =========================================================================
  // Feature Boundary: DAG（有向非循環グラフ）モデル
  //
  // Layer 0 (基盤):   tags             — 他featureに依存しない
  // Layer 1 (中核):   timeblock, external-calendar — L0 barrel のみ
  // Layer 2 (体験):   calendar, review — L0+L1 barrel のみ
  // Independent:      auth, contact    — 他featureに依存しない
  //
  // settings:      feature から除外（app 層 composition に移動済み）
  // *.stories.tsx: DAG 除外（composition プレビュー層として cross-feature import を許容）
  //
  // ルール: 上位→下位の barrel import のみ許可。同層・下位→上位は禁止。
  // deep import（@/features/X/components/*）は常に禁止。
  // =========================================================================

  // ── 1. lib/ → features/, app/ のimport禁止 ──
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/trpc/root.ts', // Server Composition Layer (router aggregator)
      'src/lib/hooks/useTheme.ts', // Re-export from app/_providers/theme-provider
      'src/lib/components/dnd/**', // DnD (stories only)
      'src/lib/**/*.stories.*', // Storybook files
      'src/lib/test/**', // Integration/E2E tests (deep imports are expected)
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/**'],
              message:
                '共有層→featureの逆依存は禁止。共有層に実体を移動するか、Composition Layerに配置。',
            },
            {
              group: ['@/app/*', '@/app/**'],
              message: '共有層→app層の逆依存は禁止。',
            },
          ],
        },
      ],
    },
  },

  // ── 2. Feature DAG ──

  // Layer 0 (tags): 他featureへの依存ゼロ
  {
    files: ['src/features/tags/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/**'],
              message: 'Layer 0（基盤feature）は他featureに依存不可。',
            },
          ],
        },
      ],
    },
  },

  // Layer 1 (timeblock): L0 barrel のみ許可
  {
    files: ['src/features/timeblock/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // 同層間禁止（自分自身は含めない）
            {
              group: ['@/features/external-calendar', '@/features/external-calendar/**'],
              message: '同層featureのimport禁止。',
            },
            // L2 禁止
            {
              group: ['@/features/calendar', '@/features/calendar/**'],
              message: '上位層featureのimport禁止。',
            },
            {
              group: ['@/features/review', '@/features/review/**'],
              message: '上位層featureのimport禁止。',
            },
            // Independent 禁止
            {
              group: ['@/features/auth', '@/features/auth/**'],
              message: '独立featureのimport禁止。',
            },
            {
              group: ['@/features/contact', '@/features/contact/**'],
              message: '独立featureのimport禁止。',
            },
            // L0 deep import禁止（barrel のみ許可）
            {
              group: ['@/features/tags/**'],
              message: 'barrel import（@/features/tags）のみ使用。',
            },
          ],
        },
      ],
    },
  },

  // Layer 1 (external-calendar): L0 barrel のみ許可
  {
    files: ['src/features/external-calendar/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // 同層間禁止（自分自身は含めない）
            {
              group: ['@/features/timeblock', '@/features/timeblock/**'],
              message: '同層featureのimport禁止。',
            },
            // L2 禁止
            {
              group: ['@/features/calendar', '@/features/calendar/**'],
              message: '上位層featureのimport禁止。',
            },
            {
              group: ['@/features/review', '@/features/review/**'],
              message: '上位層featureのimport禁止。',
            },
            // Independent 禁止
            {
              group: ['@/features/auth', '@/features/auth/**'],
              message: '独立featureのimport禁止。',
            },
            {
              group: ['@/features/contact', '@/features/contact/**'],
              message: '独立featureのimport禁止。',
            },
            // L0 deep import禁止（barrel のみ許可）
            {
              group: ['@/features/tags/**'],
              message: 'barrel import（@/features/tags）のみ使用。',
            },
          ],
        },
      ],
    },
  },

  // Layer 2 (calendar): L0+L1 barrel のみ許可
  {
    files: ['src/features/calendar/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // 同層間禁止（自分自身は含めない）
            {
              group: ['@/features/review', '@/features/review/**'],
              message: '同層featureのimport禁止。',
            },
            // Independent 禁止
            {
              group: ['@/features/auth', '@/features/auth/**'],
              message: '独立featureのimport禁止。',
            },
            {
              group: ['@/features/contact', '@/features/contact/**'],
              message: '独立featureのimport禁止。',
            },
            // L0+L1 deep import禁止（barrel のみ許可）
            {
              group: ['@/features/tags/**'],
              message: 'barrel import（@/features/tags）のみ使用。',
            },
            {
              group: ['@/features/timeblock/**'],
              message: 'barrel import（@/features/timeblock）のみ使用。',
            },
            {
              group: ['@/features/external-calendar/**'],
              message: 'barrel import（@/features/external-calendar）のみ使用。',
            },
          ],
        },
      ],
    },
  },

  // Layer 2 (review): L0+L1 barrel のみ許可
  {
    files: ['src/features/review/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // 同層間禁止（自分自身は含めない）
            {
              group: ['@/features/calendar', '@/features/calendar/**'],
              message: '同層featureのimport禁止。',
            },
            // Independent 禁止
            {
              group: ['@/features/auth', '@/features/auth/**'],
              message: '独立featureのimport禁止。',
            },
            {
              group: ['@/features/contact', '@/features/contact/**'],
              message: '独立featureのimport禁止。',
            },
            // L0+L1 deep import禁止（barrel のみ許可）
            {
              group: ['@/features/tags/**'],
              message: 'barrel import（@/features/tags）のみ使用。',
            },
            {
              group: ['@/features/timeblock/**'],
              message: 'barrel import（@/features/timeblock）のみ使用。',
            },
            {
              group: ['@/features/external-calendar/**'],
              message: 'barrel import（@/features/external-calendar）のみ使用。',
            },
          ],
        },
      ],
    },
  },

  // Independent (auth, contact): 他featureへの依存ゼロ
  {
    files: ['src/features/auth/**/*.{ts,tsx}', 'src/features/contact/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/**'],
              message: '独立featureは他featureに依存不可。',
            },
          ],
        },
      ],
    },
  },

  // Composition Feature (settings): 他featureへのimportは許可するが、deep importは禁止（barrelのみ）
  // .claude/rules/feature-boundaries.md の「Composition Feature: settings」参照
  {
    files: ['src/features/settings/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // サブディレクトリ列挙だと server/domain/schemas 等の新設パスを
              // 見逃す（Codex review 指摘）。catch-all で deep import 全体を禁止する。
              group: ['@/features/*/**'],
              message: 'settings は composition feature のため他featureへのimportは許可されるが、deep importは禁止。barrel（@/features/featureName）経由で使用。',
            },
          ],
        },
      ],
    },
  },

  // ── 3. app/: feature deep import禁止（barrelのみ） ──
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features/*/components/*',
                '@/features/*/hooks/*',
                '@/features/*/stores/*',
                '@/features/*/utils/*',
                '@/features/*/types/*',
                '@/features/*/lib/*',
                '@/features/*/constants/*',
                '@/features/*/contexts/*',
                '@/features/*/adapters/*',
              ],
              message: 'barrel import (@/features/featureName) のみ使用。',
            },
          ],
        },
      ],
    },
  },

  // テスト用グローバル変数
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        test: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // logger.tsではconsole許可（開発用ロガー）
  {
    files: ['**/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // scripts/ではconsole許可 + CJS require許可（CLIツール）
  {
    files: ['scripts/**/*.{js,cjs,mjs,ts}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // public/ のJSファイル（Service Worker等）
  {
    files: ['public/**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // .storybook/ のモックファイル
  {
    files: ['.storybook/**/*.{ts,tsx,js}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // supabase/ Edge Functions
  {
    files: ['supabase/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // src/lib/test/ではconsole許可（テストユーティリティ）
  {
    files: ['src/lib/test/**/*.{js,ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },

  // 開発専用コンポーネントではconsole許可
  {
    files: ['**/components/dev/**/*.{js,ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },

  // Storybook
  ...storybook.configs['flat/recommended'],
]);

export default eslintConfig;
