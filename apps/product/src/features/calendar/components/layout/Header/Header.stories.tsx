import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { CompactDateNavigator, DateNavigator } from '@/components/common/DateNavigator';
import { ViewSwitcher } from './ViewSwitcher';

/** カレンダーヘッダーのサブコンポーネント（ViewSwitcher, DateNavigator）。 */
const meta = {
  title: 'Features/Calendar/Header',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs', 'critical'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function ViewSwitcherExample({
  initial = 'week',
}: { initial?: import('@/features/calendar/types/calendar.types').CalendarViewType } = {}) {
  const [current, setCurrent] =
    useState<import('@/features/calendar/types/calendar.types').CalendarViewType>(initial);
  return <ViewSwitcher currentView={current} onChange={setCurrent} />;
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** ビュー切替ドロップダウン。日/週 + 日数サブメニュー（2-9日）+ ビューの設定（週末・週数表示、密度切替[コンパクト/標準/ゆったり]、一般設定リンク）。キーボードショートカット対応（D, W, 1-9, 0）。 */
export const ViewSwitcherDefault: Story = {
  render: () => <ViewSwitcherExample />,
};

/** 複数日ビュー選択時。ラベルが「3日間」のように表示される。 */
export const ViewSwitcherMultiDay: Story = {
  render: () => <ViewSwitcherExample initial="3day" />,
};

/** 日付ナビゲーション3パターン。Google Calendar風のグループ化ボタンバー（h-8 = sm, 32px）。 */
export const DateNavigatorPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">Full: [&lt;] [Today] [&gt;]</p>
        <DateNavigator onNavigate={fn()} />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">Compact: [&lt;] [&gt;]（矢印のみ）</p>
        <CompactDateNavigator onNavigate={fn()} />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">Today only: [Today]</p>
        <DateNavigator onNavigate={fn()} showArrows={false} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    await expect(buttons.length).toBeGreaterThan(0);
    const firstButton = buttons[0];
    if (firstButton) {
      await userEvent.click(firstButton);
    }
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <ViewSwitcherExample />
      <div className="flex items-center gap-4">
        <DateNavigator onNavigate={fn()} />
        <CompactDateNavigator onNavigate={fn()} />
        <DateNavigator onNavigate={fn()} showArrows={false} />
      </div>
    </div>
  ),
};

/** モバイルレイアウト。コンパクト日付ナビ。viewport addon で自動切替。 */
export const MobileLayout: Story = {
  render: () => (
    <div className="flex items-center justify-between gap-2">
      <CompactDateNavigator onNavigate={fn()} />
    </div>
  ),
  globals: {
    viewport: { value: 'mobile1' },
  },
};
