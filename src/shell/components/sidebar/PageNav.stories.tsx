/**
 * PageNav Stories
 *
 * ヘッダー右端のページナビゲーション（Calendar / Stats セグメントコントロール）。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BarChart3, CalendarDays } from 'lucide-react';

import { cn } from '@/lib/utils';

// PageNav は usePathname / useCalendarNavigation 等に依存するため、
// ストーリーでは同じ見た目の静的モックを使用する。

// ─────────────────────────────────────────────────────────
// モック: PageNav の見た目を再現（outline スタイル）
// ─────────────────────────────────────────────────────────

function MockPageNav({ activePage = 'calendar' }: { activePage?: 'calendar' | 'stats' }) {
  return (
    <div
      className="border-border flex items-center rounded-lg border"
      role="tablist"
      aria-label="Page navigation"
    >
      <button
        role="tab"
        aria-selected={activePage === 'calendar'}
        className={cn(
          'flex h-7 items-center justify-center gap-1 rounded-lg px-4 text-sm transition-colors',
          activePage === 'calendar'
            ? 'bg-state-selected text-foreground font-medium'
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
            ? 'bg-state-selected text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <BarChart3 className="size-3.5" />
        <span>統計</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** PageNav — ヘッダー右端のページナビゲーション。Calendar/Stats のセグメントコントロール。 */
const meta = {
  title: 'Components/Shell/PageNav',
  component: MockPageNav,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MockPageNav>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** カレンダーがアクティブ（デフォルト）。 */
export const CalendarActive: Story = {
  args: {
    activePage: 'calendar',
  },
};

/** 統計がアクティブ。 */
export const StatsActive: Story = {
  args: {
    activePage: 'stats',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Calendar Active</p>
        <MockPageNav activePage="calendar" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Stats Active</p>
        <MockPageNav activePage="stats" />
      </div>
    </div>
  ),
};
