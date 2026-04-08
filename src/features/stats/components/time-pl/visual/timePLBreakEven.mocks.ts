/**
 * Break-Even Chart Mock Data
 */

import type { TimePLBreakEvenData } from './timePLBreakEven.types';

/** 週次: 水曜で損益分岐、最終的に予算超過 */
export const MOCK_BE_WEEK_CROSSOVER: TimePLBreakEvenData = {
  period: { granularity: 'week', label: '4/1（月）– 4/7（日）' },
  points: [
    {
      label: '月',
      budgetMinutes: 480,
      actualMinutes: 360,
      cumulativeBudget: 480,
      cumulativeActual: 360,
    },
    {
      label: '火',
      budgetMinutes: 480,
      actualMinutes: 420,
      cumulativeBudget: 960,
      cumulativeActual: 780,
    },
    {
      label: '水',
      budgetMinutes: 480,
      actualMinutes: 540,
      cumulativeBudget: 1440,
      cumulativeActual: 1320,
    },
    {
      label: '木',
      budgetMinutes: 480,
      actualMinutes: 540,
      cumulativeBudget: 1920,
      cumulativeActual: 1860,
    },
    {
      label: '金',
      budgetMinutes: 480,
      actualMinutes: 510,
      cumulativeBudget: 2400,
      cumulativeActual: 2370,
    },
    {
      label: '土',
      budgetMinutes: 120,
      actualMinutes: 180,
      cumulativeBudget: 2520,
      cumulativeActual: 2550,
    },
    {
      label: '日',
      budgetMinutes: 60,
      actualMinutes: 90,
      cumulativeBudget: 2580,
      cumulativeActual: 2640,
    },
  ],
  budgetTotal: 2580,
  actualTotal: 2640,
  breakEvenIndex: 5,
  accuracyRate: 0.977,
  accuracyStatus: 'excellent',
};

/** 週次: 実績が常に予算以下（余裕ゾーンのみ） */
export const MOCK_BE_WEEK_UNDER: TimePLBreakEvenData = {
  period: { granularity: 'week', label: '3/25（月）– 3/31（日）' },
  points: [
    {
      label: '月',
      budgetMinutes: 480,
      actualMinutes: 420,
      cumulativeBudget: 480,
      cumulativeActual: 420,
    },
    {
      label: '火',
      budgetMinutes: 480,
      actualMinutes: 390,
      cumulativeBudget: 960,
      cumulativeActual: 810,
    },
    {
      label: '水',
      budgetMinutes: 480,
      actualMinutes: 360,
      cumulativeBudget: 1440,
      cumulativeActual: 1170,
    },
    {
      label: '木',
      budgetMinutes: 480,
      actualMinutes: 300,
      cumulativeBudget: 1920,
      cumulativeActual: 1470,
    },
    {
      label: '金',
      budgetMinutes: 480,
      actualMinutes: 360,
      cumulativeBudget: 2400,
      cumulativeActual: 1830,
    },
    {
      label: '土',
      budgetMinutes: 120,
      actualMinutes: 60,
      cumulativeBudget: 2520,
      cumulativeActual: 1890,
    },
    {
      label: '日',
      budgetMinutes: 60,
      actualMinutes: 0,
      cumulativeBudget: 2580,
      cumulativeActual: 1890,
    },
  ],
  budgetTotal: 2580,
  actualTotal: 1890,
  breakEvenIndex: null,
  accuracyRate: 0.733,
  accuracyStatus: 'fair',
};

/** 週次: 実績が常に予算超過（超過ゾーンのみ） */
export const MOCK_BE_WEEK_OVER: TimePLBreakEvenData = {
  period: { granularity: 'week', label: '3/18（月）– 3/24（日）' },
  points: [
    {
      label: '月',
      budgetMinutes: 360,
      actualMinutes: 480,
      cumulativeBudget: 360,
      cumulativeActual: 480,
    },
    {
      label: '火',
      budgetMinutes: 360,
      actualMinutes: 510,
      cumulativeBudget: 720,
      cumulativeActual: 990,
    },
    {
      label: '水',
      budgetMinutes: 360,
      actualMinutes: 480,
      cumulativeBudget: 1080,
      cumulativeActual: 1470,
    },
    {
      label: '木',
      budgetMinutes: 360,
      actualMinutes: 450,
      cumulativeBudget: 1440,
      cumulativeActual: 1920,
    },
    {
      label: '金',
      budgetMinutes: 360,
      actualMinutes: 420,
      cumulativeBudget: 1800,
      cumulativeActual: 2340,
    },
    {
      label: '土',
      budgetMinutes: 60,
      actualMinutes: 180,
      cumulativeBudget: 1860,
      cumulativeActual: 2520,
    },
    {
      label: '日',
      budgetMinutes: 0,
      actualMinutes: 120,
      cumulativeBudget: 1860,
      cumulativeActual: 2640,
    },
  ],
  budgetTotal: 1860,
  actualTotal: 2640,
  breakEvenIndex: null,
  accuracyRate: 0.581,
  accuracyStatus: 'poor',
};

/** 月次: 複数回交差 */
export const MOCK_BE_MONTH: TimePLBreakEvenData = (() => {
  const dailyBudget = [
    300, 300, 300, 300, 300, 60, 0, 300, 300, 300, 300, 300, 60, 0, 300, 300, 300, 300, 300, 60, 0,
    300, 300, 300, 300, 300, 60, 0, 300, 300, 300,
  ];
  const dailyActual = [
    240, 360, 270, 330, 300, 120, 0, 180, 420, 300, 360, 240, 0, 60, 300, 300, 360, 240, 300, 90, 0,
    360, 240, 300, 330, 270, 0, 60, 300, 360, 240,
  ];

  let cumBudget = 0;
  let cumActual = 0;
  const points = dailyBudget.map((b, i) => {
    cumBudget += b;
    cumActual += dailyActual[i] ?? 0;
    return {
      label: `${i + 1}`,
      budgetMinutes: b,
      actualMinutes: dailyActual[i] ?? 0,
      cumulativeBudget: cumBudget,
      cumulativeActual: cumActual,
    };
  });

  // 最初の交差点を見つける
  let breakEvenIndex: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const prevDiff = prev.cumulativeBudget - prev.cumulativeActual;
    const currDiff = curr.cumulativeBudget - curr.cumulativeActual;
    if (prevDiff * currDiff < 0) {
      breakEvenIndex = i;
      break;
    }
  }

  return {
    period: { granularity: 'month' as const, label: '2026年3月' },
    points,
    budgetTotal: cumBudget,
    actualTotal: cumActual,
    breakEvenIndex,
    accuracyRate: 0.94,
    accuracyStatus: 'good' as const,
  };
})();

/** 日次: 時間帯別（1日を4分割） */
export const MOCK_BE_DAY: TimePLBreakEvenData = {
  period: { granularity: 'day', label: '4/8（火）' },
  points: [
    {
      label: '午前',
      budgetMinutes: 180,
      actualMinutes: 150,
      cumulativeBudget: 180,
      cumulativeActual: 150,
    },
    {
      label: '昼',
      budgetMinutes: 120,
      actualMinutes: 140,
      cumulativeBudget: 300,
      cumulativeActual: 290,
    },
    {
      label: '午後',
      budgetMinutes: 180,
      actualMinutes: 200,
      cumulativeBudget: 480,
      cumulativeActual: 490,
    },
    {
      label: '夜',
      budgetMinutes: 60,
      actualMinutes: 40,
      cumulativeBudget: 540,
      cumulativeActual: 530,
    },
  ],
  budgetTotal: 540,
  actualTotal: 530,
  breakEvenIndex: 2,
  accuracyRate: 0.981,
  accuracyStatus: 'excellent',
};
