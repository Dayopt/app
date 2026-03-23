/**
 * RecentBlocks Stories
 *
 * 履歴ブロックセクションの各状態。
 * tRPC依存のため、BlockItem + SidebarSection で構成を再現。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { BlockItem, SidebarSection } from '@/shell/components/sidebar';

// ─────────────────────────────────────────────────────────
// Helper Component
// ─────────────────────────────────────────────────────────

function RecentBlocksStory({
  items,
}: {
  items: { tagName: string; tagColor: string; durationMinutes: number }[];
}) {
  return (
    <div className="w-64 min-w-0 overflow-hidden">
      <SidebarSection title="履歴" defaultOpen>
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">まだ履歴がありません</p>
        ) : (
          items.map((item) => (
            <BlockItem
              key={`${item.tagName}-${item.durationMinutes}`}
              tagName={item.tagName}
              tagColor={item.tagColor}
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
      { tagName: '仕事', tagColor: 'blue', durationMinutes: 60 },
      { tagName: '勉強', tagColor: 'green', durationMinutes: 30 },
      { tagName: '運動', tagColor: 'amber', durationMinutes: 45 },
      { tagName: '読書', tagColor: 'indigo', durationMinutes: 30 },
    ],
  },
};

/** 履歴なし（空状態） */
export const Empty: Story = {
  args: {
    items: [],
  },
};

/** 多数の履歴（最大8件） */
export const ManyItems: Story = {
  args: {
    items: [
      { tagName: '仕事', tagColor: 'blue', durationMinutes: 60 },
      { tagName: '勉強', tagColor: 'green', durationMinutes: 30 },
      { tagName: '運動', tagColor: 'amber', durationMinutes: 45 },
      { tagName: '読書', tagColor: 'indigo', durationMinutes: 30 },
      { tagName: 'ミーティング', tagColor: 'red', durationMinutes: 60 },
      { tagName: '休憩', tagColor: 'orange', durationMinutes: 15 },
      {
        tagName: 'プロジェクト管理・定例ミーティング準備',
        tagColor: 'purple',
        durationMinutes: 90,
      },
      { tagName: '昼食', tagColor: 'lime', durationMinutes: 60 },
    ],
  },
};
