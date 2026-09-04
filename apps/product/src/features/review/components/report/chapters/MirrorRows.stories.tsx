import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MirrorRows } from './MirrorRows';

import type { ReportMirrorRow } from '../../../domain/report/report-view-model';

/**
 * 見積もりの鏡。癖の強い順に最大 3 件で、良し悪しの色は付けない。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/MirrorRows',
  component: MirrorRows,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MirrorRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeRows: Story = {
  args: {
    rows: [
      { activityId: 'a', name: '執筆', color: 'blue', coefficient: 1.31, tone: 'over' },
      { activityId: 'b', name: 'メール', color: 'violet', coefficient: 0.72, tone: 'under' },
      { activityId: 'c', name: '読書', color: 'green', coefficient: 1.02, tone: 'onPlan' },
    ] satisfies ReportMirrorRow[],
  },
};

export const OneRow: Story = {
  args: {
    rows: [{ activityId: 'a', name: '執筆', color: 'blue', coefficient: 1.44, tone: 'over' }],
  },
};

/** 候補 0 件。責めず、催促もしない一文を置く。 */
export const Empty: Story = { args: { rows: [] } };
