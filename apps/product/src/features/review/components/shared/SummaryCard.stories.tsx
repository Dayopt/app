import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Clock3, Gauge, Trophy } from 'lucide-react';

import { SummaryCard } from './SummaryCard';

/** SummaryCard — 粒度ビュー共通の KPI カード（前期間比トレンド付き） */
const meta = {
  title: 'Product/Features/Review/Shared/SummaryCard',
  component: SummaryCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示 */
export const Default: Story = {
  args: {
    icon: Clock3,
    label: '記録された時間',
    value: '32h 15m',
    description: 'この期間で名前が付いた時間',
  },
};

/** 前期間比トレンド（良い変化） */
export const WithTrendPositive: Story = {
  args: {
    icon: Clock3,
    label: '記録された時間',
    value: '32h 15m',
    description: 'この期間で名前が付いた時間',
    trend: { direction: 'up', delta: 0.12, isPositive: true },
  },
};

/** 前期間比トレンド（悪い変化） */
export const WithTrendNegative: Story = {
  args: {
    icon: Gauge,
    label: '計画達成率',
    value: '64%',
    description: '予定と実績の一致度',
    trend: { direction: 'down', delta: -0.18, isPositive: false },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { icon: Clock3, label: '', value: '', description: '' },
  render: () => (
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryCard
        icon={Clock3}
        label="記録された時間"
        value="32h 15m"
        description="この期間で名前が付いた時間"
        trend={{ direction: 'up', delta: 0.12, isPositive: true }}
      />
      <SummaryCard
        icon={Gauge}
        label="計画達成率"
        value="86%"
        description="予定と実績の一致度"
        trend={{ direction: 'down', delta: -0.05, isPositive: false }}
      />
      <SummaryCard
        icon={Trophy}
        label="最も多いタグ"
        value="Deep Work"
        description="17h 0m / 35%"
      />
    </div>
  ),
};
