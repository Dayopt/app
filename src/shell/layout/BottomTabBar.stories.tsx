/**
 * BottomTabBar Stories
 *
 * モバイル用ボトムタブナビゲーション（Calendar / Stats / Notifications / Account）。
 * usePathname / useRouter 等に依存するため、同じ見た目の静的モックを使用。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BarChart3, Bell, CalendarDays, UserCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

type TabId = 'calendar' | 'stats' | 'notifications' | 'account';

function MockBottomTabBar({
  activeTab = 'calendar',
  unreadCount = 0,
}: {
  activeTab?: TabId;
  unreadCount?: number;
}) {
  const tabs: Array<{ id: TabId; label: string; icon: typeof CalendarDays; badge?: number }> = [
    { id: 'calendar', label: 'カレンダー', icon: CalendarDays },
    { id: 'stats', label: '統計', icon: BarChart3 },
    { id: 'notifications', label: '通知', icon: Bell, badge: unreadCount },
    { id: 'account', label: 'アカウント', icon: UserCircle },
  ];

  return (
    <nav
      className="bg-surface-container shadow-card fixed inset-x-0 bottom-0 z-50"
      aria-label="ページナビゲーション"
    >
      <div className="flex h-14 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
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
                {tab.badge != null && tab.badge > 0 && (
                  <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-bold">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span className={cn('text-xs', isActive && 'font-semibold')}>{tab.label}</span>
            </button>
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

/** 通知タブがアクティブ。未読バッジ付き。 */
export const NotificationsWithBadge: Story = {
  args: { activeTab: 'notifications', unreadCount: 3 },
};

/** 未読数が 9 を超える場合は「9+」表示。 */
export const BadgeOverflow: Story = {
  args: { activeTab: 'calendar', unreadCount: 15 },
};

/** アカウントタブがアクティブ。 */
export const AccountActive: Story = {
  args: { activeTab: 'account' },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  decorators: [
    (Story) => (
      <div className="relative h-[600px]">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div className="flex flex-col gap-20">
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs font-medium">
          Calendar Active（デフォルト）
        </p>
        <MockBottomTabBar activeTab="calendar" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs font-medium">Stats Active</p>
        <MockBottomTabBar activeTab="stats" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs font-medium">
          Notifications + バッジ (3)
        </p>
        <MockBottomTabBar activeTab="notifications" unreadCount={3} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs font-medium">
          バッジオーバーフロー (9+)
        </p>
        <MockBottomTabBar activeTab="calendar" unreadCount={15} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 px-4 text-xs font-medium">Account Active</p>
        <MockBottomTabBar activeTab="account" />
      </div>
    </div>
  ),
};
