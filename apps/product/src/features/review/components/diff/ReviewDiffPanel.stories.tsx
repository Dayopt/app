import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PRESET_USER_SETTINGS } from '@dayopt/storybook/mocks/presets';

import type { ReviewDiffItem, ReviewDiffResult } from './ReviewDiffPanel';
import { ReviewDiffPanel } from './ReviewDiffPanel';

const day = new Date('2026-06-18T00:00:00');

function makeDate(hour: number, minute = 0): Date {
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function item(overrides: Partial<ReviewDiffItem> = {}): ReviewDiffItem {
  const plannedStart = makeDate(9);
  const plannedEnd = makeDate(10);
  const actualStart = makeDate(9, 20);
  const actualEnd = makeDate(10, 20);

  return {
    id: 'shifted:entry-1',
    timeblockId: 'entry-1',
    kind: 'shifted',
    title: 'Deep work',
    tagId: 'tag-work',
    color: 'var(--tag-blue)',
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    plannedMinutes: 60,
    actualMinutes: 60,
    diffMinutes: 0,
    startDiffMinutes: 20,
    endDiffMinutes: 20,
    sortTime: actualStart.getTime(),
    ...overrides,
  };
}

const diff: ReviewDiffResult = {
  summary: {
    plannedMinutes: 150,
    actualMinutes: 190,
    diffMinutes: 40,
    unplannedMinutes: 40,
    missedMinutes: 30,
  },
  items: [
    item(),
    item({
      id: 'resized:entry-2',
      timeblockId: 'entry-2',
      kind: 'resized',
      title: 'Planning',
      tagId: 'tag-admin',
      color: 'var(--tag-amber)',
      plannedStart: makeDate(11),
      plannedEnd: makeDate(12),
      actualStart: makeDate(11),
      actualEnd: makeDate(12, 30),
      plannedMinutes: 60,
      actualMinutes: 90,
      diffMinutes: 30,
      startDiffMinutes: 0,
      endDiffMinutes: 30,
      sortTime: makeDate(11).getTime(),
    }),
    item({
      id: 'unplanned:entry-3',
      timeblockId: 'entry-3',
      kind: 'unplanned',
      title: 'Unexpected call',
      tagId: 'tag-admin',
      color: 'var(--tag-amber)',
      plannedStart: null,
      plannedEnd: null,
      actualStart: makeDate(13),
      actualEnd: makeDate(13, 40),
      plannedMinutes: 0,
      actualMinutes: 40,
      diffMinutes: 40,
      startDiffMinutes: 0,
      endDiffMinutes: 0,
      sortTime: makeDate(13).getTime(),
    }),
    item({
      id: 'missed:entry-4',
      timeblockId: 'entry-4',
      kind: 'missed',
      title: 'Email batch',
      tagId: 'tag-admin',
      color: 'var(--tag-amber)',
      plannedStart: makeDate(15),
      plannedEnd: makeDate(15, 30),
      actualStart: null,
      actualEnd: null,
      plannedMinutes: 30,
      actualMinutes: 0,
      diffMinutes: -30,
      startDiffMinutes: 0,
      endDiffMinutes: 0,
      sortTime: makeDate(15).getTime(),
    }),
  ],
};

const balancedDiff: ReviewDiffResult = {
  summary: {
    plannedMinutes: 90,
    actualMinutes: 90,
    diffMinutes: 0,
    unplannedMinutes: 0,
    missedMinutes: 30,
  },
  items: [
    item({
      id: 'recorded:entry-balanced-over',
      timeblockId: 'entry-balanced-over',
      kind: 'recorded',
      title: 'Planning',
      tagId: 'tag-admin',
      color: 'var(--tag-amber)',
      plannedStart: makeDate(11),
      plannedEnd: makeDate(12),
      actualStart: makeDate(11),
      actualEnd: makeDate(12, 30),
      plannedMinutes: 60,
      actualMinutes: 90,
      diffMinutes: 30,
      startDiffMinutes: 0,
      endDiffMinutes: 30,
      sortTime: makeDate(11).getTime(),
    }),
    item({
      id: 'missed:entry-balanced-under',
      timeblockId: 'entry-balanced-under',
      kind: 'missed',
      title: 'Email batch',
      tagId: 'tag-admin',
      color: 'var(--tag-amber)',
      plannedStart: makeDate(15),
      plannedEnd: makeDate(15, 30),
      actualStart: null,
      actualEnd: null,
      plannedMinutes: 30,
      actualMinutes: 0,
      diffMinutes: -30,
      startDiffMinutes: 0,
      endDiffMinutes: 0,
      sortTime: makeDate(15).getTime(),
    }),
  ],
};

const emptyDiff: ReviewDiffResult = {
  summary: {
    plannedMinutes: 60,
    actualMinutes: 60,
    diffMinutes: 0,
    unplannedMinutes: 0,
    missedMinutes: 0,
  },
  items: [],
};

const tags = [
  { id: 'tag-work', name: 'Work', color: 'blue', icon: null, sort_order: 0 },
  { id: 'tag-admin', name: 'Admin', color: 'amber', icon: null, sort_order: 1 },
];

const meta = {
  title: 'Product/Features/Review/Diff/ReviewDiffPanel',
  component: ReviewDiffPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    trpcMocks: {
      'userSettings.get': PRESET_USER_SETTINGS.default,
      'tags.list': tags,
    },
  },
} satisfies Meta<typeof ReviewDiffPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 差分一覧。 */
export const Default: Story = {
  args: {
    diff,
    onItemClick: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** 正負の差分が相殺された状態。 */
export const Balanced: Story = {
  args: {
    diff: balancedDiff,
    onItemClick: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** 差分なし。 */
export const Empty: Story = {
  args: {
    diff: emptyDiff,
    onItemClick: fn(),
    onClose: fn(),
    className: 'border-border-subtle h-96 w-64 border',
  },
};

/** モバイルボトムシート。 */
export const MobileSheet: Story = {
  args: {
    diff: emptyDiff,
    onItemClick: fn(),
    onClose: fn(),
    variant: 'sheet',
  },
  render: (args) => (
    <div className="bg-card border-border-subtle shadow-card w-80 rounded-2xl border">
      <ReviewDiffPanel {...args} />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    diff,
    onItemClick: fn(),
  },
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <ReviewDiffPanel
        diff={diff}
        onItemClick={fn()}
        onClose={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
      <ReviewDiffPanel
        diff={balancedDiff}
        onItemClick={fn()}
        onClose={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
      <ReviewDiffPanel
        diff={emptyDiff}
        onItemClick={fn()}
        className="border-border-subtle h-96 w-64 border"
      />
      <div className="bg-card border-border-subtle shadow-card w-80 rounded-2xl border">
        <ReviewDiffPanel diff={emptyDiff} onItemClick={fn()} onClose={fn()} variant="sheet" />
      </div>
    </div>
  ),
};
