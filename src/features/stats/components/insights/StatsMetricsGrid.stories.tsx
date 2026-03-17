import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowLeftRight, Clock, Flame, Gauge, Ratio, Sparkles, Target, Timer } from 'lucide-react';

import { MetricCard } from '../metrics/MetricCard';

// =============================================================================
// Meta
// =============================================================================

/**
 * StatsMetricsGrid — KPIメトリクスグリッド（8カード）
 *
 * Review タブの主要コンポーネント。
 * tRPCなしでモックデータを直接使用。
 */
const meta = {
  title: 'Features/Stats/Review/StatsMetricsGrid',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// =============================================================================
// Stories
// =============================================================================

/** データありの典型的な振り返りタブ */
export const WithData: Story = {
  render: () => (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
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
        </div>
      </div>
    </div>
  ),
};

/** ローディング状態 */
export const Loading: Story = {
  render: () => (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Total Time"
              valueParts={{ primary: '-', unit: '' }}
              variant="hero"
              isLoading
            />
            <MetricCard label="Avg Fulfillment" valueParts={{ primary: '-', unit: '' }} isLoading />
            <MetricCard label="Plan Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
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
            <MetricCard
              label="Peak Utilization"
              valueParts={{ primary: '-', unit: '' }}
              isLoading
            />
            <MetricCard
              label="Context Switches"
              valueParts={{ primary: '-', unit: '' }}
              isLoading
            />
            <MetricCard label="Blank Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
          </div>
        </div>
      </div>
    </div>
  ),
};

/** データなし（新規ユーザー） */
export const Empty: Story = {
  render: () => (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Total Time"
              valueParts={{ primary: '-', unit: '' }}
              icon={Clock}
              variant="hero"
            />
            <MetricCard
              label="Avg Fulfillment"
              valueParts={{ primary: '-', unit: '' }}
              icon={Sparkles}
            />
            <MetricCard label="Plan Rate" valueParts={{ primary: '-', unit: '' }} icon={Target} />
            <MetricCard
              label="Streak"
              valueParts={{ primary: '-', unit: '' }}
              icon={Flame}
              variant="hero"
            />
            <MetricCard
              label="Estimation Accuracy"
              valueParts={{ primary: '-', unit: '' }}
              icon={Timer}
            />
            <MetricCard
              label="Peak Utilization"
              valueParts={{ primary: '-', unit: '' }}
              icon={Gauge}
            />
            <MetricCard
              label="Context Switches"
              valueParts={{ primary: '-', unit: '' }}
              icon={ArrowLeftRight}
            />
            <MetricCard label="Blank Rate" valueParts={{ primary: '-', unit: '' }} icon={Ratio} />
          </div>
        </div>
      </div>
    </div>
  ),
};

/** 高パフォーマンスユーザー */
export const HighPerformance: Story = {
  render: () => (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Total Time"
              valueParts={{ primary: '52', unit: 'h', secondary: '30', secondaryUnit: 'm' }}
              icon={Clock}
              variant="hero"
              trend={{ direction: 'up', delta: 0.15, isPositive: true }}
            />
            <MetricCard
              label="Avg Fulfillment"
              valueParts={{ primary: '4.5', unit: '' }}
              icon={Sparkles}
              trend={{ direction: 'up', delta: 0.08, isPositive: true }}
            />
            <MetricCard
              label="Plan Rate"
              valueParts={{ primary: '95', unit: '%' }}
              icon={Target}
              trend={{ direction: 'up', delta: 0.03, isPositive: true }}
              progress={0.95}
              progressStatus="good"
            />
            <MetricCard
              label="Streak"
              valueParts={{ primary: '45', unit: 'days' }}
              icon={Flame}
              variant="hero"
            />
            <MetricCard
              label="Estimation Accuracy"
              valueParts={{ primary: '5', unit: 'm' }}
              icon={Timer}
              trend={{ direction: 'down', delta: -0.2, isPositive: true }}
              progress={0.89}
              progressStatus="good"
            />
            <MetricCard
              label="Peak Utilization"
              valueParts={{ primary: '88', unit: '%' }}
              icon={Gauge}
              trend={{ direction: 'up', delta: 0.1, isPositive: true }}
              progress={0.88}
              progressStatus="good"
            />
            <MetricCard
              label="Context Switches"
              valueParts={{ primary: '1.5', unit: '' }}
              icon={ArrowLeftRight}
              trend={{ direction: 'flat', delta: 0, isPositive: true }}
            />
            <MetricCard
              label="Blank Rate"
              valueParts={{ primary: '8', unit: '%' }}
              icon={Ratio}
              trend={{ direction: 'down', delta: -0.05, isPositive: true }}
              progress={0.08}
              progressStatus="good"
            />
          </div>
        </div>
      </div>
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="w-full">
        <p className="text-muted-foreground mb-3 text-xs font-medium">WithData（データあり）</p>
        <div className="bg-background flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
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
            </div>
          </div>
        </div>
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          Loading（ローディング状態）
        </p>
        <div className="bg-background flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Total Time"
                  valueParts={{ primary: '-', unit: '' }}
                  variant="hero"
                  isLoading
                />
                <MetricCard
                  label="Avg Fulfillment"
                  valueParts={{ primary: '-', unit: '' }}
                  isLoading
                />
                <MetricCard label="Plan Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
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
                <MetricCard
                  label="Peak Utilization"
                  valueParts={{ primary: '-', unit: '' }}
                  isLoading
                />
                <MetricCard
                  label="Context Switches"
                  valueParts={{ primary: '-', unit: '' }}
                  isLoading
                />
                <MetricCard label="Blank Rate" valueParts={{ primary: '-', unit: '' }} isLoading />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          Empty（データなし・新規ユーザー）
        </p>
        <div className="bg-background flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Total Time"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Clock}
                  variant="hero"
                />
                <MetricCard
                  label="Avg Fulfillment"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Sparkles}
                />
                <MetricCard
                  label="Plan Rate"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Target}
                />
                <MetricCard
                  label="Streak"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Flame}
                  variant="hero"
                />
                <MetricCard
                  label="Estimation Accuracy"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Timer}
                />
                <MetricCard
                  label="Peak Utilization"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Gauge}
                />
                <MetricCard
                  label="Context Switches"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={ArrowLeftRight}
                />
                <MetricCard
                  label="Blank Rate"
                  valueParts={{ primary: '-', unit: '' }}
                  icon={Ratio}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-3 text-xs font-medium">
          HighPerformance（高パフォーマンスユーザー）
        </p>
        <div className="bg-background flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Total Time"
                  valueParts={{ primary: '52', unit: 'h', secondary: '30', secondaryUnit: 'm' }}
                  icon={Clock}
                  variant="hero"
                  trend={{ direction: 'up', delta: 0.15, isPositive: true }}
                />
                <MetricCard
                  label="Avg Fulfillment"
                  valueParts={{ primary: '4.5', unit: '' }}
                  icon={Sparkles}
                  trend={{ direction: 'up', delta: 0.08, isPositive: true }}
                />
                <MetricCard
                  label="Plan Rate"
                  valueParts={{ primary: '95', unit: '%' }}
                  icon={Target}
                  trend={{ direction: 'up', delta: 0.03, isPositive: true }}
                  progress={0.95}
                  progressStatus="good"
                />
                <MetricCard
                  label="Streak"
                  valueParts={{ primary: '45', unit: 'days' }}
                  icon={Flame}
                  variant="hero"
                />
                <MetricCard
                  label="Estimation Accuracy"
                  valueParts={{ primary: '5', unit: 'm' }}
                  icon={Timer}
                  trend={{ direction: 'down', delta: -0.2, isPositive: true }}
                  progress={0.89}
                  progressStatus="good"
                />
                <MetricCard
                  label="Peak Utilization"
                  valueParts={{ primary: '88', unit: '%' }}
                  icon={Gauge}
                  trend={{ direction: 'up', delta: 0.1, isPositive: true }}
                  progress={0.88}
                  progressStatus="good"
                />
                <MetricCard
                  label="Context Switches"
                  valueParts={{ primary: '1.5', unit: '' }}
                  icon={ArrowLeftRight}
                  trend={{ direction: 'flat', delta: 0, isPositive: true }}
                />
                <MetricCard
                  label="Blank Rate"
                  valueParts={{ primary: '8', unit: '%' }}
                  icon={Ratio}
                  trend={{ direction: 'down', delta: -0.05, isPositive: true }}
                  progress={0.08}
                  progressStatus="good"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};
