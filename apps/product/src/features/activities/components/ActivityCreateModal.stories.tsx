/**
 * ActivityCreateModal Stories
 *
 * アクティビティ新規作成モーダル。カテゴリー選択の中に「新しいカテゴリーを作成」を
 * 置き、そこから直接カテゴリーを作れる。作成フォームは色・アイコンの属性行
 * （`CategoryAppearancePickerRow`）を持ち、サイドバーの `CategoryCreatePopover` と
 * 同じ操作感にしている（#2406）。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

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

/** 初期状態。カテゴリー未選択で開く。 */
export const Default: Story = {};

/** 既存カテゴリーが初期選択された状態。 */
export const WithInitialCategory: Story = {
  args: { initialCategoryId: 'cat-work' },
};

/**
 * カテゴリー選択ポップオーバーを開き、既存カテゴリー一覧（仕事・学習）を表示した状態。
 * play で自動的に開くため、閲覧側でクリックせずに一覧を確認できる。
 *
 * Dialog / Popover は Portal 経由で document.body に描画されるため、canvasElement
 * ではなく body から要素を探す。
 */
export const SelectCategoryOpen: Story = {
  play: async () => {
    const body = within(document.body);
    await userEvent.click(body.getByRole('button', { name: 'カテゴリーを選択' }));

    await expect(await body.findByText('仕事')).toBeInTheDocument();
    await expect(body.getByText('学習')).toBeInTheDocument();
  },
};

/**
 * 「新しいカテゴリーを作成」を開いた状態。
 * 名前 Input に加え、色・アイコンの属性行が並ぶ（サイドバーの作成ポップオーバーと同じ形）。
 *
 * Dialog は Portal 経由で document.body に描画されるため、canvasElement ではなく
 * body から要素を探す。
 */
export const CreatingCategory: Story = {
  play: async () => {
    const body = within(document.body);
    await userEvent.click(body.getByRole('button', { name: 'カテゴリーを選択' }));
    await userEvent.click(await body.findByText('カテゴリーを作成'));

    await expect(body.getByRole('button', { name: '色を選択' })).toBeInTheDocument();
    await expect(body.getByRole('button', { name: 'アイコンを選択' })).toBeInTheDocument();
    await expect(body.getByRole('textbox', { name: 'カテゴリー名' })).toBeInTheDocument();
  },
};

/** 全パターン一覧（属性行のメニューは Portal に出るため、状態ごとに個別 Story で確認する）。 */
export const AllPatterns: Story = {
  render: () => <ActivityCreateModal open onClose={fn()} initialCategoryId={null} />,
};
