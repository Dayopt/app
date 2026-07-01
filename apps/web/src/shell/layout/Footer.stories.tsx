/**
 * Footer（サイト共通フッター）の Storybook Story。
 *
 * Footer は 'use client' + useTranslations('common' / 'footer') の client component。
 * ThemeToggle / LanguageSwitcher を内包する。story 内で NextIntlClientProvider を
 * self-provide し、common namespace と footer namespace を含む common.json を渡す。
 * locale 駆動なので ja / en。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';

import commonEn from '../../../messages/en/common.json';
import commonJa from '../../../messages/ja/common.json';

import { Footer } from './Footer';

const meta = {
  title: 'Web/Components/Shell/Footer',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 日本語ロケール。 */
export const Ja: Story = {
  render: () => (
    <NextIntlClientProvider locale="ja" messages={commonJa}>
      <Footer />
    </NextIntlClientProvider>
  ),
};

/** 英語ロケール。 */
export const En: Story = {
  render: () => (
    <NextIntlClientProvider locale="en" messages={commonEn}>
      <Footer />
    </NextIntlClientProvider>
  ),
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <NextIntlClientProvider locale="ja" messages={commonJa}>
        <Footer />
      </NextIntlClientProvider>
      <NextIntlClientProvider locale="en" messages={commonEn}>
        <Footer />
      </NextIntlClientProvider>
    </div>
  ),
};
