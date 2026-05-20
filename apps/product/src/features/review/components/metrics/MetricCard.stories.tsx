import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowLeftRight, Clock, Flame, Gauge, Ratio, Star, Target, Timer } from 'lucide-react';

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
    label: 'Entry Rate',
    valueParts: { primary: '72', unit: '%' },
    icon: Target,
    progress: 0.72,
    progressStatus: 'good',
  },
};

/** トレンド: 上昇（良い方向） */
export const TrendUpPositive: Story = {
  args: {
    label: 'Deep Utilization',
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
    label: 'Entry Rate',
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
    label: 'Entry Rate',
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
    icon: Star,
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        icon={Star}
        trend={{ direction: 'up', delta: 0.1, isPositive: true }}
      />
      <MetricCard
        label="Entry Rate"
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
        label="Deep Utilization"
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricCard
        label="Total Time"
        valueParts={{ primary: '-', unit: '' }}
        variant="hero"
        isLoading
      />
      <MetricCard label="Avg Fulfillment" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Entry Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Streak" valueParts={{ primary: '-', unit: '' }} variant="hero" isLoading />
      <MetricCard label="Estimation Accuracy" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Deep Utilization" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Context Switches" valueParts={{ primary: '-', unit: '' }} isLoading />
      <MetricCard label="Blank Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { label: '', valueParts: { primary: '', unit: '' } },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（基本表示）</p>
        <MetricCard
          label="Entry Rate"
          valueParts={{ primary: '72', unit: '%' }}
          icon={Target}
          progress={0.72}
          progressStatus="good"
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">TrendUpPositive（上昇・良い変化）</p>
        <MetricCard
          label="Deep Utilization"
          valueParts={{ primary: '65', unit: '%' }}
          icon={Gauge}
          trend={{ direction: 'up', delta: 0.12, isPositive: true }}
          progress={0.65}
          progressStatus="good"
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">TrendDownPositive（下降・良い変化）</p>
        <MetricCard
          label="Blank Rate"
          valueParts={{ primary: '15', unit: '%' }}
          icon={Ratio}
          trend={{ direction: 'down', delta: -0.08, isPositive: true }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">TrendUpNegative（上昇・悪い変化）</p>
        <MetricCard
          label="Context Switches"
          valueParts={{ primary: '5.8', unit: '' }}
          icon={ArrowLeftRight}
          trend={{ direction: 'up', delta: 0.25, isPositive: false }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">TrendDownNegative（下降・悪い変化）</p>
        <MetricCard
          label="Entry Rate"
          valueParts={{ primary: '35', unit: '%' }}
          icon={Target}
          trend={{ direction: 'down', delta: -0.15, isPositive: false }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">TrendFlat（横ばい）</p>
        <MetricCard
          label="Context Switches"
          valueParts={{ primary: '3.2', unit: '' }}
          icon={ArrowLeftRight}
          trend={{ direction: 'flat', delta: 0.02, isPositive: true }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Loading（ローディング状態）</p>
        <MetricCard label="Entry Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">NoData（データなし）</p>
        <MetricCard
          label="Estimation Accuracy"
          valueParts={{ primary: '-', unit: '' }}
          icon={Timer}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">MinutesValue（時間表示・分）</p>
        <MetricCard
          label="Estimation Accuracy"
          valueParts={{ primary: '12', unit: 'm' }}
          icon={Timer}
          trend={{ direction: 'down', delta: -0.15, isPositive: true }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">HoursMinutesValue（時間表示・時間+分）</p>
        <MetricCard
          label="Estimation Accuracy"
          valueParts={{ primary: '1', unit: 'h', secondary: '30', secondaryUnit: 'm' }}
          icon={Timer}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">FulfillmentValue（充実度スコア）</p>
        <MetricCard
          label="Avg Fulfillment"
          valueParts={{ primary: '3.8', unit: '' }}
          icon={Star}
          trend={{ direction: 'up', delta: 0.1, isPositive: true }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">HeroTotalTime（Hero: 合計時間）</p>
        <MetricCard
          label="Total Time"
          valueParts={{ primary: '38', unit: 'h', secondary: '15', secondaryUnit: 'm' }}
          icon={Clock}
          variant="hero"
          trend={{ direction: 'up', delta: 0.12, isPositive: true }}
        />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">HeroStreak（Hero: ストリーク）</p>
        <MetricCard
          label="Streak"
          valueParts={{ primary: '23', unit: 'days' }}
          icon={Flame}
          variant="hero"
        />
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-4 text-xs">GridPreview（8カード横並び）</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            icon={Star}
            trend={{ direction: 'up', delta: 0.1, isPositive: true }}
          />
          <MetricCard
            label="Entry Rate"
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
            label="Deep Utilization"
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
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-4 text-xs">GridLoading（全ローディング状態）</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard
            label="Total Time"
            valueParts={{ primary: '-', unit: '' }}
            variant="hero"
            isLoading
          />
          <MetricCard label="Avg Fulfillment" valueParts={{ primary: '-', unit: '' }} isLoading />
          <MetricCard label="Entry Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
          <MetricCard
            label="Streak"
            valueParts={{ primary: '-', unit: '' }}
            variant="hero"
            isLoading
          />
          <MetricCard
            label="Estimation Accuracy"
            valueParts={{ primary: '-', unit: '' }}
            isLoading
          />
          <MetricCard label="Deep Utilization" valueParts={{ primary: '-', unit: '' }} isLoading />
          <MetricCard label="Context Switches" valueParts={{ primary: '-', unit: '' }} isLoading />
          <MetricCard label="Blank Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
        </div>
      </div>
    </div>
  ),
};
