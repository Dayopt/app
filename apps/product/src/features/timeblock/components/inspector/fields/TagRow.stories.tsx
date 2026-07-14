import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { TagColorEntry } from '@/features/tags';
import { getTimeblockMenuItems } from '@/features/timeblock/lib/timeblock-menu-items';

import { TagRow } from './TagRow';

/**
 * TagRow — タグ表示・選択行
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * タグ未設定時は「タグを追加」を表示。
 * 右側に「…」メニュー（getTimeblockMenuItems で生成された項目）を配置。
 */
const meta = {
  title: 'Product/Features/Timeblock/Inspector/TagRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const blueTag: TagColorEntry = {
  dot: 'bg-tag-blue',
  border: 'border-tag-blue',
  tint: 'bg-tag-blue-tint',
  cssVar: 'var(--tag-blue)',
  cssVarTint: 'var(--tag-blue-tint)',
};

const greenTag: TagColorEntry = {
  dot: 'bg-tag-green',
  border: 'border-tag-green',
  tint: 'bg-tag-green-tint',
  cssVar: 'var(--tag-green)',
  cssVarTint: 'var(--tag-green-tint)',
};

// ---------------------------------------------------------------------------
// Menu builders（実コードと同じ getTimeblockMenuItems を経由）
// ---------------------------------------------------------------------------

const fullPlannedMenu = getTimeblockMenuItems({
  origin: 'planned',
  tagId: 'tag-1',
  onViewStats: fn(),
  onCopy: fn(),
  onMarkUnplanned: fn(),
  onDelete: fn(),
});

const unplannedMenu = getTimeblockMenuItems({
  origin: 'unplanned',
  tagId: 'tag-1',
  onViewStats: fn(),
  onCopy: fn(),
  onRestorePlanned: fn(),
  onDelete: fn(),
});

const copyAndDeleteMenu = getTimeblockMenuItems({
  origin: 'planned',
  tagId: 'tag-1',
  onCopy: fn(),
  onDelete: fn(),
});

/** 未来の予定: まだ記録が存在し得ないため「予定外にする」は出ない。 */
const upcomingPlannedMenu = getTimeblockMenuItems({
  origin: 'planned',
  tagId: 'tag-1',
  isUpcoming: true,
  onViewStats: fn(),
  onCopy: fn(),
  onMarkUnplanned: fn(),
  onDelete: fn(),
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** タグ設定済み（青）+ …メニュー（全項目）。 */
export const WithMenu: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={fullPlannedMenu}
      />
    </div>
  ),
};

/** コピーと削除（振り返りなし）。 */
export const CopyAndDelete: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-green-id"
        tagName="運動"
        tagColorClasses={greenTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={copyAndDeleteMenu}
      />
    </div>
  ),
};

/** Unplanned（計画に戻す表示）。 */
export const Unplanned: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={unplannedMenu}
      />
    </div>
  ),
};

/** 未来の予定（planned）。「予定外にする」は非表示。 */
export const UpcomingPlanned: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={upcomingPlannedMenu}
      />
    </div>
  ),
};

/** メニューなし（タグのみ）。 */
export const NoMenu: Story = {
  render: () => (
    <div className="w-72">
      <TagRow
        tagId="tag-blue-id"
        tagName="仕事"
        tagColorClasses={blueTag}
        onTagChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">フルメニュー（planned）</p>
        <TagRow
          tagId="tag-1"
          tagName="仕事"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={fullPlannedMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Unplanned</p>
        <TagRow
          tagId="tag-2"
          tagName="読書"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={unplannedMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">未来の予定（予定外にする非表示）</p>
        <TagRow
          tagId="tag-upcoming"
          tagName="会議"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={upcomingPlannedMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">コピーと削除</p>
        <TagRow
          tagId="tag-4"
          tagName="運動"
          tagColorClasses={greenTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={copyAndDeleteMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">メニューなし</p>
        <TagRow
          tagId="tag-5"
          tagName="読書"
          tagColorClasses={blueTag}
          onTagChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
    </div>
  ),
};
