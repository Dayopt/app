import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { FloatingPopover } from './FloatingPopover';

/**
 * FloatingPopover — Inspector フローティングポップオーバー（PC用）。
 *
 * クリックされたブロックの横に fixed 配置で表示する。
 * anchorRect に基づいて左右・縦位置を自動計算する。
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
      <p className="text-foreground font-bold">チームミーティング</p>
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

/**
 * anchorRect なし — 画面中央に配置。
 *
 * anchorRect を省略した場合、ウィンドウ幅・高さを基準に中央配置される。
 */
export const Centered: Story = {
  render: () => (
    <FloatingPopover onClose={fn()} title="エントリ詳細">
      <InspectorPlaceholder />
    </FloatingPopover>
  ),
};

/**
 * 画面左側のアンカー — パネルは右側に配置。
 *
 * anchorRect.right から右に GAP=8px 空けて配置する。
 */
export const AnchoredLeft: Story = {
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

/**
 * 画面右側のアンカー — パネルは左側に配置。
 *
 * 右に十分なスペースがない場合、アンカーの左側に配置する。
 */
export const AnchoredRight: Story = {
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

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="text-foreground p-8">
      <p className="text-muted-foreground mb-4 text-sm">
        FloatingPopover は fixed 配置のため、各 Story を個別に確認してください。
        以下は参考として各バリアントのリストです。
      </p>
      <ul className="text-muted-foreground list-disc pl-4 text-xs leading-6">
        <li>Centered — anchorRect なし、画面中央</li>
        <li>AnchoredLeft — 左側アンカー、パネルは右に</li>
        <li>AnchoredRight — 右側アンカー、パネルは左に</li>
        <li>WithScrollContent — 長いコンテンツのスクロール</li>
      </ul>
    </div>
  ),
};
