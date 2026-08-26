import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { CategoryCreatePopover } from './CategoryCreatePopover';

/**
 * サイドバー「カテゴリ」見出しのカテゴリー直接作成ポップオーバー。
 *
 * 名前 Input に加え、色・アイコンの属性行（`CategoryAppearancePickerRow`）を表示する。
 * 色・アイコンは未選択のまま作成でき、その場合は既存の自動割当に従う。
 * 最小経路（名前入力 → Enter）は 2 手のまま変わらない（#2406）。
 */
const meta = {
  title: 'Product/Features/Activities/CategoryCreatePopover',
  component: CategoryCreatePopover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CategoryCreatePopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 閉じた状態。「＋」ボタンのみ表示。 */
export const Default: Story = {};

/** 開いた状態。名前 Input + 色・アイコンの属性行が並ぶ。 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'カテゴリーを作成' }));

    const body = within(document.body);
    await expect(await body.findByRole('textbox')).toBeInTheDocument();
    await expect(body.getByRole('button', { name: '色を選択' })).toBeInTheDocument();
    await expect(body.getByRole('button', { name: 'アイコンを選択' })).toBeInTheDocument();
  },
};

/** 色選択メニューを開いた状態。カラーパレットが並ぶ。 */
export const ColorMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'カテゴリーを作成' }));

    const body = within(document.body);
    await userEvent.click(await body.findByRole('button', { name: '色を選択' }));
    await expect(await body.findByText('青')).toBeInTheDocument();
  },
};

/** アイコン選択メニューを開いた状態。キュレート済みアイコンがグリッドで並ぶ。 */
export const IconMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'カテゴリーを作成' }));

    const body = within(document.body);
    await userEvent.click(await body.findByRole('button', { name: 'アイコンを選択' }));
    await expect(await body.findByRole('menuitem', { name: 'briefcase' })).toBeInTheDocument();
  },
};

/** 全パターン一覧（属性行のメニューは Portal に出るため、状態ごとに個別 Story で確認する）。 */
export const AllPatterns: Story = {
  render: () => <CategoryCreatePopover />,
};
