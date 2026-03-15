import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';

import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { FilterItemMenu, UntaggedItemMenu } from './FilterItemMenu';

/**
 * タグ行のコンテキストメニュー。
 *
 * 「名前変更」「色変更」「グループ変更」「マージ」「このタグだけ表示」「削除」。
 * グループ内タグは色変更が非表示（グループ単位で統一のため）。
 */
const meta = {
  title: 'Features/Calendar/Sidebar/TagFilter/FilterItemMenu',
  component: FilterItemMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // aria-required-children / button-name: Radix DropdownMenuTrigger internal structure
    a11y: { test: 'todo' },
  },
  args: {
    displayColor: 'green',
    onOpenRenameDialog: fn(),
    onColorChange: fn(),
    onOpenMergeModal: fn(),
    onShowOnlyTag: fn(),
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

/** 独立タグ用メニュー（色変更あり、グループ変更なし）。 */
export const StandaloneTag: Story = {
  play: async () => {
    const body = within(document.body);
    // Menu is already open via defaultOpen decorator (text is Japanese via next-intl)
    await expect(body.getByText('名前を変更')).toBeInTheDocument();
    await expect(body.getByText('他のタグに統合')).toBeInTheDocument();
    await expect(body.getByText('このタグだけ表示')).toBeInTheDocument();
  },
};

/** グループ内タグ用メニュー（色変更非表示、グループ変更あり）。 */
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
};

/** 削除不可タグ（onDeleteTag なし）。 */
export const NoDeletion: Story = {
  render: (args) => {
    const { onDeleteTag: _, ...rest } = args;
    return <FilterItemMenu {...rest} onDeleteTag={undefined} />;
  },
};

/** タグなし用のシンプルなメニュー。 */
export const Untagged: Story = {
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger />
      <UntaggedItemMenu onShowOnlyThis={fn()} />
    </DropdownMenu>
  ),
};
