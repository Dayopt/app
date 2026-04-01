import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

/**
 * Stats タブバーの視覚パターン。
 *
 * 実際の StatsLayout はルーター・ストアに依存するため、
 * タブバー部分を静的に再現して全パターンを確認する。
 */
const meta = {
  title: 'Features/Stats/StatsLayout',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tabClass = (isActive: boolean) =>
  cn(
    'relative inline-flex items-center justify-center rounded-lg px-2 py-1 text-base font-normal whitespace-nowrap transition-all',
    'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
    isActive
      ? 'text-foreground after:bg-foreground'
      : 'text-muted-foreground hover:bg-state-hover after:bg-transparent',
  );

function TabBar({
  activeTab,
  tagTab,
  onClose,
}: {
  activeTab: 'review' | 'progress' | 'insights' | 'tag';
  tagTab?: { name: string; icon: string | null; color: string };
  onClose?: () => void;
}) {
  const fixedTabs = [
    { id: 'review' as const, label: '振り返り' },
    { id: 'progress' as const, label: '進捗' },
    { id: 'insights' as const, label: '発見' },
  ];

  return (
    <nav
      className="flex h-10 w-full items-center justify-start gap-0 bg-transparent px-4"
      role="tablist"
    >
      {fixedTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={tabClass(activeTab === tab.id)}
        >
          {tab.label}
        </button>
      ))}
      {tagTab && (
        <div className="flex items-center">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tag'}
            className={tabClass(activeTab === 'tag')}
          >
            <TagIcon icon={tagTab.icon} color={tagTab.color} size="sm" />
            <ColonTagLabel name={tagTab.name} className="ml-1 text-sm" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:bg-state-hover hover:text-foreground -ml-1 flex size-5 items-center justify-center rounded transition-colors"
            aria-label="Close tag tab"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 固定3タブのみ（振り返りがアクティブ） */
export const ReviewActive: Story = {
  render: () => <TabBar activeTab="review" />,
};

/** 進捗タブがアクティブ */
export const ProgressActive: Story = {
  render: () => <TabBar activeTab="progress" />,
};

/** 発見タブがアクティブ */
export const InsightsActive: Story = {
  render: () => <TabBar activeTab="insights" />,
};

/** 動的タグタブが追加された状態（タグがアクティブ） */
export const TagTabActive: Story = {
  render: () => (
    <TabBar activeTab="tag" tagTab={{ name: '開発', icon: null, color: 'blue' }} onClose={fn()} />
  ),
};

/** タグタブがあるが他のタブがアクティブ */
export const TagTabInactive: Story = {
  render: () => (
    <TabBar
      activeTab="review"
      tagTab={{ name: '開発:API', icon: null, color: 'blue' }}
      onClose={fn()}
    />
  ),
};

/** コロン記法タグの動的タブ */
export const ColonTagTab: Story = {
  render: () => (
    <TabBar
      activeTab="tag"
      tagTab={{ name: '開発:フロントエンド', icon: null, color: 'violet' }}
      onClose={fn()}
    />
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">固定タブのみ</span>
        <TabBar activeTab="review" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">タグタブ追加（アクティブ）</span>
        <TabBar
          activeTab="tag"
          tagTab={{ name: '開発', icon: null, color: 'blue' }}
          onClose={fn()}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">タグタブ追加（非アクティブ）</span>
        <TabBar
          activeTab="review"
          tagTab={{ name: '運動', icon: null, color: 'green' }}
          onClose={fn()}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">コロン記法タグ</span>
        <TabBar
          activeTab="tag"
          tagTab={{ name: '開発:フロントエンド', icon: null, color: 'violet' }}
          onClose={fn()}
        />
      </div>
    </div>
  ),
};
