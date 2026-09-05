import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ReportMobileHeader } from './ReportMobileHeader';

/**
 * `/report` のヘッダー（モバイル）。
 *
 * デスクトップ（`ReportHeader`）と同じ器・同じ部品で、違いは 1 つだけ:
 * **粒度切替を出さない**（仕様 §8）。粒度そのものは URL に従うので、月・年のリンクを
 * スマホで開いてもその期間のまま描く。
 */
const meta = {
  title: 'Product/Features/Review/Layout/ReportMobileHeader',
  component: ReportMobileHeader,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  argTypes: {
    granularity: { control: 'radio', options: ['week', 'month', 'year'] },
    weekStartsOn: { control: 'radio', options: [0, 1, 6] },
  },
} satisfies Meta<typeof ReportMobileHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_ARGS = {
  periodStart: new Date(2026, 7, 31),
  periodEnd: new Date(2026, 8, 6),
  granularity: 'week' as const,
  weekStartsOn: 1 as const,
  onNavigate: () => {},
};

/** 既定（375x812）。期間ラベルと `‹ ›` だけが並ぶ。 */
export const Week: Story = { args: BASE_ARGS };

/** URL が月粒度のまま開かれた場合。週へ丸めない。 */
export const Month: Story = {
  args: {
    ...BASE_ARGS,
    granularity: 'month',
    periodStart: new Date(2026, 8, 1),
    periodEnd: new Date(2026, 8, 30),
  },
};

/** 最小幅（320px）。年をまたぐ週ラベルでも `‹ ›` が押せる幅を保つ。 */
export const NarrowScreen: Story = {
  args: {
    ...BASE_ARGS,
    periodStart: new Date(2026, 11, 28),
    periodEnd: new Date(2027, 0, 3),
  },
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};
