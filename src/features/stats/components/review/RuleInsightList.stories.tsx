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
    metricId: 'planRate',
    type: 'threshold',
    severity: 'warning',
    message: 'この期間の活動の大半は計画外でした',
    detail: '翌日の計画を前夜に立ててみましょう',
  },
  {
    metricId: 'peakUtilization',
    type: 'threshold',
    severity: 'info',
    message: 'ピーク時間帯がほとんど使われていません',
  },
  {
    metricId: 'avgFulfillment',
    type: 'trend',
    severity: 'info',
    message: 'Avg Fulfillment が前期間より 25% 改善しました',
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
        message: 'タスク切替が多い期間でした',
        detail: '類似タスクをまとめてバッチ処理してみましょう',
      },
      {
        metricId: 'planRate',
        type: 'trend',
        severity: 'warning',
        message: 'Plan Rate が前期間より 30% 低下しました',
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
        <p className="text-muted-foreground mb-3 text-xs font-medium">Mixed（警告＋情報の混在）</p>
        <RuleInsightList insights={MOCK_INSIGHTS} />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">WarningsOnly（警告のみ）</p>
        <RuleInsightList
          insights={[
            {
              metricId: 'contextSwitches',
              type: 'threshold',
              severity: 'warning',
              message: 'タスク切替が多い期間でした',
              detail: '類似タスクをまとめてバッチ処理してみましょう',
            },
            {
              metricId: 'planRate',
              type: 'trend',
              severity: 'warning',
              message: 'Plan Rate が前期間より 30% 低下しました',
            },
          ]}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">Empty（空・問題なし）</p>
        <RuleInsightList insights={[]} />
      </div>
    </div>
  ),
};
