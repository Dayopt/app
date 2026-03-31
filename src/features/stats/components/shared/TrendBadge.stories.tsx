import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TrendBadge } from './TrendBadge';

/** TrendBadge — 前期間比のトレンド方向と変化率を表示するバッジ */
const meta = {
  title: 'Features/Stats/Shared/TrendBadge',
  component: TrendBadge,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof TrendBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 上昇（良い変化） */
export const UpPositive: Story = {
  args: {
    trend: { direction: 'up', delta: 0.12, isPositive: true },
  },
};

/** 下降（悪い変化） */
export const DownNegative: Story = {
  args: {
    trend: { direction: 'down', delta: -0.08, isPositive: false },
  },
};

/** 下降（良い変化 — blankRate の減少など） */
export const DownPositive: Story = {
  args: {
    trend: { direction: 'down', delta: -0.15, isPositive: true },
  },
};

/** flat — 何も表示しない */
export const Flat: Story = {
  args: {
    trend: { direction: 'flat', delta: 0.02, isPositive: true },
  },
};

/** md サイズ */
export const MediumSize: Story = {
  args: {
    trend: { direction: 'up', delta: 0.25, isPositive: true },
    size: 'md',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { trend: { direction: 'up', delta: 0.12, isPositive: true } },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">
          UpPositive（上昇・良い変化）
        </p>
        <TrendBadge trend={{ direction: 'up', delta: 0.12, isPositive: true }} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">
          DownNegative（下降・悪い変化）
        </p>
        <TrendBadge trend={{ direction: 'down', delta: -0.08, isPositive: false }} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">
          DownPositive（下降・良い変化）
        </p>
        <TrendBadge trend={{ direction: 'down', delta: -0.15, isPositive: true }} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">Flat（横ばい・非表示）</p>
        <TrendBadge trend={{ direction: 'flat', delta: 0.02, isPositive: true }} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">MediumSize（mdサイズ）</p>
        <TrendBadge trend={{ direction: 'up', delta: 0.25, isPositive: true }} size="md" />
      </div>
    </div>
  ),
};
