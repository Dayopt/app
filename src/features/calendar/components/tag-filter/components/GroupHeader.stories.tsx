import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { GroupHeader } from './GroupHeader';

/**
 * コロン記法グループのヘッダー行。
 *
 * チェックボックス + グループ名 + シェブロン + メニューで構成。
 * メニューには「タグ追加」「リネーム」「色変更」「グループ解除」「このグループだけ表示」「グループ削除」。
 */
const meta = {
  title: 'Features/Calendar/Sidebar/TagFilter/GroupHeader',
  component: GroupHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // button-name: Checkbox and toggle buttons rendered internally by GroupHeader component
    a11y: { test: 'todo' },
  },
  args: {
    label: '開発',
    checked: true,
    indeterminate: false,
    collapsed: false,
    displayColor: 'green',
    onCheckedChange: fn(),
    onToggleCollapse: fn(),
    onShowOnlyGroup: fn(),
    onColorChange: fn(),
    onAddTagToGroup: fn(),
    onRenameGroup: fn(),
    onUngroupTags: fn(),
    onDeleteGroup: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 全タグが選択状態のグループヘッダー。 */
export const AllChecked: Story = {};

/** 一部タグのみ選択（indeterminate）。 */
export const Indeterminate: Story = {
  args: {
    checked: false,
    indeterminate: true,
  },
};

/** 未選択状態。 */
export const Unchecked: Story = {
  args: {
    checked: false,
    indeterminate: false,
  },
};

/** 折りたたみ状態。シェブロンが右向き。 */
export const Collapsed: Story = {
  args: {
    collapsed: true,
  },
};

/** 長いグループ名。truncate が効く。 */
export const LongLabel: Story = {
  args: {
    label: 'とても長いグループ名が入った場合の表示確認用テスト',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-1">
      <GroupHeader
        label="開発"
        checked={true}
        indeterminate={false}
        collapsed={false}
        displayColor="green"
        onCheckedChange={fn()}
        onToggleCollapse={fn()}
        onShowOnlyGroup={fn()}
        onColorChange={fn()}
        onAddTagToGroup={fn()}
        onRenameGroup={fn()}
        onUngroupTags={fn()}
        onDeleteGroup={fn()}
      />
      <GroupHeader
        label="デザイン"
        checked={false}
        indeterminate={true}
        collapsed={false}
        displayColor="orange"
        onCheckedChange={fn()}
        onToggleCollapse={fn()}
        onShowOnlyGroup={fn()}
        onColorChange={fn()}
        onAddTagToGroup={fn()}
        onRenameGroup={fn()}
        onUngroupTags={fn()}
        onDeleteGroup={fn()}
      />
      <GroupHeader
        label="マーケティング"
        checked={false}
        indeterminate={false}
        collapsed={true}
        displayColor="blue"
        onCheckedChange={fn()}
        onToggleCollapse={fn()}
        onShowOnlyGroup={fn()}
        onColorChange={fn()}
        onAddTagToGroup={fn()}
        onRenameGroup={fn()}
        onUngroupTags={fn()}
        onDeleteGroup={fn()}
      />
    </div>
  ),
};
