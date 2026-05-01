import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { StatsPageData } from '../../types/metrics.types';
import { ReviewMetricsGrid } from './ReviewMetricsGrid';

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_PAGE_DATA: StatsPageData = {
  overview: {
    totalMinutes: 2295,
    avgFulfillment: 3.2,
    entryCount: 45,
    totalEntries: 52,
    plannedEntries: 38,
    planRate: 0.73,
  },
  prevOverview: {
    totalMinutes: 1980,
    avgFulfillment: 2.9,
    entryCount: 40,
    totalEntries: 48,
    plannedEntries: 32,
    planRate: 0.67,
  },
  contextSwitches: { totalSwitches: 35, avgPerDay: 5.0 },
  blankRate: { availableMinutes: 4800, scheduledMinutes: 2295, blankRate: 0.52 },
  timeByTag: [],
  hourly: [],
  dow: [],
  energyMap: [
    { hour: 9, dow: 1, avgFulfillment: 3.5, totalMinutes: 120, entryCount: 5 },
    { hour: 10, dow: 1, avgFulfillment: 3.0, totalMinutes: 90, entryCount: 4 },
    { hour: 14, dow: 3, avgFulfillment: 2.8, totalMinutes: 60, entryCount: 3 },
  ],
  estimationAccuracy: [
    {
      tagId: '1',
      tagName: 'Work',
      tagColor: 'blue',
      avgPlannedMinutes: 60,
      avgActualMinutes: 72,
      avgDeviationMinutes: 12,
      entryCount: 20,
    },
  ],
  prevEstimationAccuracy: [
    {
      tagId: '1',
      tagName: 'Work',
      tagColor: 'blue',
      avgPlannedMinutes: 60,
      avgActualMinutes: 78,
      avgDeviationMinutes: 18,
      entryCount: 15,
    },
  ],
  prevEnergyMap: [],
  dailyHours: [],
  monthlyTrend: [],
};

const DATE_RANGE = {
  startDate: '2026-03-24T15:00:00.000Z',
  endDate: '2026-03-31T14:59:59.999Z',
};

const PREV_DATE_RANGE = {
  startDate: '2026-03-17T15:00:00.000Z',
  endDate: '2026-03-24T14:59:59.999Z',
};

// =============================================================================
// Meta
// =============================================================================

/** ReviewMetricsGrid — KPIメトリクスをグリッド表示 */
const meta = {
  title: 'Features/Stats/Review/MetricsGrid',
  component: ReviewMetricsGrid,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'entries.getStreak': { streak: 14 } },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReviewMetricsGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 全メトリクス表示 */
export const WithData: Story = {
  args: {
    pageData: MOCK_PAGE_DATA,
    dateRange: DATE_RANGE,
    prevDateRange: PREV_DATE_RANGE,
  },
};

/** ローディング（pageData = undefined） */
export const Loading: Story = {
  args: {
    pageData: undefined,
    dateRange: DATE_RANGE,
    prevDateRange: PREV_DATE_RANGE,
  },
};
