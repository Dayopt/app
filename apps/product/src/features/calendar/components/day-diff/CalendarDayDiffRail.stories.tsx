import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PRESET_USER_SETTINGS } from '@dayopt/storybook/mocks/presets';

import { computeCalendarDayDiffs } from '../../lib/day-diff';
import type { CalendarEvent } from '../../types/calendar.types';
import { CalendarDayDiffRail } from './CalendarDayDiffRail';

const now = new Date('2026-06-18T23:00:00');
const day = new Date('2026-06-18T00:00:00');

function makeDate(hour: number, minute = 0): Date {
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = makeDate(9);
  const end = makeDate(10);

  return {
    id: 'entry-1',
    title: 'Focus block',
    startDate: start,
    endDate: end,
    plannedStartDate: start,
    plannedEndDate: end,
    actualStartDate: start,
    actualEndDate: end,
    displayStartDate: start,
    displayEndDate: end,
    status: 'closed',
    color: 'var(--tag-blue)',
    tagId: 'tag-work',
    createdAt: start,
    updatedAt: end,
    duration: 60,
    isMultiDay: false,
    origin: 'planned',
    ...overrides,
  };
}

const diffEntries: CalendarEvent[] = [
  event({
    id: 'shifted',
    title: 'Deep work',
    actualStartDate: makeDate(9, 20),
    actualEndDate: makeDate(10, 20),
  }),
  event({
    id: 'resized',
    title: 'Planning',
    startDate: makeDate(11),
    endDate: makeDate(12),
    plannedStartDate: makeDate(11),
    plannedEndDate: makeDate(12),
    actualStartDate: makeDate(11),
    actualEndDate: makeDate(12, 30),
    displayStartDate: makeDate(11),
    displayEndDate: makeDate(12),
    tagId: 'tag-admin',
    color: 'var(--tag-amber)',
  }),
  event({
    id: 'unplanned',
    title: 'Unexpected call',
    origin: 'unplanned',
    startDate: makeDate(13),
    endDate: makeDate(13, 40),
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: makeDate(13),
    actualEndDate: makeDate(13, 40),
    displayStartDate: makeDate(13),
    displayEndDate: makeDate(13, 40),
    tagId: 'tag-admin',
    color: 'var(--tag-amber)',
  }),
  event({
    id: 'missed',
    title: 'Email batch',
    startDate: makeDate(15),
    endDate: makeDate(15, 30),
    plannedStartDate: makeDate(15),
    plannedEndDate: makeDate(15, 30),
    actualStartDate: null,
    actualEndDate: null,
    displayStartDate: makeDate(15),
    displayEndDate: makeDate(15, 30),
    isSkipped: true,
    tagId: 'tag-admin',
    color: 'var(--tag-amber)',
  }),
];

const noDiffEntries = [
  event({
    id: 'same',
    title: 'As planned',
  }),
];

const tags = [
  { id: 'tag-work', name: 'Work', color: 'blue', icon: null, sort_order: 0 },
  { id: 'tag-admin', name: 'Admin', color: 'amber', icon: null, sort_order: 1 },
];

const meta = {
  title: 'Features/Calendar/DayDiff/CalendarDayDiffRail',
  component: CalendarDayDiffRail,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    trpcMocks: {
      'userSettings.get': PRESET_USER_SETTINGS.default,
      'tags.list': tags,
    },
  },
} satisfies Meta<typeof CalendarDayDiffRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 差分一覧。 */
export const Default: Story = {
  args: {
    diff: computeCalendarDayDiffs(diffEntries, now),
    entries: diffEntries,
    onEntryClick: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** 差分なし。 */
export const Empty: Story = {
  args: {
    diff: computeCalendarDayDiffs(noDiffEntries, now),
    entries: noDiffEntries,
    onEntryClick: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    diff: computeCalendarDayDiffs(diffEntries, now),
    entries: diffEntries,
    onEntryClick: fn(),
  },
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <CalendarDayDiffRail
        diff={computeCalendarDayDiffs(diffEntries, now)}
        entries={diffEntries}
        onEntryClick={fn()}
        onClose={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
      <CalendarDayDiffRail
        diff={computeCalendarDayDiffs(noDiffEntries, now)}
        entries={noDiffEntries}
        onEntryClick={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
    </div>
  ),
};
