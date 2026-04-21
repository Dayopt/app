import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';

import { DropdownMenu, DropdownMenuTrigger } from '@/lib/components/ui/dropdown-menu';

import { FilterItemMenu, UntaggedItemMenu } from './FilterItemMenu';

/**
 * タグ行のコンテキストメニュー。
 *
 * 親（タグが所属するグループ）の有無で表示項目が変わる:
 *
 * | 文脈                | 名前変更 | 色変更 | アイコン | グループ変更 | マージ | 表示のみ | 統計 | 削除 |
 * | ------------------- | :------: | :----: | :------: | :----------: | :----: | :------: | :--: | :--: |
 * | 独立タグ            |    ○     |   ○    |    ○     |      ○       |   ○    |    ○     |  ○   |  ○   |
 * | グループ内タグ(子)  |    ○     |   ×    |    ○     |      ○       |   ○    |    ○     |  ○   |  ○   |
 * | モバイル(簡略)      |    ×     |   ×    |    ×     |      ×       |   ×    |    ○     |  ×   |  ○   |
 *
 * 色変更はグループ単位で統一するため、グループ内タグでは非表示。
 */
const meta = {
  title: 'Features/Tags/FilterItemMenu',
  component: FilterItemMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // aria-required-children / button-name: Radix DropdownMenuTrigger internal structure
    a11y: { test: 'todo' },
  },
  args: {
    displayColor: 'green',
    currentIcon: 'briefcase',
    onOpenRenameDialog: fn(),
    onColorChange: fn(),
    onIconChange: fn(),
    onOpenMergeModal: fn(),
    onShowOnlyTag: fn(),
    onViewStats: fn(),
    onDeleteTag: fn(),
  },
  decorators: [
    (Story) => (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger />
        <Story />
      </DropdownMenu>
    ),
  ],
} satisfies Meta<typeof FilterItemMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// 親子コンテキスト別ストーリー
// ─────────────────────────────────────────────────────────

/**
 * 独立タグ（親グループなし）のメニュー。
 *
 * すべての項目が表示される: 名前変更 / 色変更 / アイコン / グループ変更 /
 * マージ / このタグだけ表示 / 統計 / 削除。
 */
export const StandaloneTag: Story = {
  args: {
    currentGroup: null,
    groupOptions: [
      { name: '開発', color: 'green' },
      { name: 'デザイン', color: 'orange' },
      { name: 'マーケティング', color: 'blue' },
    ],
    onChangeGroup: fn(),
  },
  play: async () => {
    const body = within(document.body);
    await expect(body.getByText('名前を変更')).toBeInTheDocument();
    await expect(body.getByText('色を変更')).toBeInTheDocument();
    await expect(body.getByText('アイコンを変更')).toBeInTheDocument();
    await expect(body.getByText('グループを変更')).toBeInTheDocument();
    await expect(body.getByText('他のタグに統合')).toBeInTheDocument();
    await expect(body.getByText('このタグだけ表示')).toBeInTheDocument();
  },
};

/**
 * グループ内タグ（親グループあり）のメニュー。
 *
 * 色変更が **非表示** になる。色はグループ単位で統一される仕様のため。
 */
export const GroupedTag: Story = {
  args: {
    isGrouped: true,
    currentGroup: '開発',
    groupOptions: [
      { name: '開発', color: 'green' },
      { name: 'デザイン', color: 'orange' },
      { name: 'マーケティング', color: 'blue' },
    ],
    onChangeGroup: fn(),
  },
  play: async () => {
    const body = within(document.body);
    await expect(body.getByText('名前を変更')).toBeInTheDocument();
    await expect(body.queryByText('色を変更')).not.toBeInTheDocument();
    await expect(body.getByText('アイコンを変更')).toBeInTheDocument();
    await expect(body.getByText('グループを変更')).toBeInTheDocument();
  },
};

/**
 * モバイル簡略版。管理系は設定画面に委譲し、「このタグだけ表示」+「削除」のみ。
 */
export const Mobile: Story = {
  args: {
    isMobile: true,
  },
  play: async () => {
    const body = within(document.body);
    await expect(body.getByText('このタグだけ表示')).toBeInTheDocument();
    await expect(body.getByText('削除')).toBeInTheDocument();
    await expect(body.queryByText('名前を変更')).not.toBeInTheDocument();
  },
};

/**
 * 削除不可タグ。onDeleteTag が undefined のとき削除メニュー項目は出ない。
 */
export const NoDeletion: Story = {
  render: (args) => {
    const { onDeleteTag: _drop, ...rest } = args;
    return <FilterItemMenu {...rest} onDeleteTag={undefined} />;
  },
};

/**
 * 統計リンクなし。onViewStats が undefined のとき統計項目は出ない。
 */
export const NoStats: Story = {
  render: (args) => {
    const { onViewStats: _drop, ...rest } = args;
    return <FilterItemMenu {...rest} onViewStats={undefined} />;
  },
};

/**
 * タグなし行用のシンプルなメニュー。「このタグだけ表示」のみ。
 */
export const Untagged: Story = {
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger />
      <UntaggedItemMenu onShowOnlyThis={fn()} />
    </DropdownMenu>
  ),
};

// ─────────────────────────────────────────────────────────
// 比較ストーリー
// ─────────────────────────────────────────────────────────

/**
 * 独立タグ・グループ内タグ・モバイルを並べて比較。
 * 親の有無でどの項目が変わるかを一目で確認できる。
 */
export const Comparison: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">独立タグ（親なし）</p>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger />
          <FilterItemMenu
            displayColor="green"
            currentIcon="briefcase"
            currentGroup={null}
            groupOptions={[
              { name: '開発', color: 'green' },
              { name: 'デザイン', color: 'orange' },
            ]}
            onOpenRenameDialog={fn()}
            onColorChange={fn()}
            onIconChange={fn()}
            onChangeGroup={fn()}
            onOpenMergeModal={fn()}
            onShowOnlyTag={fn()}
            onViewStats={fn()}
            onDeleteTag={fn()}
          />
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">グループ内タグ（親あり）</p>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger />
          <FilterItemMenu
            displayColor="green"
            currentIcon="briefcase"
            isGrouped
            currentGroup="開発"
            groupOptions={[
              { name: '開発', color: 'green' },
              { name: 'デザイン', color: 'orange' },
            ]}
            onOpenRenameDialog={fn()}
            onColorChange={fn()}
            onIconChange={fn()}
            onChangeGroup={fn()}
            onOpenMergeModal={fn()}
            onShowOnlyTag={fn()}
            onViewStats={fn()}
            onDeleteTag={fn()}
          />
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">モバイル（簡略）</p>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger />
          <FilterItemMenu
            displayColor="green"
            isMobile
            onOpenRenameDialog={fn()}
            onColorChange={fn()}
            onOpenMergeModal={fn()}
            onShowOnlyTag={fn()}
            onDeleteTag={fn()}
          />
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">タグなし行</p>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger />
          <UntaggedItemMenu onShowOnlyThis={fn()} />
        </DropdownMenu>
      </div>
    </div>
  ),
};
