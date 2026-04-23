import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { InlineTagCreateRow } from './InlineTagCreateRow';

import type { Tag } from '../types';

const baseDate = new Date().toISOString();

const mockTags: Tag[] = [
  {
    id: 't1',
    user_id: 'u',
    name: 'Work',
    color: 'blue',
    icon: 'briefcase',
    sort_order: 0,
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
  },
  {
    id: 't2',
    user_id: 'u',
    name: 'Work:Meeting',
    color: 'blue',
    icon: 'users',
    sort_order: 1,
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
  },
];

/**
 * InlineTagCreateRow — タグ新規作成のインラインフォーム
 *
 * name 入力 + 色スウォッチ。Enter で確定 / Esc または外クリックでキャンセル。
 * `defaultColor` を渡すと色スウォッチの初期選択値として使われる（変更可能）。
 */
const meta = {
  title: 'Features/Tags/InlineTagCreateRow',
  component: InlineTagCreateRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    existingTags: mockTags,
    onSubmit: (name, color) => {
      // eslint-disable-next-line no-console
      console.log('submit', name, color);
    },
    onCancel: () => {
      // eslint-disable-next-line no-console
      console.log('cancel');
    },
  },
} satisfies Meta<typeof InlineTagCreateRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** row variant — サイドバー内で展開される形状。デフォルト青色。 */
export const RowVariant: Story = {
  args: { variant: 'row' },
  render: (args) => (
    <div className="w-64">
      <InlineTagCreateRow {...args} />
    </div>
  ),
};

/** badge variant — TagQuickSelector 内で badge 列の末尾に展開される形状。 */
export const BadgeVariant: Story = {
  args: { variant: 'badge' },
  render: (args) => (
    <div className="w-72">
      <InlineTagCreateRow {...args} />
    </div>
  ),
};

/** グループ内作成時。親色が初期選択として入るが、他の色に変更可能。 */
export const WithDefaultColorFromGroup: Story = {
  args: {
    variant: 'row',
    defaultGroup: 'Work',
    defaultColor: 'indigo',
  },
  render: (args) => (
    <div className="w-64">
      <InlineTagCreateRow {...args} />
    </div>
  ),
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">row (standalone)</p>
        <div className="w-64">
          <InlineTagCreateRow {...args} variant="row" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">badge (in TagQuickSelector)</p>
        <div className="w-72">
          <InlineTagCreateRow {...args} variant="badge" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">default color from group</p>
        <div className="w-64">
          <InlineTagCreateRow {...args} variant="row" defaultGroup="Work" defaultColor="indigo" />
        </div>
      </div>
    </div>
  ),
};
