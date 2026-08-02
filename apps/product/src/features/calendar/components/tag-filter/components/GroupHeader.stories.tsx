import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { GroupHeader } from './GroupHeader';

/**
 * コロン記法グループのヘッダー行（親タグに相当）。
 *
 * チェックボックス + グループ名 + シェブロン + メニューで構成。
 *
 * 親グループ自身のメニュー内容:
 *
 * | 項目               | Desktop | Mobile |
 * | ------------------ | :-----: | :----: |
 * | タグを追加          |    ○    |   ×    |
 * | 名前を変更          |    ○    |   ×    |
 * | 色を変更            |    ○    |   ×    |
 * | アイコンを変更       |    ○    |   ×    |
 * | グループを解除       |    ○    |   ×    |
 * | このグループだけ表示  |    ○    |   ○    |
 * | 統計を見る          |    ○    |   ×    |
 * | グループを削除       |    ○    |   ×    |
 *
 * 子タグ（グループ内タグ）のメニューは `FilterItemMenu` 参照。
 */
const meta = {
  title: 'Product/Features/Tags/GroupHeader',
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
    currentIcon: 'briefcase',
    onCheckedChange: fn(),
    onToggleCollapse: fn(),
    onShowOnlyGroup: fn(),
    onColorChange: fn(),
    onIconChange: fn(),
    onAddTagToGroup: fn(),
    onRenameGroup: fn(),
    onViewStats: fn(),
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

// ─────────────────────────────────────────────────────────
// 行の見た目
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// メニューを開いた状態
// ─────────────────────────────────────────────────────────

/**
 * グループ（親）のメニューを開いた状態。
 * タグ追加 / 名前変更 / 色 / アイコン / グループ解除 / このグループだけ表示 /
 * 統計 / 削除 が並ぶ。
 */
export const WithMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'タグメニュー' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(body.getByText('タグを追加')).toBeInTheDocument();
    await expect(body.getByText('名前を変更')).toBeInTheDocument();
    await expect(body.getByText('色を変更')).toBeInTheDocument();
    await expect(body.getByText('アイコンを変更')).toBeInTheDocument();
    await expect(body.getByText('グループを解除')).toBeInTheDocument();
    await expect(body.getByText('このグループだけ表示')).toBeInTheDocument();
    await expect(body.getByText('グループを削除')).toBeInTheDocument();
  },
};

/**
 * モバイル簡略版。「このグループだけ表示」のみ。
 * 管理操作は設定画面に委譲。
 */
export const WithMenuOpenMobile: Story = {
  args: {
    isMobile: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'タグメニュー' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(body.getByText('このグループだけ表示')).toBeInTheDocument();
    await expect(body.queryByText('名前を変更')).not.toBeInTheDocument();
    await expect(body.queryByText('グループを削除')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────
// 並び比較
// ─────────────────────────────────────────────────────────

/** 全パターン一覧（行の見た目）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-1">
      <GroupHeader
        label="開発"
        checked={true}
        indeterminate={false}
        collapsed={false}
        displayColor="green"
        currentIcon="briefcase"
        onCheckedChange={fn()}
        onToggleCollapse={fn()}
        onShowOnlyGroup={fn()}
        onColorChange={fn()}
        onIconChange={fn()}
        onAddTagToGroup={fn()}
        onRenameGroup={fn()}
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
        onDeleteGroup={fn()}
      />
    </div>
  ),
};
