import { describe, expect, it } from 'vitest';

import {
  formatMinutesDuration,
  formatVariance,
  getAccuracyColors,
  getVarianceColor,
} from '../timePL.presentation';

describe('formatMinutesDuration', () => {
  // 共通入力テーブル（整数）— lib/date の canonical formatDurationMinutes へ統合後も
  // この出力を維持する（表示を変えない）。
  it.each([
    [0, '0m'],
    [1, '1m'],
    [45, '45m'],
    [59, '59m'],
    [60, '1h'],
    [61, '1h 1m'],
    [90, '1h 30m'],
    [119, '1h 59m'],
    [120, '2h'],
    [150, '2h 30m'],
    [1439, '23h 59m'],
  ])('%i分 → %s', (input, expected) => {
    expect(formatMinutesDuration(input)).toBe(expected);
  });
});

describe('formatVariance', () => {
  it('formats with sign', () => {
    expect(formatVariance(90)).toBe('+1h 30m');
    expect(formatVariance(-45)).toBe('-45m');
    expect(formatVariance(0)).toBe('±0');
  });

  it('符号付きで境界値をフォーマット', () => {
    expect(formatVariance(60)).toBe('+1h');
    expect(formatVariance(-60)).toBe('-1h');
    expect(formatVariance(1)).toBe('+1m');
    expect(formatVariance(-119)).toBe('-1h 59m');
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

describe('getAccuracyColors', () => {
  it('maps status to bg/text classes', () => {
    expect(getAccuracyColors('excellent')).toEqual({ bg: 'bg-success/10', text: 'text-success' });
    expect(getAccuracyColors('good')).toEqual({ bg: 'bg-success/10', text: 'text-success' });
    expect(getAccuracyColors('fair')).toEqual({ bg: 'bg-warning/10', text: 'text-warning' });
    expect(getAccuracyColors('poor')).toEqual({
      bg: 'bg-destructive/10',
      text: 'text-destructive',
    });
  });
});
