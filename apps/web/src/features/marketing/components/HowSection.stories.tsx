/**
 * HowItWorks セクション（Landing）の Storybook Story。
 *
 * async Server Component（next-intl/server）を experimentalRSC + next-intl/server モックで描画。
 * locale 駆動のため variant は ja / en。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { HowSection } from './HowSection';

const meta = {
  title: 'Web/Sections/Landing/HowItWorks',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 日本語ロケール。 */
export const Ja: Story = {
  render: () => <HowSection locale="ja" />,
};

/** 英語ロケール。 */
export const En: Story = {
  render: () => <HowSection locale="en" />,
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col">
      <HowSection locale="ja" />
      <HowSection locale="en" />
    </div>
  ),
};
