import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { EntryMicroInsight } from './EntryMicroInsight';

/**
 * EntryMicroInsight — Inspector 内の1行インサイト
 *
 * TagRow の下、スケジュールカードの上に配置予定。
 * watching AI 哲学: 言うべきことがあるときだけ、控えめに表示。
 *
 * - 優先度1: 見積もり超過バイアス（行動可能性最高）
 * - 優先度2: ピーク時間帯通知
 */
const meta = {
  title: 'Product/Features/Stats/Shared/EntryMicroInsight',
  component: EntryMicroInsight,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="bg-card max-w-sm rounded-lg p-4">
        {/* Inspector 風のコンテキスト */}
        <div className="flex items-center gap-2">
          <span className="bg-primary size-3.5 rounded-full" />
          <span className="text-foreground text-sm">朝のコーディング</span>
        </div>
        <div className="mt-2">
          <Story />
        </div>
        <div className="bg-muted mt-4 rounded-2xl p-4">
          <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof EntryMicroInsight>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 見積もり超過バイアス（優先度1） */
export const EstimationBias: Story = {
  args: {
    insight: {
      type: 'estimation_bias',
      messageKey: 'estimationBiasOver',
      messageParams: { bias: 25 },
    },
  },
};

/** 見積もり過少バイアス */
export const EstimationBiasUnder: Story = {
  args: {
    insight: {
      type: 'estimation_bias',
      messageKey: 'estimationBiasUnder',
      messageParams: { bias: 15 },
    },
  },
};

/** ピーク時間帯（優先度2） */
export const DeepHour: Story = {
  args: {
    insight: {
      type: 'deep_hour',
      messageKey: 'deepHour',
    },
  },
};

/** null（言うべきことがない → 非表示） */
export const NoInsight: Story = {
  args: { insight: null },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    insight: {
      type: 'estimation_bias',
      messageKey: 'estimationBiasOver',
      messageParams: { bias: 25 },
    },
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">EstimationBias（見積もり超過バイアス）</p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3.5 rounded-full" />
            <span className="text-foreground text-sm">朝のコーディング</span>
          </div>
          <div className="mt-2">
            <EntryMicroInsight
              insight={{
                type: 'estimation_bias',
                messageKey: 'estimationBiasOver',
                messageParams: { bias: 25 },
              }}
            />
          </div>
          <div className="bg-muted mt-4 rounded-2xl p-4">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">
          EstimationBiasUnder（見積もり過少バイアス）
        </p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3.5 rounded-full" />
            <span className="text-foreground text-sm">朝のコーディング</span>
          </div>
          <div className="mt-2">
            <EntryMicroInsight
              insight={{
                type: 'estimation_bias',
                messageKey: 'estimationBiasUnder',
                messageParams: { bias: 15 },
              }}
            />
          </div>
          <div className="bg-muted mt-4 rounded-2xl p-4">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">DeepHour（ピーク時間帯）</p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3.5 rounded-full" />
            <span className="text-foreground text-sm">朝のコーディング</span>
          </div>
          <div className="mt-2">
            <EntryMicroInsight
              insight={{
                type: 'deep_hour',
                messageKey: 'deepHour',
              }}
            />
          </div>
          <div className="bg-muted mt-4 rounded-2xl p-4">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">NoInsight（null・非表示）</p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3.5 rounded-full" />
            <span className="text-foreground text-sm">朝のコーディング</span>
          </div>
          <div className="mt-2">
            <EntryMicroInsight insight={null} />
          </div>
          <div className="bg-muted mt-4 rounded-2xl p-4">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
    </div>
  ),
};
