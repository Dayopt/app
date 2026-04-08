/**
 * Time P/L Statement Mock Data
 *
 * Storybook用のモックデータ
 */

import type { TimePLData } from './timePL.types';

/** 週次・良好精度（デフォルト） */
export const MOCK_PL_WEEK_GOOD: TimePLData = {
  period: {
    granularity: 'week',
    label: '4/1（月）– 4/7（日）',
    startDate: '2026-04-01',
    endDate: '2026-04-07',
  },
  budget: {
    label: '予算 (Budget)',
    totalMinutes: 2400,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 960,
        percentage: 40,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 480,
        percentage: 20,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 240,
        percentage: 10,
      },
      {
        tagId: '4',
        tagName: 'Admin',
        tagColor: 'gray',
        tagIcon: 'folder',
        minutes: 360,
        percentage: 15,
      },
      {
        tagId: '5',
        tagName: 'Exercise',
        tagColor: 'teal',
        tagIcon: 'heart-pulse',
        minutes: 360,
        percentage: 15,
      },
    ],
  },
  actual: {
    label: '実績 (Actual)',
    totalMinutes: 2220,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 1020,
        percentage: 46,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 420,
        percentage: 19,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 180,
        percentage: 8,
      },
      {
        tagId: '4',
        tagName: 'Admin',
        tagColor: 'gray',
        tagIcon: 'folder',
        minutes: 300,
        percentage: 14,
      },
      {
        tagId: '5',
        tagName: 'Exercise',
        tagColor: 'teal',
        tagIcon: 'heart-pulse',
        minutes: 300,
        percentage: 14,
      },
    ],
  },
  varianceRows: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      varianceMinutes: -60,
      variancePercent: -6,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      varianceMinutes: 60,
      variancePercent: 13,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      varianceMinutes: 60,
      variancePercent: 25,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      varianceMinutes: 60,
      variancePercent: 17,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      varianceMinutes: 60,
      variancePercent: 17,
    },
  ],
  netVarianceMinutes: 180,
  accuracyRate: 0.925,
  accuracyStatus: 'good',
  prevAccuracyRate: 0.88,
};

/** 日次・高精度 */
export const MOCK_PL_DAY_EXCELLENT: TimePLData = {
  period: {
    granularity: 'day',
    label: '4/8（火）',
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  },
  budget: {
    label: '予算 (Budget)',
    totalMinutes: 480,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 240,
        percentage: 50,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 120,
        percentage: 25,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 120,
        percentage: 25,
      },
    ],
  },
  actual: {
    label: '実績 (Actual)',
    totalMinutes: 470,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 235,
        percentage: 50,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 115,
        percentage: 24,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 120,
        percentage: 26,
      },
    ],
  },
  varianceRows: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      varianceMinutes: 5,
      variancePercent: 2,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      varianceMinutes: 5,
      variancePercent: 4,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      varianceMinutes: 0,
      variancePercent: 0,
    },
  ],
  netVarianceMinutes: 10,
  accuracyRate: 0.979,
  accuracyStatus: 'excellent',
};

/** 月次・低精度 */
export const MOCK_PL_MONTH_POOR: TimePLData = {
  period: {
    granularity: 'month',
    label: '2026年3月',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
  },
  budget: {
    label: '予算 (Budget)',
    totalMinutes: 9600,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 3840,
        percentage: 40,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 1920,
        percentage: 20,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 1440,
        percentage: 15,
      },
      {
        tagId: '4',
        tagName: 'Admin',
        tagColor: 'gray',
        tagIcon: 'folder',
        minutes: 1440,
        percentage: 15,
      },
      {
        tagId: '5',
        tagName: 'Exercise',
        tagColor: 'teal',
        tagIcon: 'heart-pulse',
        minutes: 960,
        percentage: 10,
      },
    ],
  },
  actual: {
    label: '実績 (Actual)',
    totalMinutes: 6240,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 2400,
        percentage: 38,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 1680,
        percentage: 27,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 480,
        percentage: 8,
      },
      {
        tagId: '4',
        tagName: 'Admin',
        tagColor: 'gray',
        tagIcon: 'folder',
        minutes: 1200,
        percentage: 19,
      },
      {
        tagId: '5',
        tagName: 'Exercise',
        tagColor: 'teal',
        tagIcon: 'heart-pulse',
        minutes: 480,
        percentage: 8,
      },
    ],
  },
  varianceRows: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      varianceMinutes: 1440,
      variancePercent: 38,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      varianceMinutes: 240,
      variancePercent: 13,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      varianceMinutes: 960,
      variancePercent: 67,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      varianceMinutes: 240,
      variancePercent: 17,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      varianceMinutes: 480,
      variancePercent: 50,
    },
  ],
  netVarianceMinutes: 3360,
  accuracyRate: 0.65,
  accuracyStatus: 'poor',
  prevAccuracyRate: 0.78,
};

/** 最小構成: 1タグのみ */
export const MOCK_PL_MINIMAL: TimePLData = {
  period: {
    granularity: 'day',
    label: '4/8（火）',
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  },
  budget: {
    label: '予算 (Budget)',
    totalMinutes: 120,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 120,
        percentage: 100,
      },
    ],
  },
  actual: {
    label: '実績 (Actual)',
    totalMinutes: 110,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 110,
        percentage: 100,
      },
    ],
  },
  varianceRows: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      varianceMinutes: 10,
      variancePercent: 8,
    },
  ],
  netVarianceMinutes: 10,
  accuracyRate: 0.917,
  accuracyStatus: 'good',
};

/** 計画外エントリー含む */
export const MOCK_PL_WITH_UNPLANNED: TimePLData = {
  period: {
    granularity: 'week',
    label: '3/25（月）– 3/31（日）',
    startDate: '2026-03-25',
    endDate: '2026-03-31',
  },
  budget: {
    label: '予算 (Budget)',
    totalMinutes: 2400,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 960,
        percentage: 40,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 480,
        percentage: 20,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 480,
        percentage: 20,
      },
      {
        tagId: '4',
        tagName: 'Admin',
        tagColor: 'gray',
        tagIcon: 'folder',
        minutes: 480,
        percentage: 20,
      },
    ],
  },
  actual: {
    label: '実績 (Actual)',
    totalMinutes: 2640,
    rows: [
      {
        tagId: '1',
        tagName: 'Deep Work',
        tagColor: 'blue',
        tagIcon: 'brain',
        minutes: 900,
        percentage: 34,
      },
      {
        tagId: '2',
        tagName: 'Meeting',
        tagColor: 'amber',
        tagIcon: 'users',
        minutes: 540,
        percentage: 20,
      },
      {
        tagId: '6',
        tagName: '障害対応',
        tagColor: 'red',
        tagIcon: 'alert-triangle',
        minutes: 360,
        percentage: 14,
      },
      {
        tagId: '3',
        tagName: 'Learning',
        tagColor: 'green',
        tagIcon: 'book-open',
        minutes: 360,
        percentage: 14,
      },
      {
        tagId: '4',
        tagName: 'Admin',
        tagColor: 'gray',
        tagIcon: 'folder',
        minutes: 300,
        percentage: 11,
      },
      { tagId: '7', tagName: '雑務', tagColor: 'pink', tagIcon: null, minutes: 180, percentage: 7 },
    ],
  },
  varianceRows: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      varianceMinutes: 60,
      variancePercent: 6,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      varianceMinutes: -60,
      variancePercent: -13,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      varianceMinutes: 120,
      variancePercent: 25,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      varianceMinutes: 180,
      variancePercent: 38,
    },
    {
      tagId: '6',
      tagName: '障害対応',
      tagColor: 'red',
      tagIcon: 'alert-triangle',
      varianceMinutes: -360,
      variancePercent: null,
    },
    {
      tagId: '7',
      tagName: '雑務',
      tagColor: 'pink',
      tagIcon: null,
      varianceMinutes: -180,
      variancePercent: null,
    },
  ],
  netVarianceMinutes: -240,
  accuracyRate: 0.9,
  accuracyStatus: 'good',
  prevAccuracyRate: 0.92,
};

/** 高精度（Excellent） */
export const MOCK_PL_HIGH_ACCURACY: TimePLData = {
  ...MOCK_PL_DAY_EXCELLENT,
};

/** 低精度（Poor） */
export const MOCK_PL_LOW_ACCURACY: TimePLData = {
  ...MOCK_PL_MONTH_POOR,
};
