import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { EstimationAccuracyList } from './EstimationAccuracyList';

const ESTIMATION_ROWS = [
  {
    tagId: '1',
    tagName: 'Deep Work',
    tagColor: 'blue',
    avgPlannedMinutes: 90,
    avgActualMinutes: 112,
    avgDeviationMinutes: 22,
    recordCount: 24,
  },
  {
    tagId: '2',
    tagName: 'Meeting',
    tagColor: 'amber',
    avgPlannedMinutes: 60,
    avgActualMinutes: 58,
    avgDeviationMinutes: -2,
    recordCount: 18,
  },
  {
    tagId: '3',
    tagName: 'Learning',
    tagColor: 'green',
    avgPlannedMinutes: 45,
    avgActualMinutes: 30,
    avgDeviationMinutes: -15,
    recordCount: 9,
  },
];

/** EstimationAccuracyList — タグ別の見積もり精度リスト（週次ビューのセクション） */
const meta = {
  title: 'Product/Features/Review/Reflection/EstimationAccuracyList',
  component: EstimationAccuracyList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EstimationAccuracyList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** タグ別見積もり精度リスト */
export const Default: Story = {
  args: {
    rows: ESTIMATION_ROWS,
    isLoading: false,
  },
};

/** 読み込み中 */
export const Loading: Story = {
  args: {
    rows: undefined,
    isLoading: true,
  },
};

/** データなし */
export const Empty: Story = {
  args: {
    rows: [],
    isLoading: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { rows: ESTIMATION_ROWS, isLoading: false },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（見積もり精度）</p>
        <EstimationAccuracyList rows={ESTIMATION_ROWS} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Empty（データなし）</p>
        <EstimationAccuracyList rows={[]} isLoading={false} />
      </div>
    </div>
  ),
};
