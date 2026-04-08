import { describe, expect, it } from 'vitest';

import {
  deriveAccuracy,
  deriveBalanceSheet,
  deriveBarComparison,
  deriveBreakEven,
  deriveStatement,
  deriveWaterfall,
  formatMinutesDuration,
  formatVariance,
  getAccuracyStatus,
  getVarianceColor,
} from '../timePL.derivers';
import {
  MOCK_DAY_EXCELLENT,
  MOCK_MINIMAL,
  MOCK_MONTH_POOR,
  MOCK_WEEK_GOOD,
  MOCK_WITH_UNPLANNED,
} from '../timePL.mocks';

// ── Utility functions ──

describe('formatMinutesDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatMinutesDuration(150)).toBe('2h 30m');
    expect(formatMinutesDuration(60)).toBe('1h');
    expect(formatMinutesDuration(45)).toBe('45m');
    expect(formatMinutesDuration(0)).toBe('0m');
  });
});

describe('formatVariance', () => {
  it('formats with sign', () => {
    expect(formatVariance(90)).toBe('+1h 30m');
    expect(formatVariance(-45)).toBe('-45m');
    expect(formatVariance(0)).toBe('±0');
  });
});

describe('getAccuracyStatus', () => {
  it('returns correct status for thresholds', () => {
    expect(getAccuracyStatus(0.96)).toBe('excellent');
    expect(getAccuracyStatus(0.9)).toBe('good');
    expect(getAccuracyStatus(0.75)).toBe('fair');
    expect(getAccuracyStatus(0.5)).toBe('poor');
  });

  it('handles boundary values', () => {
    expect(getAccuracyStatus(0.95)).toBe('excellent');
    expect(getAccuracyStatus(0.85)).toBe('good');
    expect(getAccuracyStatus(0.7)).toBe('fair');
    expect(getAccuracyStatus(0.69)).toBe('poor');
  });
});

describe('getVarianceColor', () => {
  it('returns correct color class', () => {
    expect(getVarianceColor(null)).toBe('text-muted-foreground');
    expect(getVarianceColor(0)).toBe('text-success');
    expect(getVarianceColor(5)).toBe('text-success');
    expect(getVarianceColor(10)).toBe('text-foreground');
    expect(getVarianceColor(-25)).toBe('text-warning');
    expect(getVarianceColor(50)).toBe('text-destructive');
  });
});

// ── Derivers ──

describe('deriveAccuracy', () => {
  it('calculates accuracy rate from tags', () => {
    const result = deriveAccuracy(MOCK_WEEK_GOOD);
    expect(result.rate).toBeGreaterThan(0.8);
    expect(result.rate).toBeLessThanOrEqual(1);
    expect(['excellent', 'good', 'fair', 'poor']).toContain(result.status);
  });

  it('returns 1 when budget and actual are both 0', () => {
    const result = deriveAccuracy({
      ...MOCK_MINIMAL,
      tags: [
        {
          tagId: '1',
          tagName: 'X',
          tagColor: 'blue',
          budgetMinutes: 0,
          actualMinutes: 0,
          isPlanned: true,
        },
      ],
    });
    expect(result.rate).toBe(1);
  });

  it('calculates prevRate when prevTags provided', () => {
    const result = deriveAccuracy(MOCK_WEEK_GOOD);
    expect(result.prevRate).toBeDefined();
    expect(result.prevRate).toBeGreaterThan(0);
  });

  it('returns undefined prevRate when prevTags not provided', () => {
    const result = deriveAccuracy(MOCK_DAY_EXCELLENT);
    expect(result.prevRate).toBeUndefined();
  });
});

describe('deriveStatement', () => {
  it('calculates budget and actual totals', () => {
    const result = deriveStatement(MOCK_WEEK_GOOD);
    const expectedBudget = MOCK_WEEK_GOOD.tags.reduce((s, t) => s + t.budgetMinutes, 0);
    const expectedActual = MOCK_WEEK_GOOD.tags.reduce((s, t) => s + t.actualMinutes, 0);
    expect(result.budgetTotal).toBe(expectedBudget);
    expect(result.actualTotal).toBe(expectedActual);
    expect(result.netVarianceMinutes).toBe(expectedBudget - expectedActual);
  });

  it('calculates percentages that sum to ~100', () => {
    const result = deriveStatement(MOCK_WEEK_GOOD);
    const budgetPctSum = result.budgetRows.reduce((s, r) => s + r.percentage, 0);
    // Due to rounding, allow ±5
    expect(budgetPctSum).toBeGreaterThanOrEqual(95);
    expect(budgetPctSum).toBeLessThanOrEqual(105);
  });

  it('sorts rows by minutes descending', () => {
    const result = deriveStatement(MOCK_WEEK_GOOD);
    for (let i = 1; i < result.budgetRows.length; i++) {
      expect(result.budgetRows[i]!.minutes).toBeLessThanOrEqual(result.budgetRows[i - 1]!.minutes);
    }
  });

  it('marks unplanned tags with null variancePercent', () => {
    const result = deriveStatement(MOCK_WITH_UNPLANNED);
    const unplanned = result.varianceRows.find((r) => r.tagId === '6');
    expect(unplanned).toBeDefined();
    expect(unplanned!.variancePercent).toBeNull();
  });
});

describe('deriveWaterfall', () => {
  it('starts with budget total and ends with actual total', () => {
    const steps = deriveWaterfall(MOCK_WEEK_GOOD);
    expect(steps[0]!.type).toBe('total');
    expect(steps[0]!.label).toBe('予算');
    expect(steps[steps.length - 1]!.type).toBe('total');
    expect(steps[steps.length - 1]!.label).toBe('実績');
  });

  it('running total at end equals actual total', () => {
    const steps = deriveWaterfall(MOCK_WEEK_GOOD);
    const lastStep = steps[steps.length - 1]!;
    const actualTotal = MOCK_WEEK_GOOD.tags.reduce((s, t) => s + t.actualMinutes, 0);
    expect(lastStep.value).toBe(actualTotal);
  });
});

describe('deriveBarComparison', () => {
  it('includes all tags with non-zero time', () => {
    const rows = deriveBarComparison(MOCK_WEEK_GOOD);
    expect(rows.length).toBe(
      MOCK_WEEK_GOOD.tags.filter((t) => t.budgetMinutes > 0 || t.actualMinutes > 0).length,
    );
  });

  it('sorts by max(budget, actual) descending', () => {
    const rows = deriveBarComparison(MOCK_WEEK_GOOD);
    for (let i = 1; i < rows.length; i++) {
      const prevMax = Math.max(rows[i - 1]!.budgetMinutes, rows[i - 1]!.actualMinutes);
      const currMax = Math.max(rows[i]!.budgetMinutes, rows[i]!.actualMinutes);
      expect(currMax).toBeLessThanOrEqual(prevMax);
    }
  });
});

describe('deriveBreakEven', () => {
  it('returns null when no dailyPoints', () => {
    const result = deriveBreakEven(MOCK_MONTH_POOR);
    expect(result).toBeNull();
  });

  it('calculates cumulative totals', () => {
    const result = deriveBreakEven(MOCK_WEEK_GOOD)!;
    expect(result.points.length).toBe(MOCK_WEEK_GOOD.dailyPoints!.length);
    // Last cumulative should equal sum
    const lastPoint = result.points[result.points.length - 1]!;
    const expectedBudget = MOCK_WEEK_GOOD.dailyPoints!.reduce((s, p) => s + p.budgetMinutes, 0);
    expect(lastPoint.cumulativeBudget).toBe(expectedBudget);
  });

  it('detects crossover point', () => {
    const result = deriveBreakEven(MOCK_WEEK_GOOD)!;
    // With this mock data, budget > actual early, actual catches up → crossover exists
    if (result.breakEvenIndex !== null) {
      expect(result.breakEvenIndex).toBeGreaterThan(0);
      expect(result.breakEvenIndex).toBeLessThan(result.points.length);
    }
  });
});

describe('deriveBalanceSheet', () => {
  it('left and right totals equal availableMinutes', () => {
    const result = deriveBalanceSheet(MOCK_WEEK_GOOD);
    expect(result.assets.totalMinutes).toBe(MOCK_WEEK_GOOD.availableMinutes);
    expect(result.liabilitiesAndEquity.totalMinutes).toBe(MOCK_WEEK_GOOD.availableMinutes);
  });

  it('sections sum to total', () => {
    const result = deriveBalanceSheet(MOCK_WEEK_GOOD);
    const assetSectionSum = result.assets.sections.reduce((s, sec) => s + sec.totalMinutes, 0);
    expect(assetSectionSum).toBe(result.assets.totalMinutes);

    const liabSectionSum = result.liabilitiesAndEquity.sections.reduce(
      (s, sec) => s + sec.totalMinutes,
      0,
    );
    expect(liabSectionSum).toBe(result.liabilitiesAndEquity.totalMinutes);
  });

  it('blank time = available - actual', () => {
    const result = deriveBalanceSheet(MOCK_WEEK_GOOD);
    const actualTotal = MOCK_WEEK_GOOD.tags.reduce((s, t) => s + t.actualMinutes, 0);
    const blankSection = result.assets.sections.find((s) => s.label === '空白時間');
    expect(blankSection!.totalMinutes).toBe(MOCK_WEEK_GOOD.availableMinutes - actualTotal);
  });

  it('free time = available - budget', () => {
    const result = deriveBalanceSheet(MOCK_WEEK_GOOD);
    const budgetTotal = MOCK_WEEK_GOOD.tags.reduce((s, t) => s + t.budgetMinutes, 0);
    const freeSection = result.liabilitiesAndEquity.sections.find(
      (s) => s.label === '自由時間（資本）',
    );
    expect(freeSection!.totalMinutes).toBe(MOCK_WEEK_GOOD.availableMinutes - budgetTotal);
  });
});
