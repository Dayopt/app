import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TagBalancePanel, type TagBalanceRow } from './TagBalancePanel';

const ROWS: TagBalanceRow[] = [
  {
    tagId: '1',
    tagName: 'Deep Work',
    tagColor: 'blue',
    tagIcon: null,
    minutes: 1020,
    percentage: 42,
  },
  {
    tagId: '2',
    tagName: 'Meeting',
    tagColor: 'amber',
    tagIcon: null,
    minutes: 420,
    percentage: 17,
  },
  {
    tagId: '3',
    tagName: 'Learning',
    tagColor: 'green',
    tagIcon: null,
    minutes: 360,
    percentage: 15,
  },
  { tagId: '4', tagName: 'Admin', tagColor: 'gray', tagIcon: null, minutes: 300, percentage: 12 },
  {
    tagId: '5',
    tagName: '仕事:レビュー',
    tagColor: 'violet',
    tagIcon: null,
    minutes: 240,
    percentage: 10,
  },
];

/** TagBalancePanel — タグ別時間配分（週次 / 月次 / 年次ビューで共用） */
const meta = {
  title: 'Product/Features/Review/Reflection/TagBalancePanel',
  component: TagBalancePanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TagBalancePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示 */
export const Default: Story = {
  args: {
    rows: ROWS,
    onTagClick: () => {},
  },
};

/** 単一タグ */
export const SingleTag: Story = {
  args: {
    rows: [ROWS[0]!],
    onTagClick: () => {},
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { rows: ROWS, onTagClick: () => {} },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（複数タグ）</p>
        <TagBalancePanel rows={ROWS} onTagClick={() => {}} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">SingleTag（単一タグ）</p>
        <TagBalancePanel rows={[ROWS[0]!]} onTagClick={() => {}} />
      </div>
    </div>
  ),
};
