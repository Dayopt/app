import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Pencil } from 'lucide-react';

import { Button } from '@/lib/components/ui/button';

import { RenameTagPopover } from './RenameTagPopover';

import type { Tag } from '../types';

const baseDate = new Date().toISOString();

const TAG_A: Tag = {
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
};

const TAG_B: Tag = {
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
};

/**
 * RenameTagPopover — タグ名リネーム Popover（名前のみ）
 *
 * 色 / アイコン / グループの変更は別 UI（FilterItemMenu のサブメニュー等）で行う。
 * 本 Popover は名前だけを変更する軽量フォーム。
 */
const meta = {
  title: 'Features/Tags/RenameTagPopover',
  component: RenameTagPopover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    open: false,
    onOpenChange: () => {},
    tag: TAG_A,
    existingTags: [TAG_A, TAG_B],
    onSubmit: () => {},
  },
} satisfies Meta<typeof RenameTagPopover>;

export default meta;

type Story = StoryObj<typeof meta>;

function Harness({ tag, defaultOpen = true }: { tag: Tag; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <RenameTagPopover
      open={open}
      onOpenChange={setOpen}
      tag={tag}
      existingTags={[TAG_A, TAG_B]}
      onSubmit={(name) => {
        // eslint-disable-next-line no-console
        console.log('rename', name);
        setOpen(false);
      }}
    >
      <Button variant="outline" size="sm">
        <Pencil className="size-4" /> {tag.name} をリネーム
      </Button>
    </RenameTagPopover>
  );
}

/** 初期値 = tag.name。Popover 開いた状態 */
export const Default: Story = {
  render: () => <Harness tag={TAG_A} />,
};

/** 閉じた初期状態（トリガー押下で展開） */
export const Closed: Story = {
  render: () => <Harness tag={TAG_A} defaultOpen={false} />,
};
