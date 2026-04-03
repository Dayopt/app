/**
 * GlobalSearchModal Stories
 *
 * エントリ（entries.list）とタグ（tags.list）を tRPC モックで提供。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@/components/ui/button';

import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';
import { GlobalSearchModal } from './global-search-modal';

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
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    is_active: true,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-4',
    name: '運動',
    user_id: 'user-1',
    color: 'amber',
    is_active: true,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-5',
    name: '休憩',
    user_id: 'user-1',
    color: 'orange',
    is_active: true,
    sort_order: 4,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    title: '朝会',
    description: '朝のスタンドアップミーティング',
    tagId: 'tag-2',
    start_time: '2026-03-18T09:00:00.000Z',
    end_time: '2026-03-18T09:30:00.000Z',
    origin: 'plan' as const,
    user_id: 'user-1',
  },
  {
    id: 'entry-2',
    title: '英語学習',
    description: '英単語の暗記',
    tagId: 'tag-3',
    start_time: '2026-03-17T20:00:00.000Z',
    end_time: '2026-03-17T21:00:00.000Z',
    origin: 'record' as const,
    user_id: 'user-1',
  },
  {
    id: 'entry-3',
    title: 'ランニング',
    description: '朝のランニング 5km',
    tagId: 'tag-4',
    start_time: '2026-03-16T07:00:00.000Z',
    end_time: '2026-03-16T08:00:00.000Z',
    origin: 'record' as const,
    user_id: 'user-1',
  },
];

const MOCK_TRPC = {
  'tags.list': { data: MOCK_TAGS },
  'entries.list': MOCK_ENTRIES,
};

// ─────────────────────────────────────────────────────────
// インタラクティブラッパー
// ─────────────────────────────────────────────────────────

function InteractiveModal({
  tags = MOCK_TAGS,
  entries = MOCK_ENTRIES,
}: {
  tags?: typeof MOCK_TAGS;
  entries?: typeof MOCK_ENTRIES;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: tags }, 'entries.list': entries }}>
      <Button onClick={() => setIsOpen(true)}>検索を開く</Button>
      <GlobalSearchModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </StoryTRPCProvider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** GlobalSearchModal — グローバル検索モーダル（タグ・エントリ横断検索） */
const meta = {
  title: 'Features/Search/GlobalSearchModal',
  parameters: {
    layout: 'centered',
    trpcMocks: MOCK_TRPC,
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（開いた状態）
 *
 * クエリ未入力時はタグ一覧のみ表示。
 * エントリはクエリ入力後に表示される。
 */
export const Default: Story = {
  render: () => (
    <StoryTRPCProvider mocks={MOCK_TRPC}>
      <GlobalSearchModal isOpen onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/**
 * 空状態（タグ・エントリなし）
 *
 * 新規ユーザーや全タグ削除後の状態。
 * 「No results found」が表示される。
 */
export const EmptyState: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'aria-required-children', enabled: false }] } },
  },
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: [] }, 'entries.list': [] }}>
      <GlobalSearchModal isOpen onClose={fn()} />
    </StoryTRPCProvider>
  ),
};

/**
 * ボタンクリックで開くインタラクティブモード
 *
 * 実際のユーザー操作フローを確認できる。
 * 「仕事」「会議」などで検索するとタグ・エントリが絞り込まれる。
 */
export const Interactive: Story = {
  render: () => <InteractiveModal />,
};

/**
 * タグのみ（エントリなし）
 *
 * クエリ未入力時のタグ一覧表示のみを確認できる状態。
 */
export const TagsOnly: Story = {
  render: () => (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: MOCK_TAGS }, 'entries.list': [] }}>
      <GlobalSearchModal isOpen onClose={fn()} />
    </StoryTRPCProvider>
  ),
};
