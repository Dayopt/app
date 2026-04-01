import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { RuleInsight } from '../../lib/ruleInsights';

import { RuleInsightList } from './RuleInsightList';

/** RuleInsightList — 閾値ベースの気づきリスト（Review タブ KPI グリッド下） */
const meta = {
  title: 'Features/Stats/Review/RuleInsightList',
  component: RuleInsightList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof RuleInsightList>;

export default meta;
type Story = StoryObj<typeof meta>;

const MOCK_INSIGHTS: RuleInsight[] = [
  {
    metricId: 'entryRate',
    type: 'threshold',
    severity: 'warning',
    messageKey: 'entryRateLow',
    detailKey: 'entryRateLowDetail',
  },
  {
    metricId: 'deepUtilization',
    type: 'threshold',
    severity: 'info',
    messageKey: 'deepUtilizationLow',
  },
  {
    metricId: 'avgFulfillment',
    type: 'trend',
    severity: 'info',
    messageKey: 'trendBetter',
    messageParams: { label: 'Avg Fulfillment', pct: 25 },
  },
];

/** 警告 + 情報の混在 */
export const Mixed: Story = {
  args: { insights: MOCK_INSIGHTS },
};

/** 警告のみ */
export const WarningsOnly: Story = {
  args: {
    insights: [
      {
        metricId: 'contextSwitches',
        type: 'threshold',
        severity: 'warning',
        messageKey: 'contextSwitchesHigh',
        detailKey: 'contextSwitchesHighDetail',
      },
      {
        metricId: 'entryRate',
        type: 'trend',
        severity: 'warning',
        messageKey: 'trendWorse',
        messageParams: { label: 'Entry Rate', pct: 30 },
      },
    ],
  },
};

/** クリティカルを含む（重大な警告） */
export const WithCritical: Story = {
  args: {
    insights: [
      {
        metricId: 'blankRate',
        type: 'threshold',
        severity: 'critical',
        messageKey: 'blankRateHigh',
        detailKey: 'entryRateLowDetail',
      },
      {
        metricId: 'entryRate',
        type: 'threshold',
        severity: 'warning',
        messageKey: 'entryRateLow',
        detailKey: 'entryRateLowDetail',
      },
    ],
  },
};

/** 空（問題なし → 非表示） */
export const Empty: Story = {
  args: { insights: [] },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { insights: MOCK_INSIGHTS },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">Mixed（警告＋情報の混在）</p>
        <RuleInsightList insights={MOCK_INSIGHTS} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">WarningsOnly（警告のみ）</p>
        <RuleInsightList
          insights={[
            {
              metricId: 'contextSwitches',
              type: 'threshold',
              severity: 'warning',
              messageKey: 'contextSwitchesHigh',
              detailKey: 'contextSwitchesHighDetail',
            },
            {
              metricId: 'entryRate',
              type: 'trend',
              severity: 'warning',
              messageKey: 'trendWorse',
              messageParams: { label: 'Entry Rate', pct: 30 },
            },
          ]}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">Empty（空・問題なし）</p>
        <RuleInsightList insights={[]} />
      </div>
    </div>
  ),
};
