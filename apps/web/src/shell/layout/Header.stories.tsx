/**
 * Header（サイト共通ヘッダー）の Storybook Story。
 *
 * Header は 'use client' + useTranslations('common') の client component。
 * Storybook の共有 decorator は空メッセージのため、story 内で NextIntlClientProvider を
 * self-provide して web の common.json（common namespace）を渡す。locale 駆動なので ja / en。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';
import { expect, userEvent, within } from 'storybook/test';

import commonEn from '../../../messages/en/common.json';
import commonJa from '../../../messages/ja/common.json';

import { Header } from './Header';

const meta = {
  title: 'Web/Components/Shell/Header',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 日本語ロケール。 */
export const Ja: Story = {
  render: () => (
    <NextIntlClientProvider locale="ja" messages={commonJa}>
      <Header />
    </NextIntlClientProvider>
  ),
};

/** 英語ロケール。 */
export const En: Story = {
  render: () => (
    <NextIntlClientProvider locale="en" messages={commonEn}>
      <Header />
    </NextIntlClientProvider>
  ),
};

/** モバイル幅でハンバーガーメニューを開いた状態。 */
export const MobileMenu: Story = {
  parameters: { viewport: { value: 'mobile1' } },
  render: () => (
    <NextIntlClientProvider locale="ja" messages={commonJa}>
      <Header />
    </NextIntlClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openButton = await canvas.findByRole('button', { name: 'メニューを開く' });
    await userEvent.click(openButton);
    // メニューは Radix Portal で document.body 直下に開く
    const dialog = await within(document.body).findByRole('dialog');
    await expect(dialog).toBeVisible();
  },
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <NextIntlClientProvider locale="ja" messages={commonJa}>
        <Header />
      </NextIntlClientProvider>
      <NextIntlClientProvider locale="en" messages={commonEn}>
        <Header />
      </NextIntlClientProvider>
    </div>
  ),
};
