import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimePLStatement } from './TimePLStatement';
import {
  MOCK_PL_DAY_EXCELLENT,
  MOCK_PL_HIGH_ACCURACY,
  MOCK_PL_LOW_ACCURACY,
  MOCK_PL_MINIMAL,
  MOCK_PL_MONTH_POOR,
  MOCK_PL_WEEK_GOOD,
  MOCK_PL_WITH_UNPLANNED,
} from './timePL.mocks';

/** 時間損益計算書 — 予定(Budget)と記録(Actual)を財務P/L形式で比較表示 */
const meta = {
  title: 'Features/Stats/TimePL/TimePLStatement',
  component: TimePLStatement,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimePLStatement>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 週次・Good精度（デフォルト表示） */
export const Default: Story = {
  args: {
    data: MOCK_PL_WEEK_GOOD,
  },
};

/** 日次ビュー・Excellent精度 */
export const DayView: Story = {
  args: {
    data: MOCK_PL_DAY_EXCELLENT,
  },
};

/** 月次ビュー・Poor精度 */
export const MonthView: Story = {
  args: {
    data: MOCK_PL_MONTH_POOR,
  },
};

/** 高精度（95%+） — Excellentバッジ */
export const HighAccuracy: Story = {
  args: {
    data: MOCK_PL_HIGH_ACCURACY,
  },
};

/** 低精度（<70%） — Poorバッジ、差異が赤表示 */
export const LowAccuracy: Story = {
  args: {
    data: MOCK_PL_LOW_ACCURACY,
  },
};

/** 計画外エントリー含む — 障害対応・雑務が "new" 表示 */
export const WithUnplanned: Story = {
  args: {
    data: MOCK_PL_WITH_UNPLANNED,
  },
};

/** 最小構成: 1タグのみ */
export const SingleTag: Story = {
  args: {
    data: MOCK_PL_MINIMAL,
  },
};

/** データなし（EmptyState） */
export const Empty: Story = {
  args: {
    data: null,
  },
};

/** ローディング中（Skeleton） */
export const Loading: Story = {
  args: {
    data: null,
    isLoading: true,
  },
};

/** 前期比トレンド表示あり */
export const WithPrevComparison: Story = {
  args: {
    data: {
      ...MOCK_PL_WEEK_GOOD,
      prevAccuracyRate: 0.88,
    },
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: { data: MOCK_PL_WEEK_GOOD },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Default (Week / Good)</p>
        <TimePLStatement data={MOCK_PL_WEEK_GOOD} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Day / Excellent</p>
        <TimePLStatement data={MOCK_PL_DAY_EXCELLENT} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Month / Poor</p>
        <TimePLStatement data={MOCK_PL_MONTH_POOR} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">With Unplanned</p>
        <TimePLStatement data={MOCK_PL_WITH_UNPLANNED} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Single Tag</p>
        <TimePLStatement data={MOCK_PL_MINIMAL} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Empty</p>
        <TimePLStatement data={null} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Loading</p>
        <TimePLStatement data={null} isLoading />
      </div>
    </div>
  ),
};
