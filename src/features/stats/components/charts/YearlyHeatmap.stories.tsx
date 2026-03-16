import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { YearlyHeatmap } from './YearlyHeatmap';

/** YearlyHeatmap — 年間のアクティビティをヒートマップで表示（tRPC依存のためローディング状態で表示） */
const meta = {
  title: 'Features/Stats/Progress/CalendarHeatmap',
  component: YearlyHeatmap,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof YearlyHeatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト（ローディング状態） */
export const Default: Story = {};
