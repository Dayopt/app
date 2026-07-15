import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DragSelectionPreview } from './CalendarDragSelection/DragSelectionPreview';

/** ドラッグ選択プレビュー。グリッド上の時間範囲選択UI。 */
const meta = {
  title: 'Product/Features/Calendar/Interaction/DragSelectionPreview',
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

/** 未来時間に作るPlanのプレビュー。 */
export const FuturePlan: Story = {
  render: () => (
    <Slot>
      <DragSelectionPreview
        selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
        date={new Date('2099-01-01T00:00:00')}
        formatTime={formatTime}
      />
    </Slot>
  ),
};

/** 過去時間に作るRecordのプレビュー。 */
export const PastRecord: Story = {
  render: () => (
    <Slot>
      <DragSelectionPreview
        selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
        date={new Date('2000-01-01T00:00:00')}
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
        date={new Date('2099-01-01T00:00:00')}
        formatTime={formatTime}
        isOverlapping
      />
    </Slot>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          date={new Date('2099-01-01T00:00:00')}
          formatTime={formatTime}
        />
      </Slot>
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          date={new Date('2000-01-01T00:00:00')}
          formatTime={formatTime}
        />
      </Slot>
      <Slot>
        <DragSelectionPreview
          selection={{ startHour: 0, startMinute: 0, endHour: 1, endMinute: 0 }}
          date={new Date('2099-01-01T00:00:00')}
          formatTime={formatTime}
          isOverlapping
        />
      </Slot>
    </div>
  ),
};
