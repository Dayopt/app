import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@dayopt/components';
import { TagDeleteConfirmDialog } from './TagDeleteConfirmDialog';

const meta = {
  title: 'Product/Features/Tags/TagDeleteConfirmDialog',
  component: TagDeleteConfirmDialog,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TagDeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function DialogHarness({
  tagName,
  recordCount,
  defaultOpen = true,
}: {
  tagName: string;
  recordCount: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        ダイアログを開く
      </Button>
      <TagDeleteConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={async () => setOpen(false)}
        tagName={tagName}
        recordCount={recordCount}
      />
    </>
  );
}

export const Default: Story = {
  args: {
    open: true,
    onClose: () => {},
    onConfirm: async () => {},
    tagName: '開発',
    recordCount: 12,
  },
  render: (args) => <DialogHarness tagName={args.tagName} recordCount={args.recordCount} />,
};

export const SingleRecord: Story = {
  args: {
    open: true,
    onClose: () => {},
    onConfirm: async () => {},
    tagName: '読書',
    recordCount: 1,
  },
  render: (args) => <DialogHarness tagName={args.tagName} recordCount={args.recordCount} />,
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: {
    open: false,
    onClose: () => {},
    onConfirm: async () => {},
    tagName: '開発',
    recordCount: 12,
  },
  render: () => (
    <div className="space-y-8 p-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">関連ブロック複数（ボタンで開く）</p>
        <DialogHarness tagName="開発" recordCount={12} defaultOpen={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">関連ブロック 1 件（ボタンで開く）</p>
        <DialogHarness tagName="読書" recordCount={1} defaultOpen={false} />
      </div>
    </div>
  ),
};
