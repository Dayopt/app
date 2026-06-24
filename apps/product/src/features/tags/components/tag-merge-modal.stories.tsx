/**
 * TagMergeModal Stories
 *
 * タグマージモーダル（実体コンポーネント）。
 * GlobalTagMergeModal のラップ元であり、こちらが実際の UI を持つ。
 *
 * - Mobile: Vaul Drawer（スワイプで閉じる）
 * - PC: 中央フローティング（portal 経由）
 *
 * useTags / useMergeTag は tRPC モックで提供。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@dayopt/components';

import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';
import { TagMergeModal } from './tag-merge-modal';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const MOCK_TAGS = [
  {
    id: 'tag-1',
    name: '仕事',
    user_id: 'user-1',
    color: 'blue',
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-2',
    name: '仕事:会議',
    user_id: 'user-1',
    color: 'blue',
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-3',
    name: '仕事:開発',
    user_id: 'user-1',
    color: 'indigo',
    is_active: true,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-4',
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    is_active: true,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-5',
    name: '運動',
    user_id: 'user-1',
    color: 'amber',
    is_active: true,
    sort_order: 4,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-6',
    name: '休憩',
    user_id: 'user-1',
    color: 'orange',
    is_active: true,
    sort_order: 5,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

/** マージ元タグ（Storyで共通使用） */
const SOURCE_TAG = { id: 'tag-2', name: '仕事:会議', color: 'blue' as const };

// ─────────────────────────────────────────────────────────
// インタラクティブラッパー
// ─────────────────────────────────────────────────────────

function InteractiveTagMerge({ tags = MOCK_TAGS }: { tags?: typeof MOCK_TAGS }) {
  const [open, setOpen] = useState(false);

  return (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: tags } }}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        「仕事:会議」をマージ
      </Button>
      <TagMergeModal
        open={open}
        onClose={() => setOpen(false)}
        sourceTag={SOURCE_TAG}
        onMergeSuccess={fn()}
      />
    </StoryTRPCProvider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * TagMergeModal — タグマージモーダル（実体 UI コンポーネント）
 *
 * 選択されたタグ（sourceTag）を別のタグにマージする。
 * コロン記法グルーピング対応で、グループ親・子タグをラジオで選択。
 * Mobile: Vaul Drawer、PC: createPortal で中央フローティング表示。
 *
 * @see GlobalTagMergeModal — useModalStore と接続するラッパー
 */
const meta = {
  title: 'Product/Features/Tags/MergeModal',
  parameters: {
    layout: 'fullscreen',
    trpcMocks: { 'tags.list': { data: MOCK_TAGS } },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（開いた状態・マージ先未選択）
 *
 * 「仕事:会議」をマージ元に、グループ + 単独タグのリストから
 * マージ先を選択できる状態。
 */
export const Default: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS } }}>
      <TagMergeModal open sourceTag={SOURCE_TAG} onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/**
 * タグが少ない状態（3件のみ）
 *
 * マージ先の選択肢が少ない場合のレイアウト確認。
 */
export const FewTags: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS.slice(0, 3) } }}>
      <TagMergeModal open sourceTag={SOURCE_TAG} onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/**
 * タグが多い状態（グループあり）
 *
 * グループタグが複数ある状態での
 * コロン記法グルーピング表示を確認できる。
 */
export const WithGroups: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS } }}>
      <TagMergeModal open sourceTag={SOURCE_TAG} onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/**
 * 閉じた状態
 *
 * open が false の場合は表示されない（PC）。
 */
export const ClosedState: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS } }}>
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">（モーダルは非表示です）</p>
      </div>
      <TagMergeModal open={false} sourceTag={SOURCE_TAG} onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/**
 * ボタンクリックで開くインタラクティブモード
 *
 * 実際のユーザー操作フロー（選択 → マージボタン）を確認できる。
 */
export const Interactive: Story = {
  render: () => <InteractiveTagMerge />,
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="space-y-8 p-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">
          インタラクティブ（ボタンでモーダルを開く）
        </p>
        <InteractiveTagMerge />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">タグが少ない状態</p>
        <InteractiveTagMerge tags={MOCK_TAGS.slice(0, 3)} />
      </div>
    </div>
  ),
};
