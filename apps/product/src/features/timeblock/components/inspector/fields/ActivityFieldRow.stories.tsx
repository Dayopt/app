import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { getTimeblockMenuItems } from '@/features/timeblock/lib/timeblock-menu-items';

import { ActivityFieldRow } from './ActivityFieldRow';

/**
 * ActivityFieldRow — アクティビティ表示・選択行
 *
 * アイコン + アクティビティ名を表示し、クリックで ActivityQuickSelector を開く。
 * 右側に「…」メニュー（getTimeblockMenuItems で生成された項目）を配置。
 *
 * 色・アイコンを持つのはカテゴリーだけで、アクティビティはこれを継承する（#2162 §4-6）。
 * 未分類（継承元が無い）のアクティビティは色を渡さず中立表示になる。
 */
const meta = {
  title: 'Product/Features/Timeblock/Inspector/ActivityFieldRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Menu builders（実コードと同じ getTimeblockMenuItems を経由）
// ---------------------------------------------------------------------------

const fullPlannedMenu = getTimeblockMenuItems({
  origin: 'planned',
  tagId: null,
  activityId: 'activity-1',
  onViewStats: fn(),
  onCopy: fn(),
  onDuplicate: fn(),
  onMarkUnplanned: fn(),
  onDelete: fn(),
});

const unplannedMenu = getTimeblockMenuItems({
  origin: 'unplanned',
  tagId: null,
  activityId: 'activity-1',
  onViewStats: fn(),
  onCopy: fn(),
  onDuplicate: fn(),
  onRestorePlanned: fn(),
  onDelete: fn(),
});

const copyAndDeleteMenu = getTimeblockMenuItems({
  origin: 'planned',
  tagId: null,
  activityId: 'activity-1',
  onCopy: fn(),
  onDuplicate: fn(),
  onDelete: fn(),
});

/** 未来の予定: まだ記録が存在し得ないため「予定外にする」は出ない。 */
const upcomingPlannedMenu = getTimeblockMenuItems({
  origin: 'planned',
  tagId: null,
  activityId: 'activity-1',
  isUpcoming: true,
  onViewStats: fn(),
  onCopy: fn(),
  onDuplicate: fn(),
  onMarkUnplanned: fn(),
  onDelete: fn(),
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** カテゴリー所属あり（青を継承）+ …メニュー（全項目）。 */
export const WithMenu: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={fullPlannedMenu}
      />
    </div>
  ),
};

/** コピー・複製と削除（振り返りなし）。 */
export const CopyAndDelete: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        activityId="activity-green-id"
        activityName="運動"
        activityColor="green"
        activityIcon="dumbbell"
        onActivityChange={fn()}
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
      <ActivityFieldRow
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
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
      <ActivityFieldRow
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={upcomingPlannedMenu}
      />
    </div>
  ),
};

/** 未分類のアクティビティ（継承する色が無いので中立表示）。 */
export const Uncategorized: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        activityId="activity-uncategorized"
        activityName="運動"
        activityColor={null}
        activityIcon={null}
        uncategorized
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
        menuItems={copyAndDeleteMenu}
      />
    </div>
  ),
};

/** アクティビティ未設定（activityId が null）。 */
export const NoActivity: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        activityId={null}
        activityName="アクティビティなし"
        onActivityChange={fn()}
        onCreateAndSelect={fn()}
      />
    </div>
  ),
};

/** メニューなし（アクティビティのみ）。 */
export const NoMenu: Story = {
  render: () => (
    <div className="w-72">
      <ActivityFieldRow
        activityId="activity-blue-id"
        activityName="仕事"
        activityColor="blue"
        activityIcon="briefcase"
        onActivityChange={fn()}
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
        <ActivityFieldRow
          activityId="activity-1"
          activityName="仕事"
          activityColor="blue"
          activityIcon="briefcase"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={fullPlannedMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Unplanned</p>
        <ActivityFieldRow
          activityId="activity-2"
          activityName="読書"
          activityColor="indigo"
          activityIcon="book-open"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={unplannedMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">未来の予定（予定外にする非表示）</p>
        <ActivityFieldRow
          activityId="activity-upcoming"
          activityName="会議"
          activityColor="blue"
          activityIcon="briefcase"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={upcomingPlannedMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">未分類（継承する色が無い）</p>
        <ActivityFieldRow
          activityId="activity-3"
          activityName="運動"
          activityColor={null}
          activityIcon={null}
          uncategorized
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
          menuItems={copyAndDeleteMenu}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">アクティビティなし</p>
        <ActivityFieldRow
          activityId={null}
          activityName="アクティビティなし"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">メニューなし</p>
        <ActivityFieldRow
          activityId="activity-5"
          activityName="読書"
          activityColor="indigo"
          activityIcon="book-open"
          onActivityChange={fn()}
          onCreateAndSelect={fn()}
        />
      </div>
    </div>
  ),
};
