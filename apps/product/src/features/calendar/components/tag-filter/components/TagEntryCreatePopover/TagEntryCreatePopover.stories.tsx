import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { TagIcon } from '@/features/tags';

import { TagEntryCreatePopover } from './TagEntryCreatePopover';

const MOCK_TAG = {
  id: 'tag-deep-work',
  name: '仕事:Deep Work',
  color: 'blue',
  icon: 'briefcase',
};

/** trpcMocks: 今日分 entries.list（既定は空配列） */
function mockTrpc(entries: unknown[] = []) {
  return { 'entries.list': entries };
}

/**
 * sidebar タグ行クリック → エントリ作成ポップアップ（Inspector 流用版）。
 *
 * 構成:
 *   [icon] タグ名
 *   │ 📅 日付   04/22/2026   │
 *   │ 🕐 予定   07:15 → 08:45 │
 *              [キャンセル] [作成]
 *
 * - 日付 / 時刻入力は Inspector の DateRow / TimeRow を流用
 * - mobile sheet は Drawer の地色を使い、背景 calendar は操作させない
 * - 作成成功で popover close + 5s undo トースト。失敗時は popover 維持で再試行可能
 * - 実機 / dev での dogfooding を前提に、Storybook variants は配置確認用の最小セット
 */
const meta = {
  title: 'Product/Features/Calendar/Sidebar/TagFilter/TagEntryCreatePopover',
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
  },
} satisfies Meta<typeof TagEntryCreatePopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 共通 render: controlled state + sidebar タグ行の代用 trigger */
function renderPopover(opts: { isMobile?: boolean } = {}) {
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
          <TagIcon icon={MOCK_TAG.icon} color={MOCK_TAG.color} size="sm" />
          <span className="truncate">{MOCK_TAG.name}</span>
          <TagEntryCreatePopover
            open={open}
            onOpenChange={setOpen}
            tag={MOCK_TAG}
            isMobile={opts.isMobile ?? false}
          />
        </div>
      </div>
    );
  }
  return <Renderer />;
}

/** デフォルト: PC Popover で開いた状態。今日・現在時刻 +15 分 ceil が初期値 */
export const Default: Story = {
  parameters: { trpcMocks: mockTrpc() },
  render: () => renderPopover(),
};

/** モバイル: bottom sheet (vaul Drawer) で画面下から開く */
export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    layout: 'fullscreen',
    trpcMocks: mockTrpc(),
  },
  render: () => renderPopover({ isMobile: true }),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    layout: 'fullscreen',
    trpcMocks: mockTrpc(),
  },
  render: () => (
    <div className="bg-background min-h-[560px] p-4">{renderPopover({ isMobile: true })}</div>
  ),
};
