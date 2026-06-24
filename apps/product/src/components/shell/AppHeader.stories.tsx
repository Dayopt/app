import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BarChart3, CalendarDays } from 'lucide-react';

import { AppHeader } from '@/components/shell/AppHeader';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────
// Stub UI Helpers
// ─────────────────────────────────────────────────────────

/** 左スロットのスタブ（MobileFilterButton等の代替） */
function StubLeftSlot() {
  return (
    <button
      type="button"
      className="border-border bg-container hover:bg-state-hover rounded-lg border px-2 py-1 text-xs"
    >
      フィルタ
    </button>
  );
}

/** 右スロットのスタブ */
function StubRightSlot() {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-2 py-1 text-xs"
      >
        週
      </button>
      <button
        type="button"
        className="border-border bg-container hover:bg-state-hover rounded-lg border px-2 py-1 text-xs"
      >
        月
      </button>
    </div>
  );
}

/** PageNav モック（ヘッダー rightSlot 用） */
function StubPageNav({ activePage = 'calendar' }: { activePage?: 'calendar' | 'stats' }) {
  return (
    <div className="border-border flex items-center rounded-lg border" role="tablist">
      <button
        role="tab"
        aria-selected={activePage === 'calendar'}
        className={cn(
          'flex h-7 items-center justify-center gap-1 rounded-lg px-4 text-sm transition-colors',
          activePage === 'calendar'
            ? 'bg-state-selected text-foreground'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <CalendarDays className="size-3.5" />
        <span>カレンダー</span>
      </button>
      <button
        role="tab"
        aria-selected={activePage === 'stats'}
        className={cn(
          'flex h-7 items-center justify-center gap-1 rounded-lg px-4 text-sm transition-colors',
          activePage === 'stats'
            ? 'bg-state-selected text-foreground'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <BarChart3 className="size-3.5" />
        <span>統計</span>
      </button>
    </div>
  );
}

/** AppHeader - アプリ共通ヘッダーシェル */
const meta = {
  title: 'Product/Components/Shell/AppHeader',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** タイトル表示（通常ページ） */
export const Default: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader>
        <h1 className="truncate text-lg leading-8 font-medium">Plans</h1>
      </AppHeader>
    </div>
  ),
};

/** モバイル表示。viewport addon で md:hidden / hidden md:flex が自動切替。 */
export const Mobile: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader leftSlot={<StubLeftSlot />}>
        <h1 className="truncate text-lg leading-8 font-medium">Plans</h1>
      </AppHeader>
    </div>
  ),
  globals: {
    viewport: { value: 'mobile1' },
  },
};

/**
 * leftSlot + rightSlot パターン
 *
 * モバイルではleftSlotにフィルターボタン等、
 * デスクトップではrightSlotにコントロール群を配置。
 */
export const WithSlots: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader leftSlot={<StubLeftSlot />} rightSlot={<StubRightSlot />}>
        <h1 className="truncate text-lg leading-8 font-medium">カレンダー</h1>
      </AppHeader>
    </div>
  ),
};

/** rightSlotのみ */
export const WithRightSlot: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader rightSlot={<StubRightSlot />}>
        <h1 className="truncate text-lg leading-8 font-medium">カレンダー</h1>
      </AppHeader>
    </div>
  ),
};

/** rightSlot に PageNav を配置（実際のレイアウト） */
export const WithPageNav: Story = {
  render: () => (
    <div className="border-border w-full border">
      <AppHeader rightSlot={<StubPageNav />}>
        <h1 className="truncate text-lg leading-8 font-medium">カレンダー</h1>
      </AppHeader>
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="border-border w-full border">
        <AppHeader>
          <h1 className="truncate text-lg leading-8 font-medium">タイトルのみ</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader leftSlot={<StubLeftSlot />}>
          <h1 className="truncate text-lg leading-8 font-medium">leftSlot付き</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader rightSlot={<StubRightSlot />}>
          <h1 className="truncate text-lg leading-8 font-medium">rightSlot付き</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader leftSlot={<StubLeftSlot />} rightSlot={<StubRightSlot />}>
          <h1 className="truncate text-lg leading-8 font-medium">全スロット</h1>
        </AppHeader>
      </div>
      <div className="border-border w-full border">
        <AppHeader rightSlot={<StubPageNav />}>
          <h1 className="truncate text-lg leading-8 font-medium">PageNav付き</h1>
        </AppHeader>
      </div>
    </div>
  ),
};
