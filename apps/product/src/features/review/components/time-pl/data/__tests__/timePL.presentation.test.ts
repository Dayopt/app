import { describe, expect, it } from 'vitest';

import {
  formatMinutesDuration,
  formatVariance,
  getAccuracyColors,
  getVarianceColor,
} from '../timePL.presentation';

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
