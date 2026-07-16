import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';

import { CookieConsentBanner } from './CookieConsentBanner';

import { BROWSER_TELEMETRY_CONSENT_STORAGE_KEY } from '@dayopt/observability';

const meta = {
  title: 'Product/Components/Shell/CookieConsentBanner',
  component: CookieConsentBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CookieConsentBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Cookie同意バナー（初回訪問時）
 *
 * localStorageから同意記録を削除した状態でレンダリングすることで、
 * 実コンポーネントがバナーを表示するまで待機する。
 * 内部で requestIdleCallback / setTimeout を使うため play で表示を確認。
 */
export const Default: Story = {
  decorators: [
    (Story) => {
      // 同意記録をクリアしてバナーが表示される状態にする
      localStorage.removeItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY);
      return (
        <div className="relative min-h-[200px]">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // requestIdleCallback（最大2秒）後に表示されるのを待つ
    await waitFor(
      () => {
        expect(canvas.getByRole('dialog')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  },
};

/**
 * 同意済みの場合はバナーを表示しない
 */
export const ConsentAlreadyGiven: Story = {
  decorators: [
    (Story) => {
      // 同意記録を設定しておく
      localStorage.setItem(
        BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
        JSON.stringify({
          necessary: true,
          analytics: true,
          marketing: false,
          timestamp: Date.now(),
        }),
      );
      return (
        <div className="relative min-h-[200px]">
          <p className="text-muted-foreground p-4 text-sm">
            同意済みのためバナーは非表示（このテキストのみ表示）
          </p>
          <Story />
        </div>
      );
    },
  ],
};
