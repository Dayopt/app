/**
 * Balance Sheet Mock Data
 *
 * 可処分時間 = 16h/日（6:00–22:00）
 * 週次: 16h × 7 = 112h = 6720分
 * 日次: 16h = 960分
 */

import type { TimePLBalanceSheetData } from './timePLBalanceSheet.types';

/** 週次: バランスの取れた標準的な週 */
export const MOCK_BS_WEEK_BALANCED: TimePLBalanceSheetData = {
  period: {
    granularity: 'week',
    label: '4/1（月）– 4/7（日）',
    startDate: '2026-04-01',
    endDate: '2026-04-07',
  },
  availableMinutes: 6720,
  assets: {
    label: '資産（実績）',
    totalMinutes: 6720,
    sections: [
      {
        label: '記録済み時間',
        totalMinutes: 2160,
        rows: [
          {
            tagId: '1',
            tagName: 'Deep Work',
            tagColor: 'blue',
            tagIcon: 'brain',
            minutes: 1080,
            percentage: 50,
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
            minutes: 180,
            percentage: 8,
          },
        ],
      },
      {
        label: '空白時間',
        totalMinutes: 4560,
        rows: [],
      },
    ],
  },
  liabilitiesAndEquity: {
    label: '負債＋資本（計画）',
    totalMinutes: 6720,
    sections: [
      {
        label: '予定時間（負債）',
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
      {
        label: '自由時間（資本）',
        totalMinutes: 4320,
        rows: [],
      },
    ],
  },
  isBalanced: true,
};

/** 週次: 予定で埋まっている（負債比率が高い） */
export const MOCK_BS_WEEK_BUSY: TimePLBalanceSheetData = {
  period: {
    granularity: 'week',
    label: '3/25（月）– 3/31（日）',
    startDate: '2026-03-25',
    endDate: '2026-03-31',
  },
  availableMinutes: 6720,
  assets: {
    label: '資産（実績）',
    totalMinutes: 6720,
    sections: [
      {
        label: '記録済み時間',
        totalMinutes: 4800,
        rows: [
          {
            tagId: '1',
            tagName: 'Deep Work',
            tagColor: 'blue',
            tagIcon: 'brain',
            minutes: 1800,
            percentage: 38,
          },
          {
            tagId: '2',
            tagName: 'Meeting',
            tagColor: 'amber',
            tagIcon: 'users',
            minutes: 1200,
            percentage: 25,
          },
          {
            tagId: '3',
            tagName: 'Learning',
            tagColor: 'green',
            tagIcon: 'book-open',
            minutes: 360,
            percentage: 8,
          },
          {
            tagId: '4',
            tagName: 'Admin',
            tagColor: 'gray',
            tagIcon: 'folder',
            minutes: 720,
            percentage: 15,
          },
          {
            tagId: '5',
            tagName: 'Exercise',
            tagColor: 'teal',
            tagIcon: 'heart-pulse',
            minutes: 240,
            percentage: 5,
          },
          {
            tagId: '6',
            tagName: '障害対応',
            tagColor: 'red',
            tagIcon: 'alert-triangle',
            minutes: 480,
            percentage: 10,
          },
        ],
      },
      {
        label: '空白時間',
        totalMinutes: 1920,
        rows: [],
      },
    ],
  },
  liabilitiesAndEquity: {
    label: '負債＋資本（計画）',
    totalMinutes: 6720,
    sections: [
      {
        label: '予定時間（負債）',
        totalMinutes: 5280,
        rows: [
          {
            tagId: '1',
            tagName: 'Deep Work',
            tagColor: 'blue',
            tagIcon: 'brain',
            minutes: 1920,
            percentage: 36,
          },
          {
            tagId: '2',
            tagName: 'Meeting',
            tagColor: 'amber',
            tagIcon: 'users',
            minutes: 1440,
            percentage: 27,
          },
          {
            tagId: '3',
            tagName: 'Learning',
            tagColor: 'green',
            tagIcon: 'book-open',
            minutes: 480,
            percentage: 9,
          },
          {
            tagId: '4',
            tagName: 'Admin',
            tagColor: 'gray',
            tagIcon: 'folder',
            minutes: 960,
            percentage: 18,
          },
          {
            tagId: '5',
            tagName: 'Exercise',
            tagColor: 'teal',
            tagIcon: 'heart-pulse',
            minutes: 480,
            percentage: 9,
          },
        ],
      },
      {
        label: '自由時間（資本）',
        totalMinutes: 1440,
        rows: [],
      },
    ],
  },
  isBalanced: true,
};

/** 週次: 予定が少ない（資本が厚い） */
export const MOCK_BS_WEEK_LIGHT: TimePLBalanceSheetData = {
  period: {
    granularity: 'week',
    label: '3/18（月）– 3/24（日）',
    startDate: '2026-03-18',
    endDate: '2026-03-24',
  },
  availableMinutes: 6720,
  assets: {
    label: '資産（実績）',
    totalMinutes: 6720,
    sections: [
      {
        label: '記録済み時間',
        totalMinutes: 960,
        rows: [
          {
            tagId: '1',
            tagName: 'Deep Work',
            tagColor: 'blue',
            tagIcon: 'brain',
            minutes: 480,
            percentage: 50,
          },
          {
            tagId: '3',
            tagName: 'Learning',
            tagColor: 'green',
            tagIcon: 'book-open',
            minutes: 300,
            percentage: 31,
          },
          {
            tagId: '5',
            tagName: 'Exercise',
            tagColor: 'teal',
            tagIcon: 'heart-pulse',
            minutes: 180,
            percentage: 19,
          },
        ],
      },
      {
        label: '空白時間',
        totalMinutes: 5760,
        rows: [],
      },
    ],
  },
  liabilitiesAndEquity: {
    label: '負債＋資本（計画）',
    totalMinutes: 6720,
    sections: [
      {
        label: '予定時間（負債）',
        totalMinutes: 720,
        rows: [
          {
            tagId: '1',
            tagName: 'Deep Work',
            tagColor: 'blue',
            tagIcon: 'brain',
            minutes: 360,
            percentage: 50,
          },
          {
            tagId: '3',
            tagName: 'Learning',
            tagColor: 'green',
            tagIcon: 'book-open',
            minutes: 240,
            percentage: 33,
          },
          {
            tagId: '5',
            tagName: 'Exercise',
            tagColor: 'teal',
            tagIcon: 'heart-pulse',
            minutes: 120,
            percentage: 17,
          },
        ],
      },
      {
        label: '自由時間（資本）',
        totalMinutes: 6000,
        rows: [],
      },
    ],
  },
  isBalanced: true,
};

/** 日次ビュー */
export const MOCK_BS_DAY: TimePLBalanceSheetData = {
  period: {
    granularity: 'day',
    label: '4/8（火）',
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  },
  availableMinutes: 960,
  assets: {
    label: '資産（実績）',
    totalMinutes: 960,
    sections: [
      {
        label: '記録済み時間',
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
      {
        label: '空白時間',
        totalMinutes: 490,
        rows: [],
      },
    ],
  },
  liabilitiesAndEquity: {
    label: '負債＋資本（計画）',
    totalMinutes: 960,
    sections: [
      {
        label: '予定時間（負債）',
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
      {
        label: '自由時間（資本）',
        totalMinutes: 480,
        rows: [],
      },
    ],
  },
  isBalanced: true,
};
