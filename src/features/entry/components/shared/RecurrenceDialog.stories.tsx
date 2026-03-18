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

/**
 * 全パターン一覧。
 *
 * RecurrenceDialog は Portal でマウントされるため、複数のインスタンスを
 * 同時にレンダリングするとダイアログが重なって表示される。
 * AllPatterns では RRULE プリセットを静的な説明カードで一覧し、
 * 動作確認は各個別ストーリーで行う設計とする。
 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(
        [
          { label: 'Default（新規作成時）', value: null },
          { label: 'WeeklyPattern（毎週 月・水・金）', value: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' },
          {
            label: 'BiWeekly（隔週 月・水・金）',
            value: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR',
          },
          { label: 'MonthlyByDay（毎月15日）', value: 'FREQ=MONTHLY;BYMONTHDAY=15' },
          {
            label: 'MonthlyBySetPos（毎月 第3金曜日）',
            value: 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=3',
          },
          { label: 'WithCount（10回）', value: 'FREQ=DAILY;COUNT=10' },
          { label: 'WithUntil（終了日指定）', value: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20251231' },
        ] as { label: string; value: string | null }[]
      ).map(({ label, value }) => (
        <div key={label} className="border-border rounded-lg border p-3">
          <p className="text-foreground mb-1 text-sm font-medium">{label}</p>
          <code className="text-muted-foreground text-xs">{value ?? '(未設定)'}</code>
        </div>
      ))}
      <p className="text-muted-foreground mt-2 text-xs">
        ※ Dialog は Portal でマウントされるため同時展開すると重なる。
        動作確認は各個別ストーリーを使用すること。
      </p>
    </div>
  ),
};
