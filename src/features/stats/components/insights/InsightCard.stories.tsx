import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { InsightOutput } from '../../types/insights.types';

import { InsightCard } from './InsightCard';

/** InsightCard — LLM インサイトの表示カード（findings + suggestions + question） */
const meta = {
  title: 'Features/Stats/Insights/InsightCard',
  component: InsightCard,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InsightCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const WEEKLY_INSIGHT: InsightOutput = {
  title: '計画的な週でしたが、ピーク時間の活用に改善余地あり',
  findings: [
    {
      category: 'planning',
      headline: 'Plan Rate が 78% と高水準',
      detail: '活動の大半が計画に沿って実行されています。先週の 65% から改善しました。',
      sentiment: 'positive',
    },
    {
      category: 'chronotype',
      headline: 'ピーク時間帯の活用は 35%',
      detail: '午前 10-12 時のピーク時間帯にミーティングが集中し、集中作業に充てられていません。',
      sentiment: 'needs_attention',
    },
    {
      category: 'balance',
      headline: '曜日バランスは安定',
      detail: '平日と週末の配分は一貫しています。金曜日だけ記録時間が少なめでした。',
      sentiment: 'neutral',
    },
  ],
  suggestions: [
    {
      action: 'ピーク時間帯（10-12時）にミーティングを入れず、集中作業をブロックする',
      rationale: 'chronotype に沿った配置で生産性を最大化できます',
    },
  ],
  question: '金曜日の記録時間が少ないのは意図的な選択ですか？',
  comparison: {
    summary: '先週より全体的に改善傾向',
    direction: 'improving',
  },
};

/** 週次インサイト（フルデータ） */
export const Weekly: Story = {
  args: { insight: WEEKLY_INSIGHT },
};

/** 比較なし */
export const WithoutComparison: Story = {
  args: {
    insight: {
      title: WEEKLY_INSIGHT.title,
      findings: WEEKLY_INSIGHT.findings,
      suggestions: WEEKLY_INSIGHT.suggestions,
      question: WEEKLY_INSIGHT.question,
    },
  },
};

/** 悪化傾向 */
export const Declining: Story = {
  args: {
    insight: {
      title: '先週より活動量が減少しています',
      findings: [
        {
          category: 'time_usage',
          headline: '記録時間が 40% 減少',
          detail: '先週の 35 時間から今週は 21 時間に減少しました。',
          sentiment: 'needs_attention',
        },
        {
          category: 'fulfillment',
          headline: '充実度スコアは維持',
          detail: '活動量は減りましたが、充実度は 3.7 と先週と同水準です。',
          sentiment: 'neutral',
        },
      ],
      suggestions: [
        {
          action: '来週は最低でも 1 日 3 時間の記録を目標にしてみる',
          rationale: '小さな目標から再開すると習慣が戻りやすい傾向があります',
        },
      ],
      question: '今週は意図的に休息を取っていましたか？',
      comparison: {
        summary: '活動量が大幅に減少',
        direction: 'declining',
      },
    },
  },
};

/** findings が少ない（最小構成） */
export const Minimal: Story = {
  args: {
    insight: {
      title: '安定した1週間でした',
      findings: [
        {
          category: 'pattern',
          headline: '大きな変化はありません',
          detail: '全体的に先週と同じペースで活動が続いています。',
          sentiment: 'neutral',
        },
      ],
      suggestions: [],
      question: '今のペースに満足していますか？',
      comparison: {
        summary: '先週と同水準',
        direction: 'stable',
      },
    },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { insight: WEEKLY_INSIGHT },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="max-w-lg">
        <p className="text-muted-foreground mb-4 text-xs">Weekly（週次インサイト・フルデータ）</p>
        <InsightCard insight={WEEKLY_INSIGHT} />
      </div>
      <div className="max-w-lg">
        <p className="text-muted-foreground mb-4 text-xs">WithoutComparison（比較なし）</p>
        <InsightCard
          insight={{
            title: WEEKLY_INSIGHT.title,
            findings: WEEKLY_INSIGHT.findings,
            suggestions: WEEKLY_INSIGHT.suggestions,
            question: WEEKLY_INSIGHT.question,
          }}
        />
      </div>
      <div className="max-w-lg">
        <p className="text-muted-foreground mb-4 text-xs">Declining（悪化傾向）</p>
        <InsightCard
          insight={{
            title: '先週より活動量が減少しています',
            findings: [
              {
                category: 'time_usage',
                headline: '記録時間が 40% 減少',
                detail: '先週の 35 時間から今週は 21 時間に減少しました。',
                sentiment: 'needs_attention',
              },
              {
                category: 'fulfillment',
                headline: '充実度スコアは維持',
                detail: '活動量は減りましたが、充実度は 3.7 と先週と同水準です。',
                sentiment: 'neutral',
              },
            ],
            suggestions: [
              {
                action: '来週は最低でも 1 日 3 時間の記録を目標にしてみる',
                rationale: '小さな目標から再開すると習慣が戻りやすい傾向があります',
              },
            ],
            question: '今週は意図的に休息を取っていましたか？',
            comparison: {
              summary: '活動量が大幅に減少',
              direction: 'declining',
            },
          }}
        />
      </div>
      <div className="max-w-lg">
        <p className="text-muted-foreground mb-4 text-xs">Minimal（最小構成）</p>
        <InsightCard
          insight={{
            title: '安定した1週間でした',
            findings: [
              {
                category: 'pattern',
                headline: '大きな変化はありません',
                detail: '全体的に先週と同じペースで活動が続いています。',
                sentiment: 'neutral',
              },
            ],
            suggestions: [],
            question: '今のペースに満足していますか？',
            comparison: {
              summary: '先週と同水準',
              direction: 'stable',
            },
          }}
        />
      </div>
    </div>
  ),
};
