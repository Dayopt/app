import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { CalendarViewType } from '../../../types/calendar.types';
import { ViewSwitcher } from './ViewSwitcher';

/**
 * ビュー切り替えドロップダウン（日/週/日数サブメニュー/ビューの設定）。
 * キーボードショートカット対応（D, W, 1-7, 0）。
 */
const meta = {
  title: 'Product/Features/Calendar/Header/ViewSwitcher',
  component: ViewSwitcher,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    onChange: fn(),
    onSettingsChange: fn(),
  },
} satisfies Meta<typeof ViewSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────

/** インタラクティブなビュー切り替えデモ */
function ViewSwitcherInteractive({ initial = 'week' }: { initial?: CalendarViewType }) {
  const [current, setCurrent] = useState<CalendarViewType>(initial);
  return <ViewSwitcher currentView={current} onChange={setCurrent} />;
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 週ビュー選択状態（デフォルト）。 */
export const WeekView: Story = {
  args: {
    currentView: 'week',
  },
};

/** 日ビュー選択状態。 */
export const DayView: Story = {
  args: {
    currentView: 'day',
  },
};

/** 複数日ビュー（3日間）選択状態。ラベルが「3日間」と表示される。 */
export const MultiDayView: Story = {
  args: {
    currentView: '3day',
  },
};

/** 5日間ビュー選択状態。 */
export const FiveDayView: Story = {
  args: {
    currentView: '5day',
  },
};

/** インタラクティブ版（週から開始）。クリックでビューが切り替わる。 */
export const Interactive: Story = {
  args: { currentView: 'week' },
  render: () => <ViewSwitcherInteractive initial="week" />,
};

/** インタラクティブ版（3日間から開始）。 */
export const InteractiveMultiDay: Story = {
  args: { currentView: '3day' },
  render: () => <ViewSwitcherInteractive initial="3day" />,
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { currentView: 'week' },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">週ビュー</p>
        <ViewSwitcher currentView="week" onChange={fn()} />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">日ビュー</p>
        <ViewSwitcher currentView="day" onChange={fn()} />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">3日間ビュー</p>
        <ViewSwitcher currentView="3day" onChange={fn()} />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">インタラクティブ（週→切り替え可）</p>
        <ViewSwitcherInteractive initial="week" />
      </div>
    </div>
  ),
};
