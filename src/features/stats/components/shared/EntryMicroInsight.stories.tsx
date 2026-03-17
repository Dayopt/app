import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { EntryMicroInsight } from './EntryMicroInsight';

/**
 * EntryMicroInsight — Inspector 内の1行インサイト
 *
 * TagRow の下、スケジュールカードの上に配置予定。
 * watching AI 哲学: 言うべきことがあるときだけ、控えめに表示。
 *
 * - 優先度1: 見積もり超過バイアス（行動可能性最高）
 * - 優先度2: 時間帯の充実度偏差
 * - 優先度3: タグの充実度偏差
 * - 優先度4: ピーク時間帯通知
 */
const meta = {
  title: 'Features/Stats/Shared/EntryMicroInsight',
  component: EntryMicroInsight,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="bg-card max-w-sm rounded-lg p-4">
        {/* Inspector 風のコンテキスト */}
        <div className="flex items-center gap-2">
          <span className="bg-primary size-3 rounded-full" />
          <span className="text-foreground text-sm font-medium">朝のコーディング</span>
        </div>
        <div className="mt-1.5">
          <Story />
        </div>
        <div className="bg-surface-inset mt-3 rounded-xl p-3">
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
      message: 'このタグは平均 +25 分超過する傾向があります',
    },
  },
};

/** 見積もり過少バイアス */
export const EstimationBiasUnder: Story = {
  args: {
    insight: {
      type: 'estimation_bias',
      message: 'このタグは平均 -15 分早く終わる傾向があります',
    },
  },
};

/** 時間帯の充実度が高い（優先度2） */
export const HourlyFulfillmentHigh: Story = {
  args: {
    insight: {
      type: 'hourly_fulfillment',
      message: 'この時間帯の充実度は平均より高い傾向があります',
    },
  },
};

/** 時間帯の充実度が低い */
export const HourlyFulfillmentLow: Story = {
  args: {
    insight: {
      type: 'hourly_fulfillment',
      message: 'この時間帯の充実度は平均より低い傾向があります',
    },
  },
};

/** タグの充実度偏差（優先度3） */
export const TagFulfillment: Story = {
  args: {
    insight: {
      type: 'tag_fulfillment',
      message: 'このタグの平均充実度は 4.2 — 全体より高めです',
    },
  },
};

/** ピーク時間帯（優先度4） */
export const PeakHour: Story = {
  args: {
    insight: {
      type: 'peak_hour',
      message: 'ピーク時間帯です — 集中作業に向いています',
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
    insight: { type: 'estimation_bias', message: 'このタグは平均 +25 分超過する傾向があります' },
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          EstimationBias（見積もり超過バイアス）
        </p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight
              insight={{
                type: 'estimation_bias',
                message: 'このタグは平均 +25 分超過する傾向があります',
              }}
            />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          EstimationBiasUnder（見積もり過少バイアス）
        </p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight
              insight={{
                type: 'estimation_bias',
                message: 'このタグは平均 -15 分早く終わる傾向があります',
              }}
            />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          HourlyFulfillmentHigh（時間帯充実度・高）
        </p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight
              insight={{
                type: 'hourly_fulfillment',
                message: 'この時間帯の充実度は平均より高い傾向があります',
              }}
            />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          HourlyFulfillmentLow（時間帯充実度・低）
        </p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight
              insight={{
                type: 'hourly_fulfillment',
                message: 'この時間帯の充実度は平均より低い傾向があります',
              }}
            />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          TagFulfillment（タグ充実度偏差）
        </p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight
              insight={{
                type: 'tag_fulfillment',
                message: 'このタグの平均充実度は 4.2 — 全体より高めです',
              }}
            />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">PeakHour（ピーク時間帯）</p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight
              insight={{
                type: 'peak_hour',
                message: 'ピーク時間帯です — 集中作業に向いています',
              }}
            />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">NoInsight（null・非表示）</p>
        <div className="bg-card max-w-sm rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-3 rounded-full" />
            <span className="text-foreground text-sm font-medium">朝のコーディング</span>
          </div>
          <div className="mt-1.5">
            <EntryMicroInsight insight={null} />
          </div>
          <div className="bg-surface-inset mt-3 rounded-xl p-3">
            <span className="text-muted-foreground text-xs">10:00 - 12:00</span>
          </div>
        </div>
      </div>
    </div>
  ),
};
