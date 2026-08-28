// Dayopt Web ESLint - シンプル設定
import nextPlugin from '@next/eslint-plugin-next';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    ignores: ['node_modules/', '.next/', 'out/', 'public/', '**/*.d.ts'],
  },
  // 未使用の eslint-disable ディレクティブを error 扱いにする（再発防止）
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin,
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // any型禁止（CLAUDE.md準拠）
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{jsx,tsx}'],
    ignores: ['**/*.test.{jsx,tsx}', '**/*.spec.{jsx,tsx}', '**/*.stories.{jsx,tsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/control-has-associated-label': [
        'error',
        {
          controlComponents: ['Button'],
          ignoreElements: ['td'],
          depth: 5,
        },
      ],
    },
  },
  // 本番コードは将来追加されるディレクトリも含めて named export に統一する。
  // Next.js / next-intl が default export を要求するentrypointだけを明示除外する。
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ignores: [
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/*.stories.{ts,tsx,js,jsx}',
      'src/app/**/{page,layout,loading,error,not-found,template,default}.{ts,tsx,js,jsx}',
      'src/app/{global-error,global-not-found,forbidden,unauthorized}.{ts,tsx,js,jsx}',
      'src/app/**/{icon,apple-icon,opengraph-image,twitter-image}.{ts,tsx,js,jsx}',
      'src/app/**/sitemap.{ts,js}',
      'src/app/{robots,manifest}.{ts,js}',
      'src/platform/i18n/request.ts',
    ],
    rules: {
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
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
  },
];
