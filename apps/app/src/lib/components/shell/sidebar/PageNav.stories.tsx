/**
 * PageNav Stories
 *
 * ヘッダー右端のページナビゲーション（Calendar / Review セグメントコントロール）。
 * 実装は nav + Link + aria-current ベース。
 * mock も Link ベース (aria-current) に揃える。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BarChart3, CalendarDays } from 'lucide-react';

import { cn } from '@/lib/utils';

// PageNav は usePathname / useCalendarNavigation 等に依存するため、
// ストーリーでは同じ見た目の静的モックを使用する。

type ActivePage = 'calendar' | 'review';

function MockPageNav({ activePage = 'calendar' }: { activePage?: ActivePage }) {
  const tabs: Array<{
    id: ActivePage;
    label: string;
    icon: typeof CalendarDays;
    href: string;
  }> = [
    { id: 'calendar', label: 'カレンダー', icon: CalendarDays, href: '/ja/calendar/day' },
    { id: 'review', label: '振り返り', icon: BarChart3, href: '/ja/review' },
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
              'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              isActive
                ? 'bg-muted text-foreground gap-2 px-4 font-medium'
                : 'text-muted-foreground hover:bg-state-hover w-8',
            )}
          >
            <span className="relative inline-flex shrink-0 items-center justify-center">
              <Icon className="size-4 shrink-0" />
            </span>
            <span
              className={cn(
                'overflow-hidden whitespace-nowrap',
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

/** PageNav — ヘッダー右端のページナビゲーション。Calendar / Review のセグメントコントロール。 */
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

/** 振り返りがアクティブ。 */
export const ReviewActive: Story = {
  args: {
    activePage: 'review',
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
        <p className="text-muted-foreground mb-2 text-xs">Review Active</p>
        <MockPageNav activePage="review" />
      </div>
    </div>
  ),
};
