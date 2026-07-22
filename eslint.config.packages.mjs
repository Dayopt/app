// Dayopt ESLint - packages/* 共通 Flat Config
//
// packages/* は Next.js に依存しない共有ライブラリ層のため、apps/product が使う
// core-web-vitals ではなく TypeScript ルールだけを base にする。各 package の
// eslint.config.mjs から re-export して使う（base path を package 自身に置くため）。
// @see apps/product/eslint.config.mjs — app 側の設定
// @see docs/engineering/architecture.md#package-boundaries

import nextTs from 'eslint-config-next/typescript';
import storybook from 'eslint-plugin-storybook';
import { defineConfig, globalIgnores } from 'eslint/config';

const packagesConfig = defineConfig([
  // TypeScript推奨ルール（typescript-eslint recommended。Next固有pluginは含まない）
  ...nextTs,

  // 未使用の eslint-disable ディレクティブを error 扱いにする（再発防止）
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },

  globalIgnores(['dist/**', 'coverage/**']),

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // any型禁止（CLAUDE.md準拠）
      '@typescript-eslint/no-explicit-any': 'error',
      // console.log禁止（warn/errorは許可）
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // no-unused-vars は apps/product と同じ判断。TypeScript自体が未使用importを
      // 検出し、Prettierが自動削除するため低優先
      '@typescript-eslint/no-unused-vars': 'off',
      // `interface Props extends ComponentProps<'x'>, VariantProps<...> {}` は
      // packages/components の shadcn 由来 props pattern。interface 形式は許容する
      '@typescript-eslint/no-empty-object-type': ['warn', { allowInterfaces: 'always' }],
    },
  },

  // Storybook
  ...storybook.configs['flat/recommended'],
]);

export default packagesConfig;
