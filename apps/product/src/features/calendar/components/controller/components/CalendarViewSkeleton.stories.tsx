import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CalendarViewSkeleton } from './CalendarViewSkeleton';

/**
 * カレンダービュー用スケルトンローダー。
 * CLSを防ぐため実際のビューと同じ構造を維持。
 * 時間ラベル列 + グリッド本体 + ダミーイベントスロット。
 */
const meta = {
  title: 'Product/Features/Calendar/Feedback/ViewSkeleton',
  component: CalendarViewSkeleton,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof CalendarViewSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（標準の高さ）。 */
export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="h-[600px] w-full">
        <Story />
      </div>
    ),
  ],
};

/** 小さいコンテナ内でのスケルトン（モバイル相当）。 */
export const Small: Story = {
  decorators: [
    (Story) => (
      <div className="h-[300px] w-[375px]">
        <Story />
      </div>
    ),
  ],
};

/** 大きいコンテナ内でのスケルトン（デスクトップ相当）。 */
export const Large: Story = {
  decorators: [
    (Story) => (
      <div className="h-[800px] w-full">
        <Story />
      </div>
    ),
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-full flex-col items-start gap-8">
      <div className="w-full space-y-2">
        <p className="text-muted-foreground text-xs">標準（600px）</p>
        <div className="border-border h-[600px] w-full overflow-hidden rounded-lg border">
          <CalendarViewSkeleton />
        </div>
      </div>
      <div className="w-full space-y-2">
        <p className="text-muted-foreground text-xs">モバイル（375×300px）</p>
        <div className="border-border h-[300px] w-[375px] overflow-hidden rounded-lg border">
          <CalendarViewSkeleton />
        </div>
      </div>
    </div>
  ),
};
