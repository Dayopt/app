import { describe, expect, it } from 'vitest';

import { formatVariance, getAccuracyColors, getVarianceColor } from './timePL.presentation';

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
    expect(getAccuracyColors('excellent')).toEqual({ bg: 'bg-success-tint', text: 'text-success' });
    expect(getAccuracyColors('good')).toEqual({ bg: 'bg-success-tint', text: 'text-success' });
    expect(getAccuracyColors('fair')).toEqual({ bg: 'bg-warning-tint', text: 'text-warning' });
    expect(getAccuracyColors('poor')).toEqual({
      bg: 'bg-destructive-tint',
      text: 'text-destructive',
    });
  });
});
