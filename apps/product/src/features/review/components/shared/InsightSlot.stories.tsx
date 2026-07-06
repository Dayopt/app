import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { InsightSlot } from './InsightSlot';

/** InsightSlot — 研究者の所見スロット（各粒度ビューの冒頭に 1-2 文だけ表示） */
const meta = {
  title: 'Product/Features/Review/Shared/InsightSlot',
  component: InsightSlot,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof InsightSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示: 所見 1 文 */
export const Default: Story = {
  args: {
    text: '合計時間 が前期間より 25% 改善しました',
  },
};

/** 補足付き: 所見 + 対処のヒント */
export const WithDetail: Story = {
  args: {
    text: 'この期間の活動の大半は計画外でした',
    detail: '翌日の計画を前夜に立てると効果的です',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { text: '' },
  render: () => (
    <div className="flex flex-col gap-4">
      <InsightSlot text="合計時間 が前期間より 25% 改善しました" />
      <InsightSlot
        text="この期間の活動の大半は計画外でした"
        detail="翌日の計画を前夜に立てると効果的です"
      />
      <InsightSlot text="予定より長くかかる傾向の1日でした（平均 +18 分）" />
    </div>
  ),
};
