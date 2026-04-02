import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { InsightsEmptyState } from './InsightsEmptyState';

/** InsightsEmptyState — Insights タブの空状態（3段階: no_records / insufficient_data / pending） */
const meta = {
  title: 'Features/Stats/Insights/EmptyState',
  component: InsightsEmptyState,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InsightsEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 記録なし（前回記録あり） */
export const NoRecords: Story = {
  args: {
    info: {
      reason: 'no_records',
      lastRecordDate: new Date('2026-03-03'),
      lastInsightPath: '/stats/insights?date=2026-03-03',
    },
  },
};

/** 記録なし（前回記録なし — 新規ユーザー） */
export const NoRecordsNewUser: Story = {
  args: {
    info: {
      reason: 'no_records',
    },
  },
};

/** データ不足（1日分） */
export const InsufficientDataOneDay: Story = {
  args: {
    info: {
      reason: 'insufficient_data',
      recordedDays: [{ dayLabel: '月曜', duration: '2h 30m' }],
    },
  },
};

/** データ不足（2日分） */
export const InsufficientDataTwoDays: Story = {
  args: {
    info: {
      reason: 'insufficient_data',
      recordedDays: [
        { dayLabel: '月曜', duration: '2h 30m' },
        { dayLabel: '水曜', duration: '4h 15m' },
      ],
    },
  },
};

/** 生成待ち */
export const PendingGeneration: Story = {
  args: {
    info: {
      reason: 'pending_generation',
      expectedDate: new Date('2026-03-23'),
    },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { info: { reason: 'no_records' } },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="max-w-md">
        <p className="text-muted-foreground mb-4 text-xs">NoRecords（記録なし・前回記録あり）</p>
        <InsightsEmptyState
          info={{
            reason: 'no_records',
            lastRecordDate: new Date('2026-03-03'),
            lastInsightPath: '/stats/insights?date=2026-03-03',
          }}
        />
      </div>
      <div className="max-w-md">
        <p className="text-muted-foreground mb-4 text-xs">
          NoRecordsNewUser（記録なし・新規ユーザー）
        </p>
        <InsightsEmptyState
          info={{
            reason: 'no_records',
          }}
        />
      </div>
      <div className="max-w-md">
        <p className="text-muted-foreground mb-4 text-xs">
          InsufficientDataOneDay（データ不足・1日分）
        </p>
        <InsightsEmptyState
          info={{
            reason: 'insufficient_data',
            recordedDays: [{ dayLabel: '月曜', duration: '2h 30m' }],
          }}
        />
      </div>
      <div className="max-w-md">
        <p className="text-muted-foreground mb-4 text-xs">
          InsufficientDataTwoDays（データ不足・2日分）
        </p>
        <InsightsEmptyState
          info={{
            reason: 'insufficient_data',
            recordedDays: [
              { dayLabel: '月曜', duration: '2h 30m' },
              { dayLabel: '水曜', duration: '4h 15m' },
            ],
          }}
        />
      </div>
      <div className="max-w-md">
        <p className="text-muted-foreground mb-4 text-xs">PendingGeneration（生成待ち）</p>
        <InsightsEmptyState
          info={{
            reason: 'pending_generation',
            expectedDate: new Date('2026-03-23'),
          }}
        />
      </div>
    </div>
  ),
};
