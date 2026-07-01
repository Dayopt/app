/**
 * Hero セクション（Landing）の Storybook Story。
 *
 * HeroSection は async Server Component で next-intl/server の getTranslations から
 * 本文を取得する。Storybook では main.ts の experimentalRSC + next-intl/server モックで描画する。
 * locale 駆動のため variant は ja / en。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { HeroSection } from './HeroSection';

const meta = {
  title: 'Web/Sections/Landing/Hero',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 日本語ロケール。 */
export const Ja: Story = {
  render: () => <HeroSection locale="ja" />,
};

/** 英語ロケール。 */
export const En: Story = {
  render: () => <HeroSection locale="en" />,
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col">
      <HeroSection locale="ja" />
      <HeroSection locale="en" />
    </div>
  ),
};
