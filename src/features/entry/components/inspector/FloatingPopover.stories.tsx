import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { FloatingPopover } from './FloatingPopover';

/**
 * FloatingPopover — Inspector フローティングポップオーバー（PC用）。
 *
 * クリックされたブロックの斜め下に fixed 配置で表示する。
 * 右にスペースがあれば右斜め下、なければ左斜め下に配置。
 * フォーカストラップ・Tabキーでパネル内循環・Escで閉じる（onClose 呼び出し）。
 */
const meta = {
  title: 'Features/Entry/Inspector/FloatingPopover',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// ダミーコンテンツ
// ---------------------------------------------------------------------------

function InspectorPlaceholder() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-foreground font-medium">チームミーティング</p>
      <p className="text-muted-foreground text-sm">10:00 – 11:00</p>
      <p className="text-muted-foreground text-xs">詳細情報がここに表示されます。</p>
      <button
        type="button"
        className="bg-primary text-primary-foreground rounded-lg px-2 py-2 text-sm"
      >
        保存
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** anchorRect なし — 画面中央に配置。 */
export const Centered: Story = {
  render: () => (
    <FloatingPopover onClose={fn()} title="エントリ詳細">
      <InspectorPlaceholder />
    </FloatingPopover>
  ),
};

/** ブロックの右斜め下に配置。 */
export const AnchoredBottomRight: Story = {
  render: () => (
    <FloatingPopover
      onClose={fn()}
      title="エントリ詳細"
      anchorRect={{ top: 100, left: 40, right: 180, bottom: 170, width: 140, height: 70 }}
    >
      <InspectorPlaceholder />
    </FloatingPopover>
  ),
};

/** 画面右側のブロック — 左斜め下に配置。 */
export const AnchoredBottomLeft: Story = {
  render: () => (
    <FloatingPopover
      onClose={fn()}
      title="エントリ詳細"
      anchorRect={{ top: 100, left: 900, right: 1200, bottom: 170, width: 300, height: 70 }}
    >
      <InspectorPlaceholder />
    </FloatingPopover>
  ),
};

/** スクロールコンテンツ — max-h-[40rem] を超えるコンテンツはスクロール可能。 */
export const WithScrollContent: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <FloatingPopover onClose={fn()} title="エントリ詳細（スクロール）">
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="border-border rounded-lg border p-2 text-sm">
            フィールド {i + 1}
          </div>
        ))}
      </div>
    </FloatingPopover>
  ),
};
