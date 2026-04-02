import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { CalendarEvent } from '../../../../../types/calendar.types';
import { HOUR_HEIGHT } from '../../constants/grid.constants';
import { DayColumn } from './DayColumn';

/**
 * 1日分のグリッド列コンポーネント。
 * エントリ表示・空状態CTA・週末背景色に対応。
 * useEntryInspectorStore / useTagsMap はグローバルプロバイダーで解決済み。
 */
const meta = {
  title: 'Features/Calendar/Views/DayColumn',
  component: DayColumn,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // scrollable-region-focusable: calendar grid scroll container
    a11y: { test: 'todo' },
  },
  args: {
    onTimeClick: fn(),
    onEventClick: fn(),
    onEventContextMenu: fn(),
    hourHeight: HOUR_HEIGHT,
  },
} satisfies Meta<typeof DayColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// 来週の月曜（平日）
const dayOfWeek = today.getDay();
const mondayOffset = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
const nextMonday = new Date(today.getTime() + mondayOffset * 24 * 60 * 60 * 1000);

// 来週の土曜（週末）
const nextSaturday = new Date(nextMonday);
nextSaturday.setDate(nextMonday.getDate() + 5);

function makeDate(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const baseEvent: CalendarEvent = {
  id: 'event-1',
  title: 'チームミーティング',
  startDate: makeDate(today, 10, 0),
  endDate: makeDate(today, 11, 0),
  status: 'open',
  color: 'var(--primary)',
  createdAt: now,
  updatedAt: now,
  displayStartDate: makeDate(today, 10, 0),
  displayEndDate: makeDate(today, 11, 0),
  duration: 60,
  isMultiDay: false,

  origin: 'planned',
};

const mockEvents: CalendarEvent[] = [
  baseEvent,
  {
    ...baseEvent,
    id: 'event-2',
    title: 'ランチ',
    color: 'green',
    startDate: makeDate(today, 12, 0),
    endDate: makeDate(today, 13, 0),
    displayStartDate: makeDate(today, 12, 0),
    displayEndDate: makeDate(today, 13, 0),
  },
  {
    ...baseEvent,
    id: 'event-3',
    title: 'デザインレビュー',
    color: 'amber',
    startDate: makeDate(today, 14, 0),
    endDate: makeDate(today, 15, 30),
    displayStartDate: makeDate(today, 14, 0),
    displayEndDate: makeDate(today, 15, 30),
    duration: 90,
  },
];

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 今日の列（エントリあり）。 */
export const TodayWithEvents: Story = {
  args: {
    date: today,
    events: mockEvents,
    isToday: true,
    isWeekend: false,
  },
  decorators: [
    (Story) => (
      <div className="border-border relative h-[600px] w-48 overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** 空の列（エントリなし）。空状態CTAが中央に表示される。 */
export const Empty: Story = {
  args: {
    date: today,
    events: [],
    isToday: true,
    isWeekend: false,
  },
  decorators: [
    (Story) => (
      <div className="border-border relative h-[600px] w-48 overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** 週末の列（土曜）。背景色が若干異なる。 */
export const Weekend: Story = {
  args: {
    date: nextSaturday,
    events: [],
    isToday: false,
    isWeekend: true,
  },
  decorators: [
    (Story) => (
      <div className="border-border relative h-[600px] w-48 overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** 平日の列（今日以外）。 */
export const Weekday: Story = {
  args: {
    date: nextMonday,
    events: [],
    isToday: false,
    isWeekend: false,
  },
  decorators: [
    (Story) => (
      <div className="border-border relative h-[600px] w-48 overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** コンパクト密度（hourHeight: 48px）。 */
export const Compact: Story = {
  args: {
    date: today,
    events: mockEvents,
    isToday: true,
    isWeekend: false,
    hourHeight: 48,
  },
  decorators: [
    (Story) => (
      <div className="border-border relative h-[400px] w-48 overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    date: today,
    events: mockEvents,
  },
  render: () => (
    <div className="flex items-start gap-4">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">今日（エントリあり）</p>
        <div className="border-border relative h-[500px] w-44 overflow-hidden rounded-lg border">
          <DayColumn
            date={today}
            events={mockEvents}
            isToday={true}
            isWeekend={false}
            hourHeight={HOUR_HEIGHT}
            onTimeClick={fn()}
            onEventClick={fn()}
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">空（今日）</p>
        <div className="border-border relative h-[500px] w-44 overflow-hidden rounded-lg border">
          <DayColumn
            date={today}
            events={[]}
            isToday={true}
            isWeekend={false}
            hourHeight={HOUR_HEIGHT}
            onTimeClick={fn()}
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">週末（空）</p>
        <div className="border-border relative h-[500px] w-44 overflow-hidden rounded-lg border">
          <DayColumn
            date={nextSaturday}
            events={[]}
            isToday={false}
            isWeekend={true}
            hourHeight={HOUR_HEIGHT}
            onTimeClick={fn()}
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">コンパクト（48px）</p>
        <div className="border-border relative h-[500px] w-44 overflow-hidden rounded-lg border">
          <DayColumn
            date={today}
            events={mockEvents}
            isToday={true}
            isWeekend={false}
            hourHeight={48}
            onTimeClick={fn()}
            onEventClick={fn()}
          />
        </div>
      </div>
    </div>
  ),
};
