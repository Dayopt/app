import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DragSelectionPreview } from './CalendarDragSelection/DragSelectionPreview';

/** ドラッグ選択プレビュー。グリッド上の時間範囲選択UI。 */
const meta = {
  title: 'Features/Calendar/DragSelectionPreview',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function Slot({ children, height = 72 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="relative w-full" style={{ height }}>
      {children}
    </div>
  );
}

const formatTime = (hour: number, minute: number) => {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** ドラッグ選択中のプレビュー。 */
export const Default: Story = {
  // color-contrast: text-muted-foreground on plan card background
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <Slot>
      <DragSelectionPreview
        selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
        formatTime={formatTime}
      />
    </Slot>
  ),
};

/** 時間重複時のエラー表示。赤背景 + Banアイコン。 */
export const Overlapping: Story = {
  render: () => (
    <Slot>
      <DragSelectionPreview
        selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
        formatTime={formatTime}
        isOverlapping
      />
    </Slot>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  // color-contrast: text-muted-foreground on plan card background
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          formatTime={formatTime}
        />
      </Slot>
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          formatTime={formatTime}
          isOverlapping
        />
      </Slot>
    </div>
  ),
};
