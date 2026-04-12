// Dayopt ESLint - Next.js 16 Flat Config
// @see https://nextjs.org/docs/app/api-reference/config/eslint

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import storybook from 'eslint-plugin-storybook'
import tailwindcss from 'eslint-plugin-tailwindcss'

const eslintConfig = defineConfig([
  // Next.js公式推奨設定（React, React Hooks, Core Web Vitals）
  ...nextVitals,
  // TypeScript推奨ルール
  ...nextTs,

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
    'src/styles/scripts/**',
  ]),

  // Tailwind CSS: 任意値(arbitrary value)の使用を警告
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { tailwindcss },
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
  // ⚠️ TEMPORARILY DISABLED during src/ restructure
  // TODO: Re-enable after store migration is complete
  //
  // Layer 0 (Domain/基盤): tags, chronotype       — 他featureに依存しない
  // Layer 1 (Domain/中核): entry                  — Layer 0 の barrel を使える
  // Layer 2 (Feature/体験): calendar, stats, ai, search — Layer 0+1 の barrel を使える
  // Cross-cutting:    settings                 — 全feature の barrel を使える
  // Independent:      auth, notifications, onboarding, tour — 他featureに依存しない
  //
  // ルール: 上位→下位の barrel import のみ許可。同層・下位→上位は禁止。
  // deep import（@/features/X/components/*）は常に禁止。
  // =========================================================================

  // Layer 0 (tags, chronotype): 他featureへの依存ゼロ
  {
    files: [
      'src/features/tags/**/*.{ts,tsx}',
      'src/features/chronotype/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          {
            group: ['@/features/*', '@/features/**'],
            message: 'Layer 0（基盤feature）は他featureに依存不可。',
          },
        ],
      }],
    },
  },

  // Layer 1 (entry): Layer 0 barrel のみ許可
  {
    files: ['src/features/entry/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          // 上位層禁止
          { group: ['@/features/calendar', '@/features/calendar/**'], message: '上位層featureのimport禁止。' },
          { group: ['@/features/stats', '@/features/stats/**'], message: '上位層featureのimport禁止。' },
          { group: ['@/features/ai', '@/features/ai/**'], message: '上位層featureのimport禁止。' },
          { group: ['@/features/search', '@/features/search/**'], message: '上位層featureのimport禁止。' },
          { group: ['@/features/history', '@/features/history/**'], message: '上位層featureのimport禁止。' },
          { group: ['@/features/palette', '@/features/palette/**'], message: '上位層featureのimport禁止。' },
          // Cross-cutting・Independent禁止
          { group: ['@/features/settings', '@/features/settings/**'], message: 'settingsのimport禁止。' },
          { group: ['@/features/auth', '@/features/auth/**'], message: '独立featureのimport禁止。' },
          { group: ['@/features/notifications', '@/features/notifications/**'], message: '独立featureのimport禁止。' },
          // Layer 0 deep import禁止（barrel のみ許可）
          { group: ['@/features/tags/**'], message: 'barrel import（@/features/tags）のみ使用。' },
          { group: ['@/features/chronotype/**'], message: 'barrel import（@/features/chronotype）のみ使用。' },
        ],
      }],
    },
  },

  // Layer 2 (calendar, stats, search, history, palette): Layer 0+1 barrel のみ許可
  {
    files: [
      'src/features/calendar/**/*.{ts,tsx}',
      'src/features/stats/**/*.{ts,tsx}',
      'src/features/search/**/*.{ts,tsx}',
      'src/features/history/**/*.{ts,tsx}',
      'src/features/palette/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          // 同層間禁止
          { group: ['@/features/calendar', '@/features/calendar/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/stats', '@/features/stats/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/search', '@/features/search/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/ai', '@/features/ai/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/history', '@/features/history/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/palette', '@/features/palette/**'], message: '同層featureのimport禁止。' },
          // Cross-cutting・Independent禁止
          { group: ['@/features/settings', '@/features/settings/**'], message: 'settingsのimport禁止。' },
          { group: ['@/features/auth', '@/features/auth/**'], message: '独立featureのimport禁止。' },
          { group: ['@/features/notifications', '@/features/notifications/**'], message: '独立featureのimport禁止。' },
          // Layer 0+1 deep import禁止（barrel のみ許可）
          { group: ['@/features/tags/**'], message: 'barrel import（@/features/tags）のみ使用。' },
          { group: ['@/features/chronotype/**'], message: 'barrel import（@/features/chronotype）のみ使用。' },
          { group: ['@/features/entry/**'], message: 'barrel import（@/features/entry）のみ使用。' },
        ],
      }],
    },
  },

  // Layer 2 (ai)
  {
    files: ['src/features/ai/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          // 同層間禁止
          { group: ['@/features/calendar', '@/features/calendar/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/stats', '@/features/stats/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/search', '@/features/search/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/ai', '@/features/ai/**'], message: '自己import禁止。' },
          { group: ['@/features/history', '@/features/history/**'], message: '同層featureのimport禁止。' },
          { group: ['@/features/palette', '@/features/palette/**'], message: '同層featureのimport禁止。' },
          // Cross-cutting・Independent禁止
          { group: ['@/features/settings', '@/features/settings/**'], message: 'settingsのimport禁止。' },
          { group: ['@/features/auth', '@/features/auth/**'], message: '独立featureのimport禁止。' },
          { group: ['@/features/notifications', '@/features/notifications/**'], message: '独立featureのimport禁止。' },
          // Lower layer deep import禁止
          { group: ['@/features/tags/**'], message: 'barrel import（@/features/tags）のみ使用。' },
          { group: ['@/features/chronotype/**'], message: 'barrel import（@/features/chronotype）のみ使用。' },
          { group: ['@/features/entry/**'], message: 'barrel import（@/features/entry）のみ使用。' },
        ],
      }],
    },
  },

  // Cross-cutting (settings): 全feature barrel を使用可能、deep importのみ禁止
  {
    files: ['src/features/settings/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          {
            group: ['@/features/*/components/*', '@/features/*/hooks/*', '@/features/*/stores/*',
                    '@/features/*/lib/*', '@/features/*/server/*', '@/features/*/types/*',
                    '@/features/*/constants/*', '@/features/*/contexts/*', '@/features/*/adapters/*'],
            message: 'barrel import（@/features/featureName）のみ使用。deep importは禁止。',
          },
        ],
      }],
    },
  },

  // Independent (auth, notifications, onboarding, tour): 他featureへの依存ゼロ
  {
    files: [
      'src/features/auth/**/*.{ts,tsx}',
      'src/features/contact/**/*.{ts,tsx}',
      'src/features/notifications/**/*.{ts,tsx}',
      'src/features/onboarding/**/*.{ts,tsx}',
      'src/features/tour/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          {
            group: ['@/features/*', '@/features/**'],
            message: '独立featureは他featureに依存不可。',
          },
        ],
      }],
    },
  },

  // Shared layer: cannot import from features (dependency inversion)
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
    ],
    ignores: [
      'src/lib/trpc/root.ts',            // Server Composition Layer (router aggregator)
      'src/components/dnd/**',           // DnD (stories only)
      'src/components/**/*.stories.*',   // Storybook files
    ],
    rules: {
      'no-restricted-imports': ['off', {
        patterns: [
          {
            group: ['@/features/*', '@/features/**'],
            message: '共有層→featureの逆依存は禁止。共有層に実体を移動するか、Composition Layerに配置。',
          },
        ],
      }],
    },
  },


  // App layer: barrel imports only (no deep paths)
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
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
      }],
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

  // src/test/ではconsole許可（テストユーティリティ）
  {
    files: ['src/test/**/*.{js,ts,tsx}'],
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
])

export default eslintConfig
