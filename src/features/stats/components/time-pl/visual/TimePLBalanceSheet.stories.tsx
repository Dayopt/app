import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimePLBalanceSheet } from './TimePLBalanceSheet';
import {
  MOCK_BS_DAY,
  MOCK_BS_WEEK_BALANCED,
  MOCK_BS_WEEK_BUSY,
  MOCK_BS_WEEK_LIGHT,
} from './timePLBalanceSheet.mocks';

/** 時間貸借対照表 — 可処分時間を資産（実績）と負債＋資本（計画）に分解 */
const meta = {
  title: 'Features/Stats/TimePL/Visual/BalanceSheet',
  component: TimePLBalanceSheet,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimePLBalanceSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 週次: バランスの取れた標準的な週 */
export const Default: Story = {
  args: { data: MOCK_BS_WEEK_BALANCED },
};

/** 予定過多（負債比率が高い） */
export const BusyWeek: Story = {
  args: { data: MOCK_BS_WEEK_BUSY },
};

/** 予定少なめ（資本が厚い） */
export const LightWeek: Story = {
  args: { data: MOCK_BS_WEEK_LIGHT },
};

/** 日次ビュー */
export const DayView: Story = {
  args: { data: MOCK_BS_DAY },
};

/** データなし */
export const Empty: Story = {
  args: { data: null },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: { data: MOCK_BS_WEEK_BALANCED },
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">標準（バランス型）</p>
        <TimePLBalanceSheet data={MOCK_BS_WEEK_BALANCED} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">多忙（負債比率 高）</p>
        <TimePLBalanceSheet data={MOCK_BS_WEEK_BUSY} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">余裕（資本 厚い）</p>
        <TimePLBalanceSheet data={MOCK_BS_WEEK_LIGHT} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">日次</p>
        <TimePLBalanceSheet data={MOCK_BS_DAY} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Empty</p>
        <TimePLBalanceSheet data={null} />
      </div>
    </div>
  ),
};
