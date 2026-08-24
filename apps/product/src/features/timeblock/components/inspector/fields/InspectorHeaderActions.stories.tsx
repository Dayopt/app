import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { getTimeblockMenuItems } from '@/features/timeblock/lib/timeblock-menu-items';

import { InspectorHeaderActions } from './InspectorHeaderActions';

/**
 * InspectorHeaderActions — Inspector パネル最上部の utility 行
 *
 * 「…」メニュー（getTimeblockMenuItems で生成された項目）+ 閉じるボタンを配置する。
 * アクティビティ選択（ActivityFieldRow）が時間フィールド直下へ移動した後も、
 * この行はパネル最上部に独立して常時表示する（#2298）。
 */
const meta = {
  title: 'Product/Features/Timeblock/Inspector/InspectorHeaderActions',
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
  activityId: 'activity-1',
  onViewStats: fn(),
  onCopy: fn(),
  onDuplicate: fn(),
  onMarkUnplanned: fn(),
  onDelete: fn(),
});

const unplannedMenu = getTimeblockMenuItems({
  origin: 'unplanned',
  activityId: 'activity-1',
  onViewStats: fn(),
  onCopy: fn(),
  onDuplicate: fn(),
  onRestorePlanned: fn(),
  onDelete: fn(),
});

const copyAndDeleteMenu = getTimeblockMenuItems({
  origin: 'planned',
  activityId: 'activity-1',
  onCopy: fn(),
  onDuplicate: fn(),
  onDelete: fn(),
});

/** 未来の予定: まだ記録が存在し得ないため「予定外にする」は出ない。 */
const upcomingPlannedMenu = getTimeblockMenuItems({
  origin: 'planned',
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

/** フルメニュー + 閉じるボタン（planned）。 */
export const WithMenu: Story = {
  render: () => (
    <div className="w-72">
      <InspectorHeaderActions menuItems={fullPlannedMenu} onCloseInspector={fn()} />
    </div>
  ),
};

/** コピー・複製と削除（振り返りなし）。 */
export const CopyAndDelete: Story = {
  render: () => (
    <div className="w-72">
      <InspectorHeaderActions menuItems={copyAndDeleteMenu} onCloseInspector={fn()} />
    </div>
  ),
};

/** Unplanned（計画に戻す表示）。 */
export const Unplanned: Story = {
  render: () => (
    <div className="w-72">
      <InspectorHeaderActions menuItems={unplannedMenu} onCloseInspector={fn()} />
    </div>
  ),
};

/** 未来の予定（planned）。「予定外にする」は非表示。 */
export const UpcomingPlanned: Story = {
  render: () => (
    <div className="w-72">
      <InspectorHeaderActions menuItems={upcomingPlannedMenu} onCloseInspector={fn()} />
    </div>
  ),
};

/** メニューなし（閉じるボタンのみ）。 */
export const CloseOnly: Story = {
  render: () => (
    <div className="w-72">
      <InspectorHeaderActions onCloseInspector={fn()} />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">フルメニュー（planned）</p>
        <InspectorHeaderActions menuItems={fullPlannedMenu} onCloseInspector={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Unplanned</p>
        <InspectorHeaderActions menuItems={unplannedMenu} onCloseInspector={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">未来の予定（予定外にする非表示）</p>
        <InspectorHeaderActions menuItems={upcomingPlannedMenu} onCloseInspector={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">メニューなし（閉じるボタンのみ）</p>
        <InspectorHeaderActions onCloseInspector={fn()} />
      </div>
    </div>
  ),
};
