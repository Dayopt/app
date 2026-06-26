/**
 * Problem セクション（Landing）の Storybook Story。
 *
 * async Server Component（next-intl/server）を experimentalRSC + next-intl/server モックで描画。
 * locale 駆動のため variant は ja / en。実ページには現状未配置だが可視化のため story 化する。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ProblemSection } from './ProblemSection';

const meta = {
  title: 'Web/Sections/Landing/Problem',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 日本語ロケール。 */
export const Ja: Story = {
  render: () => <ProblemSection locale="ja" />,
};

/** 英語ロケール。 */
export const En: Story = {
  render: () => <ProblemSection locale="en" />,
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col">
      <ProblemSection locale="ja" />
      <ProblemSection locale="en" />
    </div>
  ),
};
