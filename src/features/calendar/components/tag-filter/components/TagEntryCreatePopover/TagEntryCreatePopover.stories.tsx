import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { TagEntryCreatePopover } from './TagEntryCreatePopover';

const MOCK_TAG = {
  id: 'tag-deep-work',
  name: '仕事:Deep Work',
  color: 'blue',
  icon: 'briefcase',
};

/**
 * trpcMocks で配線する最小セット。
 * - `entries.list`: 今日のエントリ（デフォルト空配列）→ 開始時刻チップは「今」のみ
 *
 * Story 側で実データを詰めれば blocking entry / chained entry のケースも再現可能。
 */
function mockTrpc(entries: unknown[] = []) {
  return {
    'entries.list': entries,
  };
}

/**
 * sidebar タグ行クリックで開くエントリ作成ポップアップ（ミニマル 3 要素構成）。
 *
 * - ヘッダー: タグアイコン + 名前（colon ラベル）
 * - 開始時刻: 今 / 30 分境界 / 次の空きチップ（entries.list から動的算出）
 * - 期間: 5-240m スライダー
 * - 作成: undo トースト 5s、エラー時は popover 閉じない
 *
 * (j) で日付セレクタ追加、(k) で variants 再設計予定。
 */
const meta = {
  title: 'Features/Calendar/Sidebar/TagFilter/TagEntryCreatePopover',
  component: TagEntryCreatePopover,
  parameters: {
    layout: 'centered',
    // aria-dialog-name: Radix Popover portal has role="dialog" without accessible name
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    tag: MOCK_TAG,
    defaultDurationMinutes: 30,
  },
} satisfies Meta<typeof TagEntryCreatePopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 共通 render: controlled state + relative な親（sidebar タグ行の代用） */
function renderPopover(defaultDuration: number, isMobile = false) {
  function Renderer() {
    const [open, setOpen] = useState(true);
    return (
      <div className="w-64">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="border-border hover:bg-state-hover relative flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm"
        >
          <span aria-hidden className="bg-tag-blue size-2 shrink-0 rounded-full" />
          <span className="truncate">仕事:Deep Work</span>
          <TagEntryCreatePopover
            open={open}
            onOpenChange={setOpen}
            tag={MOCK_TAG}
            defaultDurationMinutes={defaultDuration}
            isMobile={isMobile}
          />
        </div>
      </div>
    );
  }
  return <Renderer />;
}

/** デフォルト: 今日のエントリなし → 開始時刻チップは「今」のみ、slider 30m */
export const Default: Story = {
  parameters: { trpcMocks: mockTrpc() },
  render: () => renderPopover(30),
};

/**
 * モバイル: bottom sheet（vaul Drawer）で画面下から開く。
 * Storybook viewport は mobile1 固定。実機では `isMobile` を TagFlatList から渡す。
 */
export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    layout: 'fullscreen',
    trpcMocks: mockTrpc(),
  },
  render: () => renderPopover(30, true),
};
