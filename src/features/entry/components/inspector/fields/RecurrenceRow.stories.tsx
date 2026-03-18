import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { RecurrenceType } from '../../../types/entry';

import { RecurrenceRow } from './RecurrenceRow';

/**
 * RecurrenceRow — 繰り返し設定行
 *
 * icon + ラベル（左）| RecurrenceIconButton（右）の構成。
 * 繰り返しなし・毎日・毎週・毎月・毎年・平日のパターンをサポートする。
 */
const meta = {
  title: 'Features/Entry/Inspector/RecurrenceRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RecurrenceRowDemo({
  initialRule = null,
  initialType = null,
}: {
  initialRule?: string | null;
  initialType?: RecurrenceType | null;
}) {
  const [rule, setRule] = useState<string | null>(initialRule);
  const [type, setType] = useState<RecurrenceType | null>(initialType);

  return (
    <div className="w-72">
      <RecurrenceRow
        recurrenceRule={rule}
        recurrenceType={type}
        onRepeatTypeChange={(t) => setType(t as RecurrenceType)}
        onRecurrenceRuleChange={setRule}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 繰り返しなし（デフォルト）。 */
export const Default: Story = {
  render: () => <RecurrenceRowDemo />,
};

/** 毎日繰り返し。 */
export const Daily: Story = {
  render: () => <RecurrenceRowDemo initialRule="FREQ=DAILY" initialType="daily" />,
};

/** 毎週繰り返し。 */
export const Weekly: Story = {
  render: () => <RecurrenceRowDemo initialRule="FREQ=WEEKLY;BYDAY=MO" initialType="weekly" />,
};

/** 毎月繰り返し。 */
export const Monthly: Story = {
  render: () => (
    <RecurrenceRowDemo initialRule="FREQ=MONTHLY;BYMONTHDAY=18" initialType="monthly" />
  ),
};

/** 毎年繰り返し。 */
export const Yearly: Story = {
  render: () => <RecurrenceRowDemo initialRule="FREQ=YEARLY" initialType="yearly" />,
};

/** 平日のみ繰り返し。 */
export const Weekdays: Story = {
  render: () => (
    <RecurrenceRowDemo initialRule="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" initialType="weekdays" />
  ),
};

/** コールバックのみ（非インタラクティブ確認用）。 */
export const WithCallbacks: Story = {
  render: () => (
    <div className="w-72">
      <RecurrenceRow
        recurrenceRule={null}
        recurrenceType={null}
        onRepeatTypeChange={fn()}
        onRecurrenceRuleChange={fn()}
      />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">なし（デフォルト）</p>
        <RecurrenceRowDemo />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">毎日</p>
        <RecurrenceRowDemo initialRule="FREQ=DAILY" initialType="daily" />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">毎週</p>
        <RecurrenceRowDemo initialRule="FREQ=WEEKLY;BYDAY=MO" initialType="weekly" />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">毎月</p>
        <RecurrenceRowDemo initialRule="FREQ=MONTHLY;BYMONTHDAY=18" initialType="monthly" />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">毎年</p>
        <RecurrenceRowDemo initialRule="FREQ=YEARLY" initialType="yearly" />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">平日のみ</p>
        <RecurrenceRowDemo initialRule="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" initialType="weekdays" />
      </div>
    </div>
  ),
};
