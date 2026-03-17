import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';

import { RecurrenceDialog } from './RecurrenceDialog';

/** RecurrenceDialog - カスタム繰り返し設定ダイアログ（RRULE対応） */
const meta = {
  title: 'Features/Entry/Recurrence/RecurrenceDialog',
  parameters: {
    layout: 'padded',
    // button-name / label: internal SelectTrigger and number inputs without explicit labels
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function RecurrenceDialogStory({ initialValue = null }: { initialValue?: string | null }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState<string | null>(initialValue);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button onClick={() => setOpen(true)}>ダイアログを開く</Button>
        <span className="text-muted-foreground text-sm">
          RRULE: <code>{value || '(未設定)'}</code>
        </span>
      </div>
      <RecurrenceDialog open={open} onOpenChange={setOpen} value={value} onChange={setValue} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（新規作成時） */
export const Default: Story = {
  render: () => <RecurrenceDialogStory />,
};

/** 毎週 月・水・金 */
export const WeeklyPattern: Story = {
  render: () => <RecurrenceDialogStory initialValue="FREQ=WEEKLY;BYDAY=MO,WE,FR" />,
};

/** 隔週（INTERVAL=2） */
export const BiWeekly: Story = {
  render: () => <RecurrenceDialogStory initialValue="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR" />,
};

/** 毎月15日 */
export const MonthlyByDay: Story = {
  render: () => <RecurrenceDialogStory initialValue="FREQ=MONTHLY;BYMONTHDAY=15" />,
};

/** 毎月 第3金曜日 */
export const MonthlyBySetPos: Story = {
  render: () => <RecurrenceDialogStory initialValue="FREQ=MONTHLY;BYDAY=FR;BYSETPOS=3" />,
};

/** 回数指定（10回） */
export const WithCount: Story = {
  render: () => <RecurrenceDialogStory initialValue="FREQ=DAILY;COUNT=10" />,
};

/** 終了日指定 */
export const WithUntil: Story = {
  render: () => <RecurrenceDialogStory initialValue="FREQ=WEEKLY;BYDAY=MO;UNTIL=20251231" />,
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground mb-3 text-xs font-medium">Default（新規作成時）</p>
      <RecurrenceDialogStory />
      <p className="text-muted-foreground mb-3 text-xs font-medium">
        WeeklyPattern（毎週 月・水・金）
      </p>
      <RecurrenceDialogStory initialValue="FREQ=WEEKLY;BYDAY=MO,WE,FR" />
      <p className="text-muted-foreground mb-3 text-xs font-medium">BiWeekly（隔週）</p>
      <RecurrenceDialogStory initialValue="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR" />
      <p className="text-muted-foreground mb-3 text-xs font-medium">MonthlyByDay（毎月15日）</p>
      <RecurrenceDialogStory initialValue="FREQ=MONTHLY;BYMONTHDAY=15" />
      <p className="text-muted-foreground mb-3 text-xs font-medium">
        MonthlyBySetPos（毎月 第3金曜日）
      </p>
      <RecurrenceDialogStory initialValue="FREQ=MONTHLY;BYDAY=FR;BYSETPOS=3" />
      <p className="text-muted-foreground mb-3 text-xs font-medium">WithCount（10回）</p>
      <RecurrenceDialogStory initialValue="FREQ=DAILY;COUNT=10" />
      <p className="text-muted-foreground mb-3 text-xs font-medium">WithUntil（終了日指定）</p>
      <RecurrenceDialogStory initialValue="FREQ=WEEKLY;BYDAY=MO;UNTIL=20251231" />
    </div>
  ),
};
