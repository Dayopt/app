import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { RecurrenceIconButton } from './RecurrenceIconButton';

/** RecurrenceIconButton - 繰り返し設定ポップオーバー（プリセット + カスタム） */
const meta = {
  title: 'Features/Entry/Recurrence/RecurrenceIconButton',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function RecurrenceIconButtonStory({
  initialType = null,
  initialRule = null,
  disabled = false,
}: {
  initialType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | null;
  initialRule?: string | null;
  disabled?: boolean;
}) {
  const [recurrenceType, setRecurrenceType] = useState<
    'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | null
  >(initialType);
  const [recurrenceRule, setRecurrenceRule] = useState<string | null>(initialRule);

  return (
    <div className="space-y-4">
      <RecurrenceIconButton
        recurrenceType={recurrenceType}
        recurrenceRule={recurrenceRule}
        onRepeatTypeChange={(type) => setRecurrenceType(type as typeof recurrenceType)}
        onRecurrenceRuleChange={setRecurrenceRule}
        disabled={disabled}
      />
      <div className="text-muted-foreground text-xs">
        <div>type: {recurrenceType || '(null)'}</div>
        <div>rule: {recurrenceRule || '(null)'}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 未設定（アイコンのみ） */
export const Default: Story = {
  render: () => <RecurrenceIconButtonStory />,
};

/** 毎日が選択された状態 */
export const Daily: Story = {
  render: () => <RecurrenceIconButtonStory initialType="daily" />,
};

/** 毎週が選択された状態 */
export const Weekly: Story = {
  render: () => <RecurrenceIconButtonStory initialType="weekly" />,
};

/** 毎月が選択された状態 */
export const Monthly: Story = {
  render: () => <RecurrenceIconButtonStory initialType="monthly" />,
};

/** 毎年が選択された状態 */
export const Yearly: Story = {
  render: () => <RecurrenceIconButtonStory initialType="yearly" />,
};

/** 平日（月〜金）が選択された状態 */
export const Weekdays: Story = {
  render: () => <RecurrenceIconButtonStory initialType="weekdays" />,
};

/** カスタムRRULEが設定された状態 */
export const CustomRule: Story = {
  render: () => <RecurrenceIconButtonStory initialRule="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR" />,
};

/** 無効化状態 */
export const Disabled: Story = {
  render: () => <RecurrenceIconButtonStory initialType="daily" disabled />,
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">未設定</span>
        <RecurrenceIconButtonStory />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">毎日</span>
        <RecurrenceIconButtonStory initialType="daily" />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">毎週</span>
        <RecurrenceIconButtonStory initialType="weekly" />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">毎月</span>
        <RecurrenceIconButtonStory initialType="monthly" />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">毎年</span>
        <RecurrenceIconButtonStory initialType="yearly" />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">平日（月〜金）</span>
        <RecurrenceIconButtonStory initialType="weekdays" />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">カスタム</span>
        <RecurrenceIconButtonStory initialRule="FREQ=MONTHLY;BYMONTHDAY=15" />
      </div>
      <div>
        <span className="text-muted-foreground mb-2 block text-xs">無効化</span>
        <RecurrenceIconButtonStory initialType="daily" disabled />
      </div>
    </div>
  ),
};
