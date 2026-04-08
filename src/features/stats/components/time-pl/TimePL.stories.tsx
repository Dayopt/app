import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimePLContainer } from './TimePLContainer';
import {
  MOCK_DAY_EXCELLENT,
  MOCK_MINIMAL,
  MOCK_MONTH_POOR,
  MOCK_WEEK_BUSY,
  MOCK_WEEK_GOOD,
  MOCK_WEEK_LIGHT,
  MOCK_WITH_UNPLANNED,
} from './data/timePL.mocks';

import type { TimePLViewType } from './data/timePL.types';

/** Time P/L — 全ビューを1つの入力データから描画 */
const meta = {
  title: 'Features/Stats/TimePL',
  component: TimePLContainer,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    view: {
      control: 'select',
      options: [
        'statement',
        'waterfall',
        'barComparison',
        'stacked',
        'breakEven',
        'balanceSheet',
      ] satisfies TimePLViewType[],
    },
  },
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

// ── Statement ──

export const Statement: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'statement' },
};

export const StatementDay: Story = {
  args: { input: MOCK_DAY_EXCELLENT, view: 'statement' },
};

export const StatementPoor: Story = {
  args: { input: MOCK_MONTH_POOR, view: 'statement' },
};

export const StatementUnplanned: Story = {
  args: { input: MOCK_WITH_UNPLANNED, view: 'statement' },
};

// ── Waterfall ──

export const Waterfall: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'waterfall' },
};

export const WaterfallUnplanned: Story = {
  args: { input: MOCK_WITH_UNPLANNED, view: 'waterfall' },
};

// ── Bar Comparison ──

export const BarComparison: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'barComparison' },
};

export const BarComparisonUnplanned: Story = {
  args: { input: MOCK_WITH_UNPLANNED, view: 'barComparison' },
};

// ── Stacked ──

export const Stacked: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'stacked' },
};

// ── Break Even ──

export const BreakEven: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'breakEven' },
};

export const BreakEvenUnplanned: Story = {
  args: { input: MOCK_WITH_UNPLANNED, view: 'breakEven' },
};

export const BreakEvenDay: Story = {
  args: { input: MOCK_DAY_EXCELLENT, view: 'breakEven' },
};

// ── Balance Sheet ──

export const BalanceSheet: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'balanceSheet' },
};

export const BalanceSheetBusy: Story = {
  args: { input: MOCK_WEEK_BUSY, view: 'balanceSheet' },
};

export const BalanceSheetLight: Story = {
  args: { input: MOCK_WEEK_LIGHT, view: 'balanceSheet' },
};

// ── States ──

export const Empty: Story = {
  args: { input: null, view: 'statement' },
};

export const Loading: Story = {
  args: { input: null, view: 'statement', isLoading: true },
};

export const SingleTag: Story = {
  args: { input: MOCK_MINIMAL, view: 'statement' },
};

// ── All Views (same data) ──

const ALL_VIEWS: TimePLViewType[] = [
  'statement',
  'waterfall',
  'barComparison',
  'stacked',
  'breakEven',
  'balanceSheet',
];

export const AllViews: Story = {
  args: { input: MOCK_WEEK_GOOD, view: 'statement' },
  render: () => (
    <div className="flex flex-col gap-8">
      {ALL_VIEWS.map((v) => (
        <div key={v}>
          <p className="text-muted-foreground mb-2 text-xs font-medium">{v}</p>
          <TimePLContainer input={MOCK_WEEK_GOOD} view={v} />
        </div>
      ))}
    </div>
  ),
};

export const AllViewsUnplanned: Story = {
  args: { input: MOCK_WITH_UNPLANNED, view: 'statement' },
  render: () => (
    <div className="flex flex-col gap-8">
      {ALL_VIEWS.map((v) => (
        <div key={v}>
          <p className="text-muted-foreground mb-2 text-xs font-medium">{v}</p>
          <TimePLContainer input={MOCK_WITH_UNPLANNED} view={v} />
        </div>
      ))}
    </div>
  ),
};
