import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { StatsPageData } from '../../types/metrics.types';
import { MOCK_WEEK_GOOD } from '../time-pl/data/timePL.mocks';
import { CalendarReviewPanel } from './CalendarReviewPanel';

const noop = () => {};

const MOCK_PAGE_DATA: StatsPageData = {
  overview: {
    totalMinutes: 2220,
    entryCount: 38,
    totalEntries: 44,
    plannedEntries: 35,
    planRate: 0.8,
  },
  prevOverview: {
    totalMinutes: 1980,
    entryCount: 33,
    totalEntries: 40,
    plannedEntries: 30,
    planRate: 0.75,
  },
  contextSwitches: { totalSwitches: 28, avgPerDay: 4 },
  blankRate: { availableMinutes: 6720, scheduledMinutes: 2220, blankRate: 0.67 },
  timeByTag: [],
  hourly: [],
  dow: [],
  energyMap: [],
  estimationAccuracy: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      avgPlannedMinutes: 120,
      avgActualMinutes: 148,
      avgDeviationMinutes: 28,
      entryCount: 5,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      avgPlannedMinutes: 60,
      avgActualMinutes: 48,
      avgDeviationMinutes: -12,
      entryCount: 7,
    },
  ],
  prevEstimationAccuracy: [],
  prevEnergyMap: [],
  dailyHours: [],
  monthlyTrend: [],
};

const MOCK_TIME_PL_RESPONSE = {
  tags: MOCK_WEEK_GOOD.tags,
  prevTags: MOCK_WEEK_GOOD.prevTags ?? [],
  availableMinutes: MOCK_WEEK_GOOD.availableMinutes,
};

const meta = {
  title: 'Product/Features/Review/Reflection/CalendarReviewPanel',
  component: CalendarReviewPanel,
  parameters: {
    layout: 'padded',
    trpcMocks: {
      'entries.getStatsPageData': MOCK_PAGE_DATA,
      'entries.getTimePL': MOCK_TIME_PL_RESPONSE,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CalendarReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Calendar panel slot に表示される週次 Review。 */
export const Default: Story = {
  args: {
    currentDate: new Date(2026, 3, 1),
    selectedTagId: null,
    onSelectedTagIdChange: noop,
    onClose: noop,
    className: 'border-border-subtle h-[560px] w-80 border',
  },
};

/** `reviewTagId` がある状態。 */
export const TagSelected: Story = {
  args: {
    currentDate: new Date(2026, 3, 1),
    selectedTagId: '1',
    onSelectedTagIdChange: noop,
    onClose: noop,
    className: 'border-border-subtle h-[560px] w-80 border',
  },
};

/** モバイル bottom sheet 内で表示される状態。 */
export const MobileSheet: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  args: {
    currentDate: new Date(2026, 3, 1),
    selectedTagId: null,
    onSelectedTagIdChange: noop,
    onClose: noop,
    variant: 'sheet',
    className: 'w-full',
  },
};

/** データ取得中。 */
export const Loading: Story = {
  args: {
    currentDate: new Date(2026, 3, 1),
    selectedTagId: null,
    onSelectedTagIdChange: noop,
    onClose: noop,
    className: 'border-border-subtle h-[560px] w-80 border',
  },
  parameters: { trpcPending: true },
};

/** データ取得エラー。 */
export const Error: Story = {
  args: {
    currentDate: new Date(2026, 3, 1),
    selectedTagId: null,
    onSelectedTagIdChange: noop,
    onClose: noop,
    className: 'border-border-subtle h-[560px] w-80 border',
  },
  parameters: {
    trpcError: { path: 'entries.getStatsPageData', code: 'INTERNAL_SERVER_ERROR' },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    currentDate: new Date(2026, 3, 1),
    selectedTagId: null,
    onSelectedTagIdChange: noop,
    onClose: noop,
  },
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <CalendarReviewPanel
        currentDate={new Date(2026, 3, 1)}
        selectedTagId={null}
        onSelectedTagIdChange={noop}
        onClose={noop}
        className="border-border-subtle h-[560px] w-80 border"
      />
      <CalendarReviewPanel
        currentDate={new Date(2026, 3, 1)}
        selectedTagId="1"
        onSelectedTagIdChange={noop}
        onClose={noop}
        className="border-border-subtle h-[560px] w-80 border"
      />
      <CalendarReviewPanel
        currentDate={new Date(2026, 3, 1)}
        selectedTagId={null}
        onSelectedTagIdChange={noop}
        onClose={noop}
        variant="sheet"
        className="w-80"
      />
    </div>
  ),
};
