// This file has been automatically migrated to valid ESM format by Storybook.
import { fileURLToPath } from 'node:url';
import path, { dirname } from 'path';

import type { StorybookConfig } from '@storybook/nextjs-vite';
import tailwindcss from '@tailwindcss/vite';
import remarkGfm from 'remark-gfm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  stories: [
    '../../app/src/**/*.mdx',
    '../../app/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../docs/**/*.mdx',
    '../docs/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    './stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-a11y',
    '@vueless/storybook-dark-mode',
    '@storybook/addon-vitest',
    {
      name: '@storybook/addon-docs',
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
    {
      name: '@storybook/addon-mcp',
      options: {
        toolsets: {
          dev: true,
          docs: true,
        },
      },
    },
  ],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  staticDirs: ['../../app/public'],
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  core: {
    disableTelemetry: true,
  },
  previewHead: (head) => `
    ${head}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=Noto+Sans+JP:wght@100..900&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --font-inter: 'Inter', sans-serif;
        --font-noto-jp: 'Noto Sans JP', sans-serif;
      }
    </style>
    <script>
      document.documentElement.setAttribute('lang', 'ja');
    </script>
  `,
  managerHead: (head) => `
    ${head}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=Noto+Sans+JP:wght@100..900&display=swap"
      rel="stylesheet"
    />
    <script>
      document.documentElement.setAttribute('lang', 'ja');
    </script>
  `,
  viteFinal: async (config) => {
    // パスエイリアス設定
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '../../app/src'),
      '@dayopt/storybook': path.resolve(__dirname),
      // next-intl（React未定義エラー回避）— next/image, next/link, next/navigation は @storybook/nextjs-vite が自動解決
      'next-intl/navigation': path.resolve(__dirname, './mocks/next-intl-navigation.tsx'),
      'next-intl/routing': path.resolve(__dirname, './mocks/next-intl-routing.ts'),
      // Sentry（@sentry/nextjs が Next.js 内部の process 依存のため Storybook ではモック化）
      '@sentry/nextjs': path.resolve(__dirname, './mocks/sentry-nextjs.ts'),
      // Storybook 10: @storybook/blocks は @storybook/addon-docs/blocks に統合
      '@storybook/blocks': '@storybook/addon-docs/blocks',
    };
    // サーバー専用モジュール（crypto等）をブラウザバンドルから除外
    config.build = {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        external: [...((config.build?.rollupOptions?.external as string[]) || []), 'crypto'],
      },
    };
    // React自動JSXランタイム設定
    config.esbuild = {
      ...config.esbuild,
      jsx: 'automatic',
    };
    // Tailwind CSS v4: Viteプラグインで @import チェーンを正しく処理
    // PostCSS の @tailwindcss/postcss と競合するため、Vite側で上書き
    config.plugins = [...(config.plugins || []), tailwindcss()];
    config.css = {
      ...config.css,
      postcss: { plugins: [] },
    };
    return config;
  },
};

export default config;
