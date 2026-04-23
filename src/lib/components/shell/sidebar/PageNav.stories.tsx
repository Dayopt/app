/**
 * PageNav Stories
 *
 * ヘッダー右端のページナビゲーション（Calendar / Stats / AI セグメントコントロール）。
 * 実装は Phase 2-B Step 2 で nav + Link + aria-current に移行済。
 * mock も Link ベース (aria-current) に揃える (Phase 2-C Step C-5)。
 * Phase 2-D Step D-2 で v2 デザイン (expanding tab) に同期。
 * Phase 2-D Step D-5 で amber β バッジ (AI タブ) に対応。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BarChart3, CalendarDays, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

// PageNav は usePathname / useCalendarNavigation 等に依存するため、
// ストーリーでは同じ見た目の静的モックを使用する。

type ActivePage = 'calendar' | 'stats' | 'ai';
type BadgeVariant = 'new' | 'beta';

function MockPageNav({
  activePage = 'calendar',
  aiBadge = null,
}: {
  activePage?: ActivePage;
  aiBadge?: BadgeVariant | null;
}) {
  const tabs: Array<{
    id: ActivePage;
    label: string;
    icon: typeof CalendarDays;
    href: string;
    badge?: BadgeVariant | null;
  }> = [
    { id: 'calendar', label: 'カレンダー', icon: CalendarDays, href: '/ja/calendar/day' },
    { id: 'stats', label: '統計', icon: BarChart3, href: '/ja/stats/review' },
    { id: 'ai', label: 'AI', icon: Sparkles, href: '/ja/ai', badge: aiBadge },
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
              {tab.badge && (
                <span
                  aria-label={tab.badge === 'beta' ? 'β' : 'NEW'}
                  className={cn(
                    'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
                    'bg-warning text-warning-foreground text-xs leading-none font-medium',
                  )}
                >
                  {tab.badge === 'beta' ? 'β' : 'NEW'}
                </span>
              )}
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

/** AI に β バッジ付き（SidebarPageNav の本番 props に相当）。 */
export const WithAiBetaBadge: Story = {
  args: {
    activePage: 'calendar',
    aiBadge: 'beta',
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
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Calendar Active + AI β badge</p>
        <MockPageNav activePage="calendar" aiBadge="beta" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">AI Active + NEW badge</p>
        <MockPageNav activePage="ai" aiBadge="new" />
      </div>
    </div>
  ),
};
