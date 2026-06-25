import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { NextActionLink } from './NextActionLink';

/** NextActionLink — Review から次の計画（Calendar）への還流導線（Tier 2 CTA） */
const meta = {
  title: 'Product/Features/Stats/Shared/NextActionLink',
  component: NextActionLink,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NextActionLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示: 来週の計画への導線 */
export const Default: Story = {
  args: {
    href: '/ja/week?date=2026-06-15',
    label: '来週の計画を立てる',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { href: '#', label: '' },
  render: () => (
    <div className="flex flex-col gap-4">
      <NextActionLink href="/ja/week?date=2026-06-15" label="来週の計画を立てる" />
      <NextActionLink href="/ja/day?date=2026-06-11" label="明日の計画を立てる" />
      <NextActionLink href="/ja/week?date=2026-07-01" label="来月の計画を立てる" />
    </div>
  ),
};
