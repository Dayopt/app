/**
 * TagRenameModal Stories
 *
 * タグリネームモーダル（実体コンポーネント）。
 * GlobalTagRenameModal のラップ元であり、こちらが実際の UI を持つ。
 *
 * useTags / useUpdateTag は tRPC モックで提供。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@dayopt/components';

import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';
import { TagRenameModal } from './TagRenameModal';

const MOCK_TAGS = [
  {
    id: 'tag-1',
    user_id: 'u',
    name: '仕事',
    color: 'blue',
    icon: 'briefcase',
    parent_id: null,
    sort_order: 0,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-2',
    user_id: 'u',
    name: '勉強',
    color: 'green',
    icon: 'book-open',
    parent_id: null,
    sort_order: 1,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-3',
    user_id: 'u',
    name: '運動',
    color: 'amber',
    icon: 'dumbbell',
    parent_id: null,
    sort_order: 2,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const TARGET = { id: 'tag-1', name: '仕事', parent_id: null };

/**
 * TagRenameModal — タグ名リネームモーダル
 *
 * 名前入力と重複検証のみ。色 / アイコン / グループの変更は別 UI。
 * Mobile: Vaul Drawer、PC: 中央ダイアログ。
 *
 * @see GlobalTagRenameModal — useShellStore に接続するラッパー
 */
const meta = {
  title: 'Product/Features/Tags/RenameModal',
  parameters: {
    layout: 'fullscreen',
    trpcMocks: { 'tags.list': { data: MOCK_TAGS } },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS } }}>
      <div className="flex h-screen items-center justify-center">
        <Button variant="outline" onClick={() => setOpen(true)}>
          「仕事」をリネーム
        </Button>
      </div>
      <TagRenameModal open={open} tag={TARGET} onClose={() => setOpen(false)} />
    </StoryTRPCProvider>
  );
}

/** デフォルト（開いた状態、pre-fill 済み） */
export const Default: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS } }}>
      <TagRenameModal open tag={TARGET} onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/** 閉じた状態 */
export const Closed: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS } }}>
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">（モーダルは非表示です）</p>
      </div>
      <TagRenameModal open={false} tag={TARGET} onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/** ボタンクリックで開くインタラクティブモード */
export const Interactive: Story = {
  render: () => <Harness />,
};
