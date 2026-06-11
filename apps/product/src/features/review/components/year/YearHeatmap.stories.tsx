import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { YearHeatmap } from './YearHeatmap';

const YEAR = 2026;

function generateYearData(density: number): Array<{ day: string; hours: number }> {
  const data: Array<{ day: string; hours: number }> = [];
  const cursor = new Date(YEAR, 0, 1);
  let seed = 42;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  while (cursor.getFullYear() === YEAR) {
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const hours = random() < density ? Math.round(random() * 80) / 10 : 0;
    data.push({ day: `${YEAR}-${m}-${d}`, hours });
    cursor.setDate(cursor.getDate() + 1);
  }
  return data;
}

/** YearHeatmap — 1年の記録量ヒートマップ（年次ビューの主役、「1年分の時間の地図」） */
const meta = {
  title: 'Features/Stats/Review/YearHeatmap',
  component: YearHeatmap,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof YearHeatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示: 高頻度で記録された 1 年 */
export const Default: Story = {
  args: {
    data: generateYearData(0.8),
    year: YEAR,
    isLoading: false,
  },
};

/** まばらな記録（使い始めの年） */
export const Sparse: Story = {
  args: {
    data: generateYearData(0.2),
    year: YEAR,
    isLoading: false,
  },
};

/** データなし */
export const Empty: Story = {
  args: {
    data: [],
    year: YEAR,
    isLoading: false,
  },
};

/** ローディング */
export const Loading: Story = {
  args: {
    data: undefined,
    year: YEAR,
    isLoading: true,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { data: [], year: YEAR, isLoading: false },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（高頻度）</p>
        <YearHeatmap data={generateYearData(0.8)} year={YEAR} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Sparse（まばら）</p>
        <YearHeatmap data={generateYearData(0.2)} year={YEAR} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Empty（データなし）</p>
        <YearHeatmap data={[]} year={YEAR} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Loading（ローディング）</p>
        <YearHeatmap data={undefined} year={YEAR} isLoading />
      </div>
    </div>
  ),
};
