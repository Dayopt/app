/**
 * BottomTabBar Stories
 *
 * モバイル用ボトムタブナビゲーション（Calendar / Stats / Account）。
 * usePathname / useRouter 等に依存するため、同じ見た目の静的モックを使用。
 * 実装は <Link> ベースで、mock も link 形式で実装と整合させる。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BarChart3, CalendarDays, UserCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

type TabId = 'calendar' | 'stats' | 'account';

function MockBottomTabBar({
  activeTab = 'calendar',
  hidden = false,
}: {
  activeTab?: TabId;
  hidden?: boolean;
}) {
  const tabs: Array<{
    id: TabId;
    label: string;
    icon: typeof CalendarDays;
    href: string;
  }> = [
    { id: 'calendar', label: 'カレンダー', icon: CalendarDays, href: '/ja/calendar/day' },
    { id: 'stats', label: '統計', icon: BarChart3, href: '/ja/stats/review' },
    { id: 'account', label: 'アカウント', icon: UserCircle, href: '/ja/settings' },
  ];

  return (
    <nav
      className="bg-surface-container shadow-card fixed inset-x-0 bottom-0 z-50 transition-transform duration-300"
      style={{
        transform: hidden
          ? 'translateY(calc(100% + 3.5rem + env(safe-area-inset-bottom, 0px)))'
          : 'translateY(0)',
      }}
      aria-label="ページナビゲーション"
    >
      <div className="flex h-14 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <a
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'relative flex items-center justify-center rounded-full px-4 py-1 transition-colors',
                  isActive && 'bg-primary-state-selected',
                )}
              >
                <Icon className="size-5" strokeWidth={isActive ? 2.5 : 1.5} />
              </span>
              <span className={cn('text-xs', isActive && 'font-medium')}>{tab.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

const meta = {
  title: 'Components/Shell/BottomTabBar',
  component: MockBottomTabBar,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div className="relative h-[200px]">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof MockBottomTabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** カレンダータブがアクティブ（デフォルト）。 */
export const CalendarActive: Story = {
  args: { activeTab: 'calendar' },
};

/** 統計タブがアクティブ。 */
export const StatsActive: Story = {
  args: { activeTab: 'stats' },
};

/** アカウントタブがアクティブ。 */
export const AccountActive: Story = {
  args: { activeTab: 'account' },
};

/** スクロール連動で非表示状態。 */
export const Hidden: Story = {
  args: { activeTab: 'calendar', hidden: true },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  decorators: [
    (Story) => (
      <div className="relative h-[700px]">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div className="flex flex-col gap-20">
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs">Calendar Active（デフォルト）</p>
        <MockBottomTabBar activeTab="calendar" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs">Stats Active</p>
        <MockBottomTabBar activeTab="stats" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs">Account Active</p>
        <MockBottomTabBar activeTab="account" />
      </div>
    </div>
  ),
};
