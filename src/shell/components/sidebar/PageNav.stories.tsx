/**
 * PageNav Stories
 *
 * サイドバー上部のページナビゲーション（Calendar / Stats セグメントコントロール）。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BarChart3, CalendarDays } from 'lucide-react';

import { cn } from '@/lib/utils';

// PageNav は usePathname / useCalendarNavigation 等に依存するため、
// ストーリーでは同じ見た目の静的モックを使用する。

// ─────────────────────────────────────────────────────────
// モック: PageNav の見た目を再現
// ─────────────────────────────────────────────────────────

function MockPageNav({ activePage = 'calendar' }: { activePage?: 'calendar' | 'stats' }) {
  return (
    <div
      className="bg-muted flex h-9 items-center gap-1 rounded-lg p-1"
      role="tablist"
      aria-label="Page navigation"
    >
      <button
        role="tab"
        aria-selected={activePage === 'calendar'}
        className={cn(
          'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-all',
          activePage === 'calendar'
            ? 'bg-background text-foreground font-medium shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <CalendarDays className="size-4" />
        <span>カレンダー</span>
      </button>
      <button
        role="tab"
        aria-selected={activePage === 'stats'}
        className={cn(
          'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-all',
          activePage === 'stats'
            ? 'bg-background text-foreground font-medium shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <BarChart3 className="size-4" />
        <span>統計</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** PageNav — サイドバー上部のページナビゲーション。Calendar/Stats のセグメントコントロール。 */
const meta = {
  title: 'Components/Shell/Sidebar/PageNav',
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
  decorators: [
    (Story) => (
      <div className="w-[240px]">
        <Story />
      </div>
    ),
  ],
};

/** 統計がアクティブ。 */
export const StatsActive: Story = {
  args: {
    activePage: 'stats',
  },
  decorators: [
    (Story) => (
      <div className="w-[240px]">
        <Story />
      </div>
    ),
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Calendar Active</p>
        <div className="w-[240px]">
          <MockPageNav activePage="calendar" />
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Stats Active</p>
        <div className="w-[240px]">
          <MockPageNav activePage="stats" />
        </div>
      </div>
    </div>
  ),
};
