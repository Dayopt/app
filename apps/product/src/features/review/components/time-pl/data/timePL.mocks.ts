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
  tags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      budgetMinutes: 960,
      actualMinutes: 1020,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 480,
      actualMinutes: 420,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 240,
      actualMinutes: 180,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
      isUncategorized: false,
    },
  ],
  prevTags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      budgetMinutes: 900,
      actualMinutes: 780,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      budgetMinutes: 480,
      actualMinutes: 540,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      budgetMinutes: 240,
      actualMinutes: 120,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      budgetMinutes: 360,
      actualMinutes: 420,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
      isUncategorized: false,
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
  tags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      budgetMinutes: 240,
      actualMinutes: 235,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 120,
      actualMinutes: 115,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 120,
      actualMinutes: 120,
      isPlanned: true,
      isUncategorized: false,
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
  tags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      budgetMinutes: 960,
      actualMinutes: 900,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 480,
      actualMinutes: 540,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 480,
      actualMinutes: 360,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      budgetMinutes: 480,
      actualMinutes: 300,
      isPlanned: true,
      isUncategorized: false,
    },
    {
      tagId: '6',
      tagName: '障害対応',
      tagColor: 'red',
      tagIcon: 'alert-triangle',
      budgetMinutes: 0,
      actualMinutes: 360,
      isPlanned: false,
      isUncategorized: false,
    },
    {
      tagId: '7',
      tagName: '雑務',
      tagColor: 'pink',
      tagIcon: null,
      budgetMinutes: 0,
      actualMinutes: 180,
      isPlanned: false,
      isUncategorized: false,
    },
  ],
};

/** 最小構成: 1タグのみ */
export const MOCK_MINIMAL: TimePLInput = {
  period: {
    granularity: 'day',
    label: '4/8（火）',
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  },
  availableMinutes: 960,
  tags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      budgetMinutes: 120,
      actualMinutes: 110,
      isPlanned: true,
      isUncategorized: false,
    },
  ],
};
