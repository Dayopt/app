import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { LoadingState } from './LoadingState';

/**
 * LoadingState — ローディングスケルトン。
 *
 * 3種類のスケルトンタイプをサポート:
 * - `card` — カード形式（タイトル・バッジ・本文）
 * - `list` — リスト形式（横並び）
 * - `form` — フォーム形式（ラベル + インプット3行 + ボタン）
 */
const meta = {
  title: 'Features/Entry/LoadingState',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** カードスケルトン（デフォルト）。3枚表示。 */
export const CardType: Story = {
  render: () => (
    <div className="max-w-lg">
      <LoadingState type="card" count={3} />
    </div>
  ),
};

/** カード1枚のみ。 */
export const CardSingle: Story = {
  render: () => (
    <div className="max-w-lg">
      <LoadingState type="card" count={1} />
    </div>
  ),
};

/** リストスケルトン。横並びのアイテム行。 */
export const ListType: Story = {
  render: () => (
    <div className="max-w-lg">
      <LoadingState type="list" count={4} />
    </div>
  ),
};

/** フォームスケルトン。ラベル + インプット × 3 + ボタン行。count は無視される。 */
export const FormType: Story = {
  render: () => (
    <div className="max-w-lg">
      <LoadingState type="form" />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-8">
      <section>
        <p className="text-muted-foreground mb-2 text-xs">Card（count=3）</p>
        <LoadingState type="card" count={3} />
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">List（count=4）</p>
        <LoadingState type="list" count={4} />
      </section>

      <section>
        <p className="text-muted-foreground mb-2 text-xs">Form</p>
        <LoadingState type="form" />
      </section>
    </div>
  ),
};
