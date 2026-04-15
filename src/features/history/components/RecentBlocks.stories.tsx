/**
 * RecentBlocks Stories
 *
 * 履歴ブロックセクションの各状態。
 * tRPC依存のため、BlockItem + SidebarSection で構成を再現。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagIcon } from '@/features/tags';
import { BlockItem, SidebarSection } from '@/lib/components/shell/sidebar';

// ─────────────────────────────────────────────────────────
// Helper Component
// ─────────────────────────────────────────────────────────

function RecentBlocksStory({
  items,
}: {
  items: { tagId: string; tagName: string; tagColor: string; durationMinutes: number }[];
}) {
  return (
    <div className="w-64 min-w-0 overflow-hidden">
      {/* 実キー: sidebar.recentBlocks.title */}
      <SidebarSection title="履歴" defaultOpen>
        {items.length === 0 ? (
          /* 実キー: sidebar.recentBlocks.empty + sidebar.recentBlocks.emptyHint */
          <div className="px-2 py-4">
            <p className="text-muted-foreground text-xs">まだ履歴がありません</p>
            <p className="text-muted-foreground mt-1 text-xs">
              カレンダーにブロックを追加すると自動で表示されます
            </p>
          </div>
        ) : (
          items.map((item) => (
            <BlockItem
              key={`${item.tagId}-${item.durationMinutes}`}
              tagName={item.tagName}
              iconSlot={<TagIcon icon={null} color={item.tagColor} size="sm" />}
              durationMinutes={item.durationMinutes}
              onClick={fn()}
            />
          ))
        )}
      </SidebarSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/History/RecentBlocks',
  component: RecentBlocksStory,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof RecentBlocksStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 履歴アイテムあり */
export const WithItems: Story = {
  args: {
    items: [
      { tagId: 'tag-work', tagName: '仕事', tagColor: 'blue', durationMinutes: 60 },
      { tagId: 'tag-study', tagName: '勉強', tagColor: 'green', durationMinutes: 30 },
      { tagId: 'tag-exercise', tagName: '運動', tagColor: 'amber', durationMinutes: 45 },
      { tagId: 'tag-reading', tagName: '読書', tagColor: 'indigo', durationMinutes: 30 },
    ],
  },
};

/** 履歴なし（空状態） */
export const Empty: Story = {
  args: {
    items: [],
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { items: [] },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">With Items</p>
        <RecentBlocksStory
          items={[
            { tagId: 'tag-work', tagName: '仕事', tagColor: 'blue', durationMinutes: 60 },
            { tagId: 'tag-study', tagName: '勉強', tagColor: 'green', durationMinutes: 30 },
            { tagId: 'tag-exercise', tagName: '運動', tagColor: 'amber', durationMinutes: 45 },
          ]}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Empty</p>
        <RecentBlocksStory items={[]} />
      </div>
    </div>
  ),
};

/** 多数の履歴アイテム */
export const ManyItems: Story = {
  args: {
    items: [
      { tagId: 'tag-work', tagName: '仕事', tagColor: 'blue', durationMinutes: 60 },
      { tagId: 'tag-study', tagName: '勉強', tagColor: 'green', durationMinutes: 30 },
      { tagId: 'tag-exercise', tagName: '運動', tagColor: 'amber', durationMinutes: 45 },
      { tagId: 'tag-reading', tagName: '読書', tagColor: 'indigo', durationMinutes: 30 },
      { tagId: 'tag-meeting', tagName: 'ミーティング', tagColor: 'red', durationMinutes: 60 },
      { tagId: 'tag-break', tagName: '休憩', tagColor: 'orange', durationMinutes: 15 },
      {
        tagId: 'tag-pm',
        tagName: 'プロジェクト管理・定例ミーティング準備',
        tagColor: 'purple',
        durationMinutes: 90,
      },
      { tagId: 'tag-lunch', tagName: '昼食', tagColor: 'lime', durationMinutes: 60 },
    ],
  },
};
