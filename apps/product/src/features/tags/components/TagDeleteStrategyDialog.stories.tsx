import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Tag } from '../types';

import { Button } from '@dayopt/components';
import { TagDeleteStrategyDialog } from './TagDeleteStrategyDialog';

const mockTags: Tag[] = [
  {
    id: '1',
    name: 'Work',
    color: 'blue',
    icon: 'briefcase',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 0,
    created_at: null,
    updated_at: null,
  },
  {
    id: '2',
    name: 'Personal',
    color: 'green',
    icon: 'home',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 1,
    created_at: null,
    updated_at: null,
  },
  {
    id: '3',
    name: 'Meeting',
    color: 'violet',
    icon: 'users',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 2,
    created_at: null,
    updated_at: null,
  },
  {
    id: '4',
    name: 'Exercise',
    color: 'orange',
    icon: 'dumbbell',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 3,
    created_at: null,
    updated_at: null,
  },
  {
    id: '5',
    name: 'Study',
    color: 'indigo',
    icon: 'book-open',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 4,
    created_at: null,
    updated_at: null,
  },
  {
    id: '6',
    name: 'Hobby',
    color: 'pink',
    icon: 'gamepad-2',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 5,
    created_at: null,
    updated_at: null,
  },
  {
    id: '7',
    name: 'Commute',
    color: 'teal',
    icon: 'train',
    user_id: 'u',
    parent_id: null,
    is_active: true,
    sort_order: 6,
    created_at: null,
    updated_at: null,
  },
];

const meta = {
  title: 'Product/Features/Tags/DeleteStrategyDialog',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * エントリ数件のタグ削除。
 * RadioGroup で「エントリも削除」or「別タグに付け替え」を選択。
 */
export const FewEntries: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Delete &quot;Work&quot; tag
          </Button>
          <TagDeleteStrategyDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={async (_strategy, _targetTagId) => {
              await new Promise((r) => setTimeout(r, 1000));
              setOpen(false);
            }}
            tagName="Work"
            recordCount={3}
            availableTags={mockTags.filter((t) => t.id !== '1')}
          />
        </>
      );
    }
    return <Demo />;
  },
};

/**
 * タグが多い場合。付け替え先候補が6件並ぶ。
 */
export const ManyTags: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Delete &quot;Meeting&quot; tag (many reassign targets)
          </Button>
          <TagDeleteStrategyDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={async () => {
              await new Promise((r) => setTimeout(r, 1000));
              setOpen(false);
            }}
            tagName="Meeting"
            recordCount={12}
            availableTags={mockTags.filter((t) => t.id !== '3')}
          />
        </>
      );
    }
    return <Demo />;
  },
};

/**
 * 付け替え先タグが1件のみ。選択肢が限られる状態。
 */
export const SingleReassignTarget: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Delete tag (1 reassign target)
          </Button>
          <TagDeleteStrategyDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={async () => {
              await new Promise((r) => setTimeout(r, 1000));
              setOpen(false);
            }}
            tagName="Personal"
            recordCount={5}
            availableTags={[mockTags[0]!]}
          />
        </>
      );
    }
    return <Demo />;
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">エントリ数件のタグ削除（開いた状態）</p>
        <TagDeleteStrategyDialog
          open
          onClose={() => {}}
          onConfirm={async () => {}}
          tagName="Work"
          recordCount={3}
          availableTags={mockTags.filter((t) => t.id !== '1')}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">タグが多い場合（開いた状態）</p>
        <TagDeleteStrategyDialog
          open
          onClose={() => {}}
          onConfirm={async () => {}}
          tagName="Meeting"
          recordCount={12}
          availableTags={mockTags.filter((t) => t.id !== '3')}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">付け替え先タグが1件のみ（開いた状態）</p>
        <TagDeleteStrategyDialog
          open
          onClose={() => {}}
          onConfirm={async () => {}}
          tagName="Personal"
          recordCount={5}
          availableTags={[mockTags[0]!]}
        />
      </div>
    </div>
  ),
};
