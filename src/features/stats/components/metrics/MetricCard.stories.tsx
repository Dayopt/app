import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowLeftRight, Clock, Flame, Gauge, Ratio, Sparkles, Target, Timer } from 'lucide-react';

import { MetricCard } from './MetricCard';

/** MetricCard — KPI数値を表示するカード（weather.com風の数値/単位分離デザイン） */
const meta = {
  title: 'Features/Stats/Review/MetricCard',
  component: MetricCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示 */
export const Default: Story = {
  args: {
    label: 'Plan Rate',
    valueParts: { primary: '72', unit: '%' },
    icon: Target,
    progress: 0.72,
    progressStatus: 'good',
  },
};

/** トレンド: 上昇（良い方向） */
export const TrendUpPositive: Story = {
  args: {
    label: 'Peak Utilization',
    valueParts: { primary: '65', unit: '%' },
    icon: Gauge,
    trend: { direction: 'up', delta: 0.12, isPositive: true },
    progress: 0.65,
    progressStatus: 'good',
  },
};

/** トレンド: 下降（良い方向 — blankRate のように down が positive） */
export const TrendDownPositive: Story = {
  args: {
    label: 'Blank Rate',
    valueParts: { primary: '15', unit: '%' },
    icon: Ratio,
    trend: { direction: 'down', delta: -0.08, isPositive: true },
  },
};

/** トレンド: 上昇（悪い方向 — contextSwitches のように up が negative） */
export const TrendUpNegative: Story = {
  args: {
    label: 'Context Switches',
    valueParts: { primary: '5.8', unit: '' },
    icon: ArrowLeftRight,
    trend: { direction: 'up', delta: 0.25, isPositive: false },
  },
};

/** トレンド: 下降（悪い方向） */
export const TrendDownNegative: Story = {
  args: {
    label: 'Plan Rate',
    valueParts: { primary: '35', unit: '%' },
    icon: Target,
    trend: { direction: 'down', delta: -0.15, isPositive: false },
  },
};

/** トレンド: 横ばい */
export const TrendFlat: Story = {
  args: {
    label: 'Context Switches',
    valueParts: { primary: '3.2', unit: '' },
    icon: ArrowLeftRight,
    trend: { direction: 'flat', delta: 0.02, isPositive: true },
  },
};

/** ローディング状態 */
export const Loading: Story = {
  args: {
    label: 'Plan Rate',
    valueParts: { primary: '-', unit: '' },
    isLoading: true,
  },
};

/** データなし */
export const NoData: Story = {
  args: {
    label: 'Estimation Accuracy',
    valueParts: { primary: '-', unit: '' },
    icon: Timer,
  },
};

/** 時間表示（分） */
export const MinutesValue: Story = {
  args: {
    label: 'Estimation Accuracy',
    valueParts: { primary: '12', unit: 'm' },
    icon: Timer,
    trend: { direction: 'down', delta: -0.15, isPositive: true },
  },
};

/** 時間表示（時間+分） — secondary で分を表示 */
export const HoursMinutesValue: Story = {
  args: {
    label: 'Estimation Accuracy',
    valueParts: { primary: '1', unit: 'h', secondary: '30', secondaryUnit: 'm' },
    icon: Timer,
  },
};

/** 充実度スコア */
export const FulfillmentValue: Story = {
  args: {
    label: 'Avg Fulfillment',
    valueParts: { primary: '3.8', unit: '' },
    icon: Sparkles,
    trend: { direction: 'up', delta: 0.1, isPositive: true },
  },
};

/** Hero: 合計時間（col-span-2） */
export const HeroTotalTime: Story = {
  args: {
    label: 'Total Time',
    valueParts: { primary: '38', unit: 'h', secondary: '15', secondaryUnit: 'm' },
    icon: Clock,
    variant: 'hero',
    trend: { direction: 'up', delta: 0.12, isPositive: true },
  },
};

/** Hero: ストリーク（col-span-2） */
export const HeroStreak: Story = {
  args: {
    label: 'Streak',
    valueParts: { primary: '23', unit: 'days' },
    icon: Flame,
    variant: 'hero',
  },
};

/** 8カード横並び（グリッドプレビュー — hero含む） */
export const GridPreview: Story = {
  args: {
    label: '',
    valueParts: { primary: '', unit: '' },
  },
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard
        label="Total Time"
        valueParts={{ primary: '38', unit: 'h', secondary: '15', secondaryUnit: 'm' }}
        icon={Clock}
        variant="hero"
        trend={{ direction: 'up', delta: 0.12, isPositive: true }}
      />
      <MetricCard
        label="Avg Fulfillment"
        valueParts={{ primary: '3.8', unit: '' }}
        icon={Sparkles}
        trend={{ direction: 'up', delta: 0.1, isPositive: true }}
      />
      <MetricCard
        label="Plan Rate"
        valueParts={{ primary: '72', unit: '%' }}
        icon={Target}
        trend={{ direction: 'up', delta: 0.05, isPositive: true }}
        progress={0.72}
        progressStatus="good"
      />
      <MetricCard
        label="Streak"
        valueParts={{ primary: '23', unit: 'days' }}
        icon={Flame}
        variant="hero"
      />
      <MetricCard
        label="Estimation Accuracy"
        valueParts={{ primary: '12', unit: 'm' }}
        icon={Timer}
        trend={{ direction: 'down', delta: -0.15, isPositive: true }}
        progress={0.73}
        progressStatus="good"
      />
      <MetricCard
        label="Peak Utilization"
        valueParts={{ primary: '65', unit: '%' }}
        icon={Gauge}
        trend={{ direction: 'up', delta: 0.08, isPositive: true }}
        progress={0.65}
        progressStatus="good"
      />
      <MetricCard
        label="Context Switches"
        valueParts={{ primary: '3.2', unit: '' }}
        icon={ArrowLeftRight}
        trend={{ direction: 'flat', delta: 0.01, isPositive: true }}
      />
      <MetricCard
        label="Blank Rate"
        valueParts={{ primary: '28', unit: '%' }}
        icon={Ratio}
        trend={{ direction: 'down', delta: -0.03, isPositive: true }}
        progress={0.28}
        progressStatus="warning"
      />
    </div>
  ),
};

/** 全ローディング状態のグリッド */
export const GridLoading: Story = {
  args: {
    label: '',
    valueParts: { primary: '', unit: '' },
  },
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard
        label="Total Time"
        valueParts={{ primary: '-', unit: '' }}
        variant="hero"
        isLoading
      />
      <MetricCard label="Avg Fulfillment" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Plan Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Streak" valueParts={{ primary: '-', unit: '' }} variant="hero" isLoading />
      <MetricCard label="Estimation Accuracy" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Peak Utilization" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Context Switches" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Blank Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
    </div>
  ),
};
