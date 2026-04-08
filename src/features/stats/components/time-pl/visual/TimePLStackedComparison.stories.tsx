import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  MOCK_PL_DAY_EXCELLENT,
  MOCK_PL_MINIMAL,
  MOCK_PL_MONTH_POOR,
  MOCK_PL_WEEK_GOOD,
  MOCK_PL_WITH_UNPLANNED,
} from '../timePL.mocks';

import { TimePLStackedComparison } from './TimePLStackedComparison';

/** 積み上げバー対比 — Budget と Actual の構成比を視覚的に比較 */
const meta = {
  title: 'Features/Stats/TimePL/Visual/StackedComparison',
  component: TimePLStackedComparison,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimePLStackedComparison>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: MOCK_PL_WEEK_GOOD },
};

export const DayExcellent: Story = {
  args: { data: MOCK_PL_DAY_EXCELLENT },
};

export const MonthPoor: Story = {
  args: { data: MOCK_PL_MONTH_POOR },
};

export const WithUnplanned: Story = {
  args: { data: MOCK_PL_WITH_UNPLANNED },
};

export const SingleTag: Story = {
  args: { data: MOCK_PL_MINIMAL },
};

export const Empty: Story = {
  args: { data: null },
};
