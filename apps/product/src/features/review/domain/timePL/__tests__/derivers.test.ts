import { describe, expect, it } from 'vitest';

import {
  MOCK_DAY_EXCELLENT,
  MOCK_MINIMAL,
  MOCK_WEEK_GOOD,
  MOCK_WITH_UNPLANNED,
} from '../../../components/time-pl/data/timePL.mocks';
import {
  deriveAccuracy,
  deriveBarComparison,
  deriveStatement,
  getAccuracyStatus,
} from '../derivers';

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
