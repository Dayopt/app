import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimePLContainer } from './TimePLContainer';
import {
  MOCK_DAY_EXCELLENT,
  MOCK_MINIMAL,
  MOCK_WEEK_GOOD,
  MOCK_WITH_UNPLANNED,
} from './data/timePL.mocks';

/** Time P/L — 予実比較ビューを1つの入力データから描画 */
const meta = {
  title: 'Product/Features/Stats/TimePL',
  component: TimePLContainer,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimePLContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

// ── Bar Comparison ──

export const BarComparison: Story = {
  args: { input: MOCK_WEEK_GOOD },
};

export const BarComparisonDay: Story = {
  args: { input: MOCK_DAY_EXCELLENT },
};

export const BarComparisonUnplanned: Story = {
  args: { input: MOCK_WITH_UNPLANNED },
};

// ── States ──

export const Empty: Story = {
  args: { input: null },
};

export const Loading: Story = {
  args: { input: null, isLoading: true },
};

export const SingleTag: Story = {
  args: { input: MOCK_MINIMAL },
};
