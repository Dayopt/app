import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { deriveBarComparison } from '../../domain/timePL/derivers';
import { MOCK_WEEK_GOOD, MOCK_WITH_UNPLANNED } from '../time-pl/data/timePL.mocks';
import { WeeklyReflectionPanel } from './WeeklyReflectionPanel';

const timePLRows = deriveBarComparison(MOCK_WEEK_GOOD);
const unplannedTimePLRows = deriveBarComparison(MOCK_WITH_UNPLANNED);

const estimationRows = [
  {
    tagId: '1',
    tagName: 'Deep Work',
    tagColor: 'blue',
    isUncategorized: false,
    avgPlannedMinutes: 120,
    avgActualMinutes: 148,
    avgDeviationMinutes: 28,
    recordCount: 5,
  },
  {
    tagId: '2',
    tagName: 'Meeting',
    tagColor: 'amber',
    isUncategorized: false,
    avgPlannedMinutes: 60,
    avgActualMinutes: 48,
    avgDeviationMinutes: -12,
    recordCount: 7,
  },
  {
    tagId: '3',
    tagName: 'Learning',
    tagColor: 'green',
    isUncategorized: false,
    avgPlannedMinutes: 80,
    avgActualMinutes: 65,
    avgDeviationMinutes: -15,
    recordCount: 3,
  },
  {
    tagId: null,
    tagName: null,
    tagColor: null,
    isUncategorized: true,
    avgPlannedMinutes: 90,
    avgActualMinutes: 108,
    avgDeviationMinutes: 18,
    recordCount: 4,
  },
];

const meta = {
  title: 'Product/Features/Review/Reflection/WeeklyReflectionPanel',
  component: WeeklyReflectionPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof WeeklyReflectionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Calendar の表示範囲に対応する Review。 */
export const Default: Story = {
  args: {
    trackedMinutes: 2220,
    planAccuracyRate: 0.9,
    confirmedRate: 0.62,
    plannedMinutes: 2400,
    diffMinutes: -180,
    timePLRows,
    estimationRows,
    skipSummary: {
      skippedCount: 3,
      skippedMinutes: 150,
      topTagName: 'Admin',
    },
    blankSummary: {
      availableMinutes: 6720,
      scheduledMinutes: 3120,
      blankRate: 0.54,
    },
    onTagClick: fn(),
  },
  render: (args) => (
    <div className="border-border-subtle w-64 border p-4">
      <WeeklyReflectionPanel {...args} />
    </div>
  ),
};

/** スキップがなく、空白だけが目立つ週。 */
export const BlankHeavy: Story = {
  args: {
    trackedMinutes: 1620,
    planAccuracyRate: 0.82,
    confirmedRate: 0.7,
    plannedMinutes: 1980,
    diffMinutes: 360,
    timePLRows: unplannedTimePLRows,
    estimationRows: estimationRows.slice(1),
    skipSummary: {
      skippedCount: 0,
      skippedMinutes: 0,
    },
    blankSummary: {
      availableMinutes: 6720,
      scheduledMinutes: 2100,
      blankRate: 0.69,
    },
    onTagClick: fn(),
  },
  render: (args) => (
    <div className="border-border-subtle w-64 border p-4">
      <WeeklyReflectionPanel {...args} />
    </div>
  ),
};

/** 接続前データを含む最小状態。 */
export const MinimalData: Story = {
  args: {
    trackedMinutes: 420,
    planAccuracyRate: null,
    plannedMinutes: 480,
    diffMinutes: 60,
    timePLRows: [],
    estimationRows: [],
    blankSummary: null,
    skipSummary: null,
  },
  render: (args) => (
    <div className="border-border-subtle w-64 border p-4">
      <WeeklyReflectionPanel {...args} />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    trackedMinutes: 2220,
    planAccuracyRate: 0.9,
    plannedMinutes: 2400,
    diffMinutes: -180,
    timePLRows,
  },
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <div className="border-border-subtle w-64 border p-4">
        <WeeklyReflectionPanel
          trackedMinutes={2220}
          planAccuracyRate={0.9}
          confirmedRate={0.62}
          plannedMinutes={2400}
          diffMinutes={-180}
          timePLRows={timePLRows}
          estimationRows={estimationRows}
          skipSummary={{
            skippedCount: 3,
            skippedMinutes: 150,
            topTagName: 'Admin',
          }}
          blankSummary={{
            availableMinutes: 6720,
            scheduledMinutes: 3120,
            blankRate: 0.54,
          }}
          onTagClick={fn()}
        />
      </div>
      <div className="border-border-subtle w-64 border p-4">
        <WeeklyReflectionPanel
          trackedMinutes={1620}
          planAccuracyRate={0.82}
          confirmedRate={0.7}
          plannedMinutes={1980}
          diffMinutes={360}
          timePLRows={unplannedTimePLRows}
          estimationRows={estimationRows.slice(1)}
          skipSummary={{
            skippedCount: 0,
            skippedMinutes: 0,
          }}
          blankSummary={{
            availableMinutes: 6720,
            scheduledMinutes: 2100,
            blankRate: 0.69,
          }}
          onTagClick={fn()}
        />
      </div>
      <div className="border-border-subtle w-64 border p-4">
        <WeeklyReflectionPanel
          trackedMinutes={420}
          planAccuracyRate={null}
          plannedMinutes={480}
          diffMinutes={60}
          timePLRows={[]}
          estimationRows={[]}
          blankSummary={null}
          skipSummary={null}
        />
      </div>
    </div>
  ),
};
