import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimeDiffBar } from './TimeDiffBar';

/**
 * TimeDiffBar — 予定 vs 記録の差分表示
 *
 * TimeProgressBar（プログレスバー）+ 差分バッジの構成。
 * - 実績 < 予定: destructiveバー + マイナスバッジ
 * - 実績 = 予定: successバー + ±0バッジ
 * - 実績 > 予定: success + warningの2セグメントバー + プラスバッジ
 */
const meta = {
  title: 'Features/Entry/Inspector/TimeDiffBar',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** ぴったり達成（予定60分・実績60分）。±0バッジとsuccessバー。 */
export const Exact: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={60} actualMinutes={60} />
    </div>
  ),
};

/** 実績が予定より短い（予定60分・実績45分）。-15mバッジとdestructiveバー。 */
export const Underrun: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={60} actualMinutes={45} />
    </div>
  ),
};

/** 実績が予定より大幅に短い（予定60分・実績15分）。 */
export const LargeUnderrun: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={60} actualMinutes={15} />
    </div>
  ),
};

/** 実績が予定を超過（予定60分・実績75分）。+15mバッジと2セグメントバー。 */
export const Overrun: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={60} actualMinutes={75} />
    </div>
  ),
};

/** 実績が予定を大幅に超過（予定60分・実績120分）。+1hバッジ。 */
export const LargeOverrun: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={60} actualMinutes={120} />
    </div>
  ),
};

/** 時間と分が混在する差分（予定90分・実績155分）。+1h 5mバッジ。 */
export const HoursAndMinutes: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={90} actualMinutes={155} />
    </div>
  ),
};

/** 短いエントリー（15分）の超過。 */
export const ShortEntry: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={15} actualMinutes={20} />
    </div>
  ),
};

/** 長いエントリー（2時間）の未達。 */
export const LongEntry: Story = {
  render: () => (
    <div className="w-80">
      <TimeDiffBar plannedMinutes={120} actualMinutes={100} />
    </div>
  ),
};

/** 全パターン一覧（diff値別）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Exact（±0: ぴったり達成）</p>
        <TimeDiffBar plannedMinutes={60} actualMinutes={60} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Underrun（-15m: 予定より短い）</p>
        <TimeDiffBar plannedMinutes={60} actualMinutes={45} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">LargeUnderrun（-45m: 大幅に短い）</p>
        <TimeDiffBar plannedMinutes={60} actualMinutes={15} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Overrun（+15m: 予定超過）</p>
        <TimeDiffBar plannedMinutes={60} actualMinutes={75} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">LargeOverrun（+1h: 大幅超過）</p>
        <TimeDiffBar plannedMinutes={60} actualMinutes={120} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">HoursAndMinutes（+1h 5m）</p>
        <TimeDiffBar plannedMinutes={90} actualMinutes={155} />
      </div>
    </div>
  ),
};
