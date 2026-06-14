import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { StatsPageData } from '../../types/metrics.types';
import { ReviewMetricsGrid } from './ReviewMetricsGrid';

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_PAGE_DATA: StatsPageData = {
  overview: {
    totalMinutes: 2295,
    entryCount: 45,
    totalEntries: 52,
    plannedEntries: 38,
    planRate: 0.73,
  },
  prevOverview: {
    totalMinutes: 1980,
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
    { hour: 9, dow: 1, totalMinutes: 120, entryCount: 5 },
    { hour: 10, dow: 1, totalMinutes: 90, entryCount: 4 },
    { hour: 14, dow: 3, totalMinutes: 60, entryCount: 3 },
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
  },
};

/** ローディング（pageData = undefined） */
export const Loading: Story = {
  args: {
    pageData: undefined,
  },
};
