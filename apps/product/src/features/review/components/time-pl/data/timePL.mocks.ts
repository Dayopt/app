/**
 * Time P/L — 統一モックデータ
 *
 * TimePLInput 1型のみ。全ビューの表示データは derivers で算出される。
 */

import type { TimePLInput } from '@/features/review/domain/timePL/types';

/** 週次: 標準的な週（良好精度、前期比あり） */
export const MOCK_WEEK_GOOD: TimePLInput = {
  period: {
    granularity: 'week',
    label: '4/1（月）– 4/7（日）',
    startDate: '2026-04-01',
    endDate: '2026-04-07',
  },
  availableMinutes: 6720, // 16h × 7
  activities: [
    {
      activityId: '1',
      activityName: 'Deep Work',
      categoryColor: 'blue',
      categoryIcon: 'brain',
      budgetMinutes: 960,
      actualMinutes: 1020,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '2',
      activityName: 'Meeting',
      categoryColor: 'amber',
      categoryIcon: 'users',
      budgetMinutes: 480,
      actualMinutes: 420,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '3',
      activityName: 'Learning',
      categoryColor: 'green',
      categoryIcon: 'book-open',
      budgetMinutes: 240,
      actualMinutes: 180,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '4',
      activityName: 'Admin',
      categoryColor: 'gray',
      categoryIcon: 'folder',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '5',
      activityName: 'Exercise',
      categoryColor: 'teal',
      categoryIcon: 'heart-pulse',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
      isNoActivity: false,
    },
  ],
  prevActivities: [
    {
      activityId: '1',
      activityName: 'Deep Work',
      categoryColor: 'blue',
      budgetMinutes: 900,
      actualMinutes: 780,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '2',
      activityName: 'Meeting',
      categoryColor: 'amber',
      budgetMinutes: 480,
      actualMinutes: 540,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '3',
      activityName: 'Learning',
      categoryColor: 'green',
      budgetMinutes: 240,
      actualMinutes: 120,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '4',
      activityName: 'Admin',
      categoryColor: 'gray',
      budgetMinutes: 360,
      actualMinutes: 420,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '5',
      activityName: 'Exercise',
      categoryColor: 'teal',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
      isNoActivity: false,
    },
  ],
};

/** 日次: 高精度 */
export const MOCK_DAY_EXCELLENT: TimePLInput = {
  period: {
    granularity: 'day',
    label: '4/8（火）',
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  },
  availableMinutes: 960,
  activities: [
    {
      activityId: '1',
      activityName: 'Deep Work',
      categoryColor: 'blue',
      categoryIcon: 'brain',
      budgetMinutes: 240,
      actualMinutes: 235,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '2',
      activityName: 'Meeting',
      categoryColor: 'amber',
      categoryIcon: 'users',
      budgetMinutes: 120,
      actualMinutes: 115,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '3',
      activityName: 'Learning',
      categoryColor: 'green',
      categoryIcon: 'book-open',
      budgetMinutes: 120,
      actualMinutes: 120,
      isPlanned: true,
      isNoActivity: false,
    },
  ],
};

/** 計画外Timeblock含む */
export const MOCK_WITH_UNPLANNED: TimePLInput = {
  period: {
    granularity: 'week',
    label: '3/25（月）– 3/31（日）',
    startDate: '2026-03-25',
    endDate: '2026-03-31',
  },
  availableMinutes: 6720,
  activities: [
    {
      activityId: '1',
      activityName: 'Deep Work',
      categoryColor: 'blue',
      categoryIcon: 'brain',
      budgetMinutes: 960,
      actualMinutes: 900,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '2',
      activityName: 'Meeting',
      categoryColor: 'amber',
      categoryIcon: 'users',
      budgetMinutes: 480,
      actualMinutes: 540,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '3',
      activityName: 'Learning',
      categoryColor: 'green',
      categoryIcon: 'book-open',
      budgetMinutes: 480,
      actualMinutes: 360,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '4',
      activityName: 'Admin',
      categoryColor: 'gray',
      categoryIcon: 'folder',
      budgetMinutes: 480,
      actualMinutes: 300,
      isPlanned: true,
      isNoActivity: false,
    },
    {
      activityId: '6',
      activityName: '障害対応',
      categoryColor: 'red',
      categoryIcon: 'alert-triangle',
      budgetMinutes: 0,
      actualMinutes: 360,
      isPlanned: false,
      isNoActivity: false,
    },
    {
      activityId: '7',
      activityName: '雑務',
      categoryColor: 'pink',
      categoryIcon: null,
      budgetMinutes: 0,
      actualMinutes: 180,
      isPlanned: false,
      isNoActivity: false,
    },
  ],
};

/** 最小構成: 1アクティビティのみ */
export const MOCK_MINIMAL: TimePLInput = {
  period: {
    granularity: 'day',
    label: '4/8（火）',
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  },
  availableMinutes: 960,
  activities: [
    {
      activityId: '1',
      activityName: 'Deep Work',
      categoryColor: 'blue',
      categoryIcon: 'brain',
      budgetMinutes: 120,
      actualMinutes: 110,
      isPlanned: true,
      isNoActivity: false,
    },
  ],
};
