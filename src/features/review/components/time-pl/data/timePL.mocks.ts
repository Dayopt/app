/**
 * Time P/L — 統一モックデータ
 *
 * TimePLInput 1型のみ。全ビューの表示データは derivers で算出される。
 */

import type { TimePLInput } from './timePL.types';

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
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 480,
      actualMinutes: 420,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 240,
      actualMinutes: 180,
      isPlanned: true,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
    },
  ],
  dailyPoints: [
    { label: '月', budgetMinutes: 480, actualMinutes: 360 },
    { label: '火', budgetMinutes: 480, actualMinutes: 420 },
    { label: '水', budgetMinutes: 480, actualMinutes: 540 },
    { label: '木', budgetMinutes: 480, actualMinutes: 540 },
    { label: '金', budgetMinutes: 480, actualMinutes: 510 },
    { label: '土', budgetMinutes: 120, actualMinutes: 180 },
    { label: '日', budgetMinutes: 60, actualMinutes: 90 },
  ],
  prevTags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      budgetMinutes: 900,
      actualMinutes: 780,
      isPlanned: true,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      budgetMinutes: 480,
      actualMinutes: 540,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      budgetMinutes: 240,
      actualMinutes: 120,
      isPlanned: true,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      budgetMinutes: 360,
      actualMinutes: 420,
      isPlanned: true,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      budgetMinutes: 360,
      actualMinutes: 300,
      isPlanned: true,
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
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 120,
      actualMinutes: 115,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 120,
      actualMinutes: 120,
      isPlanned: true,
    },
  ],
  dailyPoints: [
    { label: '午前', budgetMinutes: 180, actualMinutes: 150 },
    { label: '昼', budgetMinutes: 120, actualMinutes: 140 },
    { label: '午後', budgetMinutes: 180, actualMinutes: 200 },
    { label: '夜', budgetMinutes: 60, actualMinutes: 40 },
  ],
};

/** 月次: 低精度 */
export const MOCK_MONTH_POOR: TimePLInput = {
  period: {
    granularity: 'month',
    label: '2026年3月',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
  },
  availableMinutes: 29760, // 16h × 31
  tags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      budgetMinutes: 3840,
      actualMinutes: 2400,
      isPlanned: true,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 1920,
      actualMinutes: 1680,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 1440,
      actualMinutes: 480,
      isPlanned: true,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      budgetMinutes: 1440,
      actualMinutes: 1200,
      isPlanned: true,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      budgetMinutes: 960,
      actualMinutes: 480,
      isPlanned: true,
    },
  ],
};

/** 計画外エントリー含む */
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
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 480,
      actualMinutes: 540,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 480,
      actualMinutes: 360,
      isPlanned: true,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      budgetMinutes: 480,
      actualMinutes: 300,
      isPlanned: true,
    },
    {
      tagId: '6',
      tagName: '障害対応',
      tagColor: 'red',
      tagIcon: 'alert-triangle',
      budgetMinutes: 0,
      actualMinutes: 360,
      isPlanned: false,
    },
    {
      tagId: '7',
      tagName: '雑務',
      tagColor: 'pink',
      tagIcon: null,
      budgetMinutes: 0,
      actualMinutes: 180,
      isPlanned: false,
    },
  ],
  dailyPoints: [
    { label: '月', budgetMinutes: 480, actualMinutes: 420 },
    { label: '火', budgetMinutes: 480, actualMinutes: 480 },
    { label: '水', budgetMinutes: 480, actualMinutes: 600 },
    { label: '木', budgetMinutes: 480, actualMinutes: 420 },
    { label: '金', budgetMinutes: 480, actualMinutes: 540 },
    { label: '土', budgetMinutes: 60, actualMinutes: 120 },
    { label: '日', budgetMinutes: 0, actualMinutes: 60 },
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
    },
  ],
};

/** 多忙な週（負債比率が高い） */
export const MOCK_WEEK_BUSY: TimePLInput = {
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
      budgetMinutes: 1920,
      actualMinutes: 1800,
      isPlanned: true,
    },
    {
      tagId: '2',
      tagName: 'Meeting',
      tagColor: 'amber',
      tagIcon: 'users',
      budgetMinutes: 1440,
      actualMinutes: 1200,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 480,
      actualMinutes: 360,
      isPlanned: true,
    },
    {
      tagId: '4',
      tagName: 'Admin',
      tagColor: 'gray',
      tagIcon: 'folder',
      budgetMinutes: 960,
      actualMinutes: 720,
      isPlanned: true,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      budgetMinutes: 480,
      actualMinutes: 240,
      isPlanned: true,
    },
    {
      tagId: '6',
      tagName: '障害対応',
      tagColor: 'red',
      tagIcon: 'alert-triangle',
      budgetMinutes: 0,
      actualMinutes: 480,
      isPlanned: false,
    },
  ],
};

/** 余裕のある週（資本が厚い） */
export const MOCK_WEEK_LIGHT: TimePLInput = {
  period: {
    granularity: 'week',
    label: '3/18（月）– 3/24（日）',
    startDate: '2026-03-18',
    endDate: '2026-03-24',
  },
  availableMinutes: 6720,
  tags: [
    {
      tagId: '1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      tagIcon: 'brain',
      budgetMinutes: 360,
      actualMinutes: 480,
      isPlanned: true,
    },
    {
      tagId: '3',
      tagName: 'Learning',
      tagColor: 'green',
      tagIcon: 'book-open',
      budgetMinutes: 240,
      actualMinutes: 300,
      isPlanned: true,
    },
    {
      tagId: '5',
      tagName: 'Exercise',
      tagColor: 'teal',
      tagIcon: 'heart-pulse',
      budgetMinutes: 120,
      actualMinutes: 180,
      isPlanned: true,
    },
  ],
};
