/**
 * ActivityCreateModal Stories
 *
 * アクティビティ新規作成モーダル。所属カテゴリーは「カテゴリーなし」+ 既存カテゴリーを
 * 常時インライン表示するチップ列で選ぶ（#2406。クリックで一覧を開く必要をなくす）。
 * カテゴリーの新規作成はこのモーダルからは行わない（サイドバーの `CategoryCreatePopover`
 * に一本化）。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ActivityCreateModal } from './ActivityCreateModal';

const TIMESTAMPS = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function category(id: string, name: string, color: string, icon: string | null) {
  return { id, name, user_id: 'user-1', color, icon, archived_at: null, ...TIMESTAMPS };
}

const WORK = category('cat-work', '仕事', 'blue', 'briefcase');
const STUDY = category('cat-study', '学習', 'green', 'book-open');

const MOCK_TRPC = {
  'activities.listActivities': [],
  'activities.listCategories': [WORK, STUDY],
};

const meta = {
  title: 'Product/Features/Activities/ActivityCreateModal',
  component: ActivityCreateModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    trpcMocks: MOCK_TRPC,
  },
  args: {
    open: true,
    onClose: fn(),
    initialCategoryId: null,
    onCreated: fn(),
  },
} satisfies Meta<typeof ActivityCreateModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 初期状態。「カテゴリーなし」「仕事」「学習」がチップ列として最初から並び、
 * クリックせずに一覧を確認・選択できる。既定選択は「カテゴリーなし」。
 */
export const Default: Story = {};

/** 既存カテゴリー（仕事）が初期選択された状態。該当チップが色付きで強調される。 */
export const WithInitialCategory: Story = {
  args: { initialCategoryId: 'cat-work' },
};

/** カテゴリーが 1 件も無い状態。「カテゴリーなし」のみが並ぶ。 */
export const NoCategories: Story = {
  parameters: {
    trpcMocks: { 'activities.listActivities': [], 'activities.listCategories': [] },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      <ActivityCreateModal open onClose={fn()} initialCategoryId={null} />
    </div>
  ),
};
