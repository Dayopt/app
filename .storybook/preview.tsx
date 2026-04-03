import type { Preview } from '@storybook/nextjs-vite';
import { useDarkMode } from '@vueless/storybook-dark-mode';
import { NextIntlClientProvider } from 'next-intl';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

import '../src/styles/globals.css';
import { DocsTemplate } from './DocsTemplate';
import { ThemedDocsContainer } from './ThemedDocsContainer';
import { dayoptDarkTheme, dayoptLightTheme } from './dayoptTheme';
import { storeMockDecorator } from './mocks/stores';
import { StorybookThemeProvider } from './mocks/theme';
import type { MockResponseMap } from './mocks/trpc';
import { StoryTRPCProvider } from './mocks/trpc';
import './storybook-overrides.css';

// メッセージファイルを自動収集（namespace追加時に変更不要）
const messageModules = import.meta.glob<Record<string, string>>('../messages/ja/*.json', {
  eager: true,
});
const messages = Object.values(messageModules).reduce<Record<string, unknown>>(
  (acc, mod) => ({ ...acc, ...mod }),
  {},
);

const preview: Preview = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/ja',
        params: { locale: 'ja' },
      },
    },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      options: {
        ...MINIMAL_VIEWPORTS,
      },
    },
    backgrounds: {
      options: {},
      grid: {
        cellSize: 16,
        cellAmount: 5,
        opacity: 0.6,
        offsetX: 16,
        offsetY: 16,
      },
    },
    options: {
      storySort: {
        method: 'alphabetical',
        order: ['Docs', 'Foundations', 'Components', 'Features', 'Patterns'],
      },
    },
    darkMode: {
      dark: dayoptDarkTheme,
      light: dayoptLightTheme,
      stylePreview: true,
      classTarget: 'html',
    },
    docs: {
      codePanel: true,
      container: ThemedDocsContainer,
      page: DocsTemplate,
    },
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          // Storybook iframe構造に起因する誤検出を無効化
          { id: 'html-has-lang', enabled: false },
          { id: 'landmark-one-main', enabled: false },
          { id: 'page-has-heading-one', enabled: false },
          { id: 'region', enabled: false },
          // Story単体表示では見出し階層が不完全になるのは構造上正常
          { id: 'heading-order', enabled: false },
          // Radix UI の内部実装による aria-checked 等の誤検出
          { id: 'aria-prohibited-attr', enabled: false },
          // Radix ScrollArea / Calendar grid の内部スクロールコンテナ
          { id: 'scrollable-region-focusable', enabled: false },
        ],
      },

      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'error',
    },
  },
  decorators: [
    // Zustand ストアモック（parameters.storeMocks）
    storeMockDecorator,
    // テーマ + tRPC + i18n プロバイダ
    (Story, context) => {
      const isDark = useDarkMode();

      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(isDark ? 'dark' : 'light');
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      }

      // parameters.trpcMocks / trpcPending / trpcError を読み取り
      const trpcMocks = context.parameters.trpcMocks as MockResponseMap | undefined;
      const trpcPending = context.parameters.trpcPending as boolean | undefined;
      const trpcError = context.parameters.trpcError as
        | { path: string; code: string; message?: string }
        | undefined;

      return (
        <StorybookThemeProvider>
          <StoryTRPCProvider mocks={trpcMocks} pending={trpcPending} error={trpcError}>
            <NextIntlClientProvider locale="ja" messages={messages}>
              <main>
                <Story />
              </main>
            </NextIntlClientProvider>
          </StoryTRPCProvider>
        </StorybookThemeProvider>
      );
    },
  ],
};

export default preview;
