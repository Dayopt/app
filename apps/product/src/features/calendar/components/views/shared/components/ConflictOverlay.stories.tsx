import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ConflictOverlay } from './ConflictOverlay';

const MESSAGE = 'この時間帯には既に予定があります';

/**
 * 重複検出時の destructive オーバーレイ。drag / resize / 新規選択 /
 * タグ下書きの 5 面で共有する「この時間帯には既に予定があります」表示。
 */
const meta = {
  title: 'Product/Features/Calendar/Interaction/ConflictOverlay',
  component: ConflictOverlay,
  args: { message: MESSAGE },
  // color-contrast: text-destructive on bg-destructive-tint（設計上可読）
  parameters: { layout: 'padded', a11y: { test: 'todo' } },
  tags: ['autodocs'],
} satisfies Meta<typeof ConflictOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const PREVIEW_TIME = {
  start: new Date(2026, 5, 5, 9, 0),
  end: new Date(2026, 5, 5, 10, 0),
};

/** カレンダーブロック相当のサイズ枠（positioned 親）。 */
function Slot({ children, height = 64 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="relative w-56" style={{ height }}>
      {children}
    </div>
  );
}

/** 左アクセント + 本体を持つ既存ブロック相当の背景（rounded-r-lg / 左角四角）。 */
function Block({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-56 overflow-hidden rounded-r-lg" style={{ height: 64 }}>
      <div className="flex h-full">
        <div className="bg-tag-blue shrink-0 opacity-70" style={{ width: 3 }} />
        <div className="bg-card flex-1" />
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 標準（drag ゴースト相当）。メッセージ + プレビュー時刻を 24h で表示。 */
export const Default: Story = {
  render: () => (
    <Slot>
      <ConflictOverlay message={MESSAGE} previewTime={PREVIEW_TIME} className="h-full" />
    </Slot>
  ),
};

/** 整形済み時刻ラベル（12h/24h 対応）を渡すケース。新規選択で使用。 */
export const WithTimeLabel: Story = {
  render: () => (
    <Slot>
      <ConflictOverlay message={MESSAGE} timeLabel="1:00 PM – 2:00 PM" className="h-full" />
    </Slot>
  ),
};

/** previewTimeをユーザー設定の12時間表記で整形するケース。 */
export const TwelveHour: Story = {
  render: () => (
    <Slot>
      <ConflictOverlay
        message={MESSAGE}
        previewTime={PREVIEW_TIME}
        timeFormat="12h"
        className="h-full"
      />
    </Slot>
  ),
};

/** compact（高さ < 40px の小ブロック）。メッセージ 1 行のみ縦中央。 */
export const Compact: Story = {
  render: () => (
    <Slot height={28}>
      <ConflictOverlay message={MESSAGE} compact className="h-full" />
    </Slot>
  ),
};

/** ブロック前面（resize / 下書き相当）。左角四角でカードの rounded-r-lg に揃える。 */
export const OnBlock: Story = {
  render: () => (
    <Block>
      <ConflictOverlay
        message={MESSAGE}
        previewTime={PREVIEW_TIME}
        className="absolute inset-0 rounded-l-none"
        style={{ zIndex: 40 }}
      />
    </Block>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <Slot>
        <ConflictOverlay message={MESSAGE} previewTime={PREVIEW_TIME} className="h-full" />
      </Slot>
      <Slot>
        <ConflictOverlay message={MESSAGE} timeLabel="1:00 PM – 2:00 PM" className="h-full" />
      </Slot>
      <Slot>
        <ConflictOverlay
          message={MESSAGE}
          previewTime={PREVIEW_TIME}
          timeFormat="12h"
          className="h-full"
        />
      </Slot>
      <Slot height={28}>
        <ConflictOverlay message={MESSAGE} compact className="h-full" />
      </Slot>
      <Block>
        <ConflictOverlay
          message={MESSAGE}
          previewTime={PREVIEW_TIME}
          className="absolute inset-0 rounded-l-none"
          style={{ zIndex: 40 }}
        />
      </Block>
    </div>
  ),
};
