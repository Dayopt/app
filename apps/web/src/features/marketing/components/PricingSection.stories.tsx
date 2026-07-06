/**
 * Pricing セクション（Landing）の Storybook Story。
 *
 * async Server Component（next-intl/server）を experimentalRSC + next-intl/server モックで描画。
 * PricingSection は @/platform/i18n/navigation（Link）を使うため、main.ts viteFinal で
 * web 側へ alias 済み。料金は @dayopt/billing を参照。locale 駆動のため variant は ja / en。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PricingSection } from './PricingSection';

const meta = {
  title: 'Web/Sections/Landing/Pricing',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 日本語ロケール。 */
export const Ja: Story = {
  render: () => <PricingSection locale="ja" />,
};

/** 英語ロケール。 */
export const En: Story = {
  render: () => <PricingSection locale="en" />,
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col">
      <PricingSection locale="ja" />
      <PricingSection locale="en" />
    </div>
  ),
};
