/**
 * PageNav Stories
 *
 * ヘッダー右端のページナビゲーション（Calendar / Stats / AI セグメントコントロール）。
 * 実装は Phase 2-B Step 2 で nav + Link + aria-current に移行済。
 * mock も Link ベース (aria-current) に揃える (Phase 2-C Step C-5)。
 * Phase 2-D Step D-2 で v2 デザイン (expanding tab) に同期。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BarChart3, CalendarDays, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

// PageNav は usePathname / useCalendarNavigation 等に依存するため、
// ストーリーでは同じ見た目の静的モックを使用する。

type ActivePage = 'calendar' | 'stats' | 'ai';

function MockPageNav({ activePage = 'calendar' }: { activePage?: ActivePage }) {
  const tabs: Array<{ id: ActivePage; label: string; icon: typeof CalendarDays; href: string }> = [
    { id: 'calendar', label: 'カレンダー', icon: CalendarDays, href: '/ja/calendar/day' },
    { id: 'stats', label: '統計', icon: BarChart3, href: '/ja/stats/review' },
    { id: 'ai', label: 'AI', icon: Sparkles, href: '/ja/ai' },
  ];

  return (
    <nav className="flex items-center" aria-label="ページナビゲーション">
      {tabs.map((tab) => {
        const isActive = activePage === tab.id;
        const Icon = tab.icon;
        return (
          <a
            key={tab.id}
            href={tab.href}
            aria-label={isActive ? undefined : tab.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-8 items-center justify-center rounded-lg text-sm no-underline',
              'transition-all duration-200 motion-reduce:transition-none',
              'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              isActive
                ? 'bg-muted text-foreground gap-2 px-4 font-medium'
                : 'text-muted-foreground hover:bg-state-hover w-8',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span
              className={cn(
                'overflow-hidden whitespace-nowrap',
                'transition-all duration-200 motion-reduce:transition-none',
                isActive ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0',
              )}
            >
              {tab.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

/** PageNav — ヘッダー右端のページナビゲーション。Calendar / Stats / AI のセグメントコントロール。 */
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

/** AI がアクティブ（Watching AI への動線）。 */
export const AiActive: Story = {
  args: {
    activePage: 'ai',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Calendar Active</p>
        <MockPageNav activePage="calendar" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Stats Active</p>
        <MockPageNav activePage="stats" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">AI Active</p>
        <MockPageNav activePage="ai" />
      </div>
    </div>
  ),
};
