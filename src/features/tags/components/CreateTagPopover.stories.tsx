import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Plus } from 'lucide-react';

import { Button } from '@/lib/components/ui/button';

import { CreateTagPopover } from './CreateTagPopover';

import type { Tag } from '../types';

const baseDate = new Date().toISOString();

const mockTags: Tag[] = [
  {
    id: 't1',
    user_id: 'u',
    name: '仕事',
    color: 'blue',
    icon: 'briefcase',
    parent_id: null,
    sort_order: 0,
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
  },
  {
    id: 't2',
    user_id: 'u',
    name: '勉強',
    color: 'green',
    icon: 'book-open',
    parent_id: null,
    sort_order: 1,
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
  },
  {
    id: 't3',
    user_id: 'u',
    name: '趣味',
    color: 'violet',
    icon: 'heart',
    parent_id: null,
    sort_order: 2,
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
  },
];

/**
 * CreateTagPopover — タグ新規作成 Popover
 *
 * + ボタンを PopoverTrigger として、右側にフォーム（色 / アイコン / グループ / 名前）を展開する。
 */
const meta = {
  title: 'Features/Tags/CreateTagPopover',
  component: CreateTagPopover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    open: false,
    onOpenChange: () => {},
    existingTags: [],
    onSubmit: () => {},
  },
} satisfies Meta<typeof CreateTagPopover>;

export default meta;

type Story = StoryObj<typeof meta>;

function Harness({
  existingTags,
  defaultOpen = true,
}: {
  existingTags: Tag[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <CreateTagPopover
      open={open}
      onOpenChange={setOpen}
      existingTags={existingTags}
      onSubmit={(input) => {
        // eslint-disable-next-line no-console
        console.log('create', input);
        setOpen(false);
      }}
    >
      <Button variant="ghost" size="sm" icon aria-label="タグを作成">
        <Plus className="size-4" />
      </Button>
    </CreateTagPopover>
  );
}

/** 既存タグあり。Popover 開いた状態 */
export const Default: Story = {
  render: () => <Harness existingTags={mockTags} />,
};

/** 既存タグなし。グループ候補が空 */
export const EmptyExistingTags: Story = {
  render: () => <Harness existingTags={[]} />,
};

/** 閉じた初期状態（+ ボタン押下で展開） */
export const Closed: Story = {
  render: () => <Harness existingTags={mockTags} defaultOpen={false} />,
};
