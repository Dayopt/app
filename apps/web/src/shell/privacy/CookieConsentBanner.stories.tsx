import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CookieConsentBannerView } from './CookieConsentBanner';

const meta = {
  title: 'Web/Components/Shell/CookieConsentBanner',
  component: CookieConsentBannerView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    onNecessaryOnly: () => undefined,
    onAllowAnalytics: () => undefined,
  },
} satisfies Meta<typeof CookieConsentBannerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 英語ロケール。 */
export const En: Story = {
  args: {
    title: 'Cookie settings',
    description:
      'Analytics help us understand site performance and unexpected errors. The site works with necessary storage only.',
    learnMoreLabel: 'Cookie Policy',
    necessaryOnlyLabel: 'Necessary only',
    allowAnalyticsLabel: 'Allow analytics',
  },
};

/** 日本語ロケール。 */
export const Ja: Story = {
  args: {
    title: 'Cookie設定',
    description:
      'サイトの性能と予期しないエラーの把握に分析を使用します。必須の保存領域だけでも利用できます。',
    learnMoreLabel: 'Cookieポリシー',
    necessaryOnlyLabel: '必須のみ',
    allowAnalyticsLabel: '分析を許可',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: En.args,
};
