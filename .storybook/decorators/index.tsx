/**
 * 全Storyに適用するdecorators集約
 *
 * preview.tsx から decorators ロジックを分離。
 * Zustand ストアモック → テーマ → tRPC → i18n の順でラップする。
 */
import type { Decorator } from '@storybook/nextjs-vite';
import { useDarkMode } from '@vueless/storybook-dark-mode';
import { NextIntlClientProvider } from 'next-intl';

import { StorybookThemeProvider } from '../mocks/theme';
import type { MockResponseMap } from '../mocks/trpc';
import { StoryTRPCProvider } from '../mocks/trpc';

export { storeMockDecorator } from '../mocks/stores';

// メッセージファイルを自動収集（namespace追加時に変更不要）
const messageModules = import.meta.glob<Record<string, string>>('../../messages/ja/*.json', {
  eager: true,
});
const messages = Object.values(messageModules).reduce<Record<string, unknown>>(
  (acc, mod) => ({ ...acc, ...mod }),
  {},
);

/** テーマ + tRPC + i18n プロバイダ */
export const providerDecorator: Decorator = (Story, context) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Storybook decorator は React コンポーネントとして実行される
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
};
