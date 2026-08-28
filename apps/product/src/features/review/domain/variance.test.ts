import { describe, expect, it } from 'vitest';

import { computeVariance } from './variance';

describe('computeVariance', () => {
  it('budget > actual → positive varianceMinutes と切り上げ済み percent', () => {
    const result = computeVariance(120, 90, true);
    expect(result.varianceMinutes).toBe(30);
    expect(result.variancePercent).toBe(25);
  });

  it('budget < actual → negative varianceMinutes と negative percent', () => {
    const result = computeVariance(60, 90, true);
    expect(result.varianceMinutes).toBe(-30);
    expect(result.variancePercent).toBe(-50);
  });

  it('budget === actual → ±0 / 0%', () => {
    const result = computeVariance(60, 60, true);
    expect(result.varianceMinutes).toBe(0);
    expect(result.variancePercent).toBe(0);
  });

  it('isPlanned === false → variancePercent は null', () => {
    const result = computeVariance(0, 45, false);
    expect(result.varianceMinutes).toBe(-45);
    expect(result.variancePercent).toBeNull();
  });

  it('isPlanned === true かつ budgetMinutes === 0 → Math.max ガードで落ちずに計算される', () => {
    const result = computeVariance(0, 30, true);
    expect(result.varianceMinutes).toBe(-30);
    // -30 / Math.max(0, 1) = -30 → -30 * 100 = -3000
    expect(result.variancePercent).toBe(-3000);
  });

  it('端数 budget=100 actual=33 → variance=67, percent=67（rounding）', () => {
    const result = computeVariance(100, 33, true);
    expect(result.varianceMinutes).toBe(67);
    expect(result.variancePercent).toBe(67);
  });
});
